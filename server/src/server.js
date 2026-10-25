import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setServers } from 'node:dns';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { MysteryCase, InvestigationSession } from './models.js';
import { accusationSchema, createSchema, noteSchema, validateCase } from './validation.js';
import { generateCase } from './gemini.js';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });
const configuredDnsServers = (process.env.MONGODB_DNS_SERVER || '').split(',').map((server) => server.trim()).filter(Boolean);
if (configuredDnsServers.length) {
  try {
    setServers(configuredDnsServers);
    console.log('Using configured DNS resolver for MongoDB SRV lookups.');
  } catch {
    console.error('MONGODB_DNS_SERVER is invalid; using the system DNS resolver.');
  }
}

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const clientOrigin = process.env.CLIENT_URL || (isProduction ? '' : 'http://localhost:5173');
app.disable('x-powered-by');
app.set('trust proxy', isProduction ? 1 : false);
app.use(helmet({ contentSecurityPolicy: { directives: {
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:']
} } }));
if (clientOrigin) app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());

const api = express.Router();
const generationLimit = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5,
  standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many case requests. Please try again later.' } }
});
const hash = (token) => createHash('sha256').update(token).digest('hex');
const failure = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });

function publicCase(c) {
  return {
    id: String(c._id), title: c.title, summary: c.summary, premise: c.premise,
    difficulty: c.settings.difficulty, mysteryType: c.settings.mysteryType,
    status: c.status, incident: c.incident, suspects: c.suspects,
    evidence: c.evidence,
    timeline: c.timeline, createdAt: c.createdAt
  };
}

function resolutionFor(c, correct) {
  const solution = c.solution;
  const culprit = c.suspects.find((suspect) => suspect.id === solution.culpritId);
  return {
    correct,
    culprit: { id: culprit.id, name: culprit.name, role: culprit.role },
    motive: solution.motive, method: solution.method,
    opportunity: solution.opportunity, reasoning: solution.reasoning,
    keyEvidence: c.evidence.filter((item) => solution.keyEvidenceIds.includes(item.id))
      .map(({ id, title, description }) => ({ id, title, description }))
  };
}

async function authorizedSession(req, res) {
  const token = req.cookies?.mystery_session;
  if (!token) { failure(res, 401, 'SESSION_REQUIRED', 'Your investigation session is missing. Reopen the case in the browser where it was created.'); return null; }
  const session = await InvestigationSession.findOne({ sessionTokenHash: hash(token) });
  if (!session) { failure(res, 401, 'SESSION_INVALID', 'This investigation session has expired or is invalid.'); return null; }
  return session;
}

api.post('/mysteries', generationLimit, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return failure(res, 400, 'VALIDATION_ERROR', 'Please provide a premise of 20–1,500 characters and valid case settings.');
    const input = parsed.data;
    let generated, diagnostics = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      generated = await generateCase(input);
      diagnostics = validateCase(generated, input.suspectCount);
      if (!diagnostics.length) break;
    }
    if (diagnostics.length) {
      console.warn('Rejected generated case:', diagnostics.slice(0, 8));
      return failure(res, 502, 'INVALID_GENERATED_CASE', 'The generated case did not pass consistency checks. Please retry.');
    }
    const record = await MysteryCase.create({
      title: generated.title, summary: generated.summary, premise: input.premise,
      settings: { difficulty: input.difficulty, mysteryType: input.mysteryType, suspectCount: input.suspectCount, setting: input.setting, preferences: input.preferences },
      incident: generated.incident, suspects: generated.suspects, timeline: generated.timeline,
      evidence: generated.evidence, solution: generated.solution, status: 'playable',
      generationMetadata: { model: process.env.GEMINI_MODEL || 'gemini-3.8-flash', validatedAt: new Date() }
    });
    const token = randomBytes(32).toString('base64url');
    const session = await InvestigationSession.create({ caseId: record._id, sessionTokenHash: hash(token) });
    res.cookie('mystery_session', token, {
      httpOnly: true, sameSite: 'lax', secure: process.env.SESSION_COOKIE_SECURE === 'true',
      maxAge: 30 * 24 * 60 * 60 * 1000, path: '/api/v1'
    });
    return res.status(201).json({ success: true, case: publicCase(record), session: { id: String(session._id) } });
  } catch (error) { return next(error); }
});

api.get('/mysteries/:caseId', async (req, res, next) => {
  try {
    const session = await authorizedSession(req, res);
    if (!session) return;
    if (!mongoose.isValidObjectId(req.params.caseId)) return failure(res, 404, 'NOT_FOUND', 'Case not found.');
    if (String(session.caseId) !== req.params.caseId) return failure(res, 403, 'FORBIDDEN', 'This session cannot access that case.');
    const c = await MysteryCase.findOne({ _id: req.params.caseId, status: 'playable' })
      .select(session.status === 'resolved' ? '+solution' : '');
    if (!c) return failure(res, 404, 'NOT_FOUND', 'Case not found.');
    const response = { success: true, case: publicCase(c), session: { id: String(session._id), notes: session.notes, status: session.status } };
    if (session.status === 'resolved') response.resolution = resolutionFor(c, session.accusation.correct);
    return res.json(response);
  } catch (error) { return next(error); }
});

