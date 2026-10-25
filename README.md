# AI Mystery Room

An AI-powered detective game. Create a fictional premise, inspect connected evidence, take notes, and make one final accusation. Case generation, validation, persistence, and solution evaluation happen in the Express API.

## Requirements

- Node.js 20+
- MongoDB (local or hosted)
- A Google Gemini API key

## Run locally

1. Copy `.env.example` to `.env` and set `MONGODB_URI` and `GEMINI_API_KEY`. `GEMINI_MODEL` defaults to `gemini-3.8-flash` (a stable Gemini API model with structured-output support).
2. Install dependencies with `npm install`.
3. Start both apps with `npm run dev`.
4. Open http://localhost:5173. The API health endpoint is http://localhost:5000/api/v1/health.

Run the case-validation and frontend tests with `npm test`. Create a production client bundle with `npm run build`.

Set `SESSION_COOKIE_SECURE=true` behind HTTPS. Anonymous sessions use an HttpOnly, SameSite cookie and are not accounts; clearing the cookie loses access. The server stores only a hash of the session credential. Generated people, messages, and recordings are fictional. CCTV is a text simulation.

The API starts even if MongoDB is unreachable, retries the connection with increasing delays, and reports `status: degraded` at `/api/v1/health` until the database connects. If Node.js cannot resolve your Atlas SRV record while Windows DNS tools can, set the optional `MONGODB_DNS_SERVER` in `.env` to the DNS resolver address shown by `nslookup` (multiple servers can be comma-separated). Also check the Atlas hostname in `MONGODB_URI`, the Atlas IP access list, and network access. For local MongoDB, use `mongodb://127.0.0.1:27017/ai_mystery_room`.

## Deploy to Render

This repository includes a Render Blueprint (`render.yaml`) and multi-stage `Dockerfile`. The deployed Node service serves the built React app and `/api/v1` from the same origin, so no frontend API URL needs to be baked into the build.

1. Push this repository to GitHub.
2. In Render, create a **Blueprint** and select the repository. Render reads `render.yaml` and builds the Docker service.
3. Add the prompted `MONGODB_URI` and `GEMINI_API_KEY` values in Render. Use the rotated MongoDB database-user password in the URI; never commit these values.
4. Allow the Render service to reach your MongoDB Atlas cluster using the service’s outbound IP addresses in Atlas Network Access.
5. Deploy. Render checks `/api/v1/health`; it returns healthy only after MongoDB connects.

For local Docker builds, run `docker build -t ai-mystery-room .`, then supply `MONGODB_URI` and `GEMINI_API_KEY` when starting the container. Do not copy `.env` into the image.

## Architecture

`client/` is React/Vite. `server/` is Express/Mongoose. Gemini is called only from the server. Cases are schema and consistency checked before saving; public DTOs omit the canonical solution. Images use an explicitly labeled fallback because the MVP media pipeline supports text and simulated CCTV, not image generation.