api.get('/mysteries/:caseId/evidence/:evidenceId', async (req, res, next) => {
  try {
    const session = await authorizedSession(req, res);
    if (!session) return;
    if (String(session.caseId) !== req.params.caseId) return failure(res, 403, 'FORBIDDEN', 'This session cannot access that evidence.');
    const c = await MysteryCase.findById(req.params.caseId);
    const evidence = c?.evidence.find((item) => item.id === req.params.evidenceId);
    if (!evidence) return failure(res, 404, 'NOT_FOUND', 'Evidence not found.');
    await InvestigationSession.updateOne({ _id: session._id }, { $addToSet: { viewedEvidenceIds: evidence.id } });
    return res.json({ success: true, evidence });
  } catch (error) { return next(error); }
});

api.put('/sessions/:sessionId/notes', async (req, res, next) => {
  try {
    const session = await authorizedSession(req, res);
    if (!session) return;
    if (String(session._id) !== req.params.sessionId) return failure(res, 403, 'FORBIDDEN', 'This session cannot be changed.');
    if (session.status !== 'in_progress') return failure(res, 409, 'SESSION_RESOLVED', 'Resolved investigation notes are read-only.');
    const parsed = noteSchema.safeParse(req.body);
    if (!parsed.success) return failure(res, 400, 'VALIDATION_ERROR', 'Notes must contain at most 30 entries of up to 500 characters each.');
    session.notes = parsed.data.notes;
    await session.save();
    return res.json({ success: true, notes: session.notes });
  } catch (error) { return next(error); }
});

api.post('/sessions/:sessionId/accusation', async (req, res, next) => {
  try {
    const session = await authorizedSession(req, res);
    if (!session) return;
    if (String(session._id) !== req.params.sessionId) return failure(res, 403, 'FORBIDDEN', 'This session cannot be resolved.');
    if (session.status !== 'in_progress') return failure(res, 409, 'ALREADY_RESOLVED', 'This case has already been resolved.');
    const parsed = accusationSchema.safeParse(req.body);
    if (!parsed.success) return failure(res, 400, 'VALIDATION_ERROR', 'Choose a valid suspect.');
    const c = await MysteryCase.findById(session.caseId).select('+solution');
    if (!c) return failure(res, 404, 'NOT_FOUND', 'Case not found.');
    const selected = c.suspects.find((suspect) => suspect.id === parsed.data.suspectId);
    if (!selected) return failure(res, 400, 'INVALID_SUSPECT', 'That suspect is not part of this case.');
    const correct = selected.id === c.solution.culpritId;
    session.accusation = { suspectId: selected.id, correct };
    session.status = 'resolved';
    session.resolvedAt = new Date();
    await session.save();
    return res.json({ success: true, result: { correct, status: 'resolved' }, resolution: resolutionFor(c, correct) });
  } catch (error) { return next(error); }
});

const port = Number(process.env.PORT) || 5000;
const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
mongoose.set('bufferCommands', false);
let databaseReady = false;
mongoose.connection.on('connected', () => {
  databaseReady = true;
  console.log('MongoDB connected.');
});
mongoose.connection.on('disconnected', () => {
  databaseReady = false;
});

api.get('/health', (_req, res) => res.status(databaseReady ? 200 : (isProduction ? 503 : 200)).json({
  success: true,
  status: databaseReady ? 'ok' : 'degraded',
  services: { database: databaseReady ? 'connected' : 'unavailable' }
}));

app.use('/api/v1', api);
app.use('/api/v1', (_req, res) => failure(res, 404, 'NOT_FOUND', 'API endpoint not found.'));

if (isProduction && existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false }));
  app.get('*', (_req, res) => res.sendFile(resolve(clientDist, 'index.html')));
}
app.use((_req, res) => failure(res, 404, 'NOT_FOUND', 'Endpoint not found.'));
app.use((error, _req, res, _next) => {
  console.error('API error:', error?.message || 'unknown error');
  if (mongoose.connection.readyState !== 1) return failure(res, 503, 'DATABASE_UNAVAILABLE', 'The database is unavailable. Check the server connection and try again.');
  const status = error.status || (error.name === 'MongooseServerSelectionError' ? 503 : 500);
  return failure(res, status, error.code || 'INTERNAL_ERROR', status >= 500 && !error.status ? 'Service temporarily unavailable. Please try again.' : error.message);
});

if (isProduction && (!process.env.MONGODB_URI || !process.env.GEMINI_API_KEY)) {
  console.error('Production requires MONGODB_URI and GEMINI_API_KEY environment variables.');
  process.exit(1);
}

app.listen(port, '0.0.0.0', () => console.log(`AI Mystery Room API listening on ${port}`));

async function connectWithRetry() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ai_mystery_room';
  let delayMs = 2000;
  let attempts = 0;
  while (true) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      return;
    } catch (error) {
      databaseReady = false;
      attempts += 1;
      const reason = error.code || error.name || 'connection error';
      if (attempts === 1 || attempts % 5 === 0) {
        console.error(`MongoDB connection failed (${reason}); retry ${attempts}. Check MONGODB_URI, Atlas network access, and DNS/connectivity.`);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(Math.round(delayMs * 1.5), 30000);
    }
  }
}

void connectWithRetry();
