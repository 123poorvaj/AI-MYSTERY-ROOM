import { z } from 'zod';

export const createSchema = z.object({
  premise: z.string().trim().min(20).max(1500),
  difficulty: z.enum(['easy','medium','hard']).default('medium'),
  mysteryType: z.enum(['theft','murder','disappearance','cybercrime','blackmail','general']).default('general'),
  suspectCount: z.coerce.number().int().min(3).max(6).default(4),
  setting: z.string().trim().max(120).optional().default(''),
  preferences: z.string().trim().max(500).optional().default('')
});
export const noteSchema = z.object({ notes: z.array(z.object({ id: z.string().min(1).max(60), text: z.string().trim().min(1).max(500) })).max(30) });
export const accusationSchema = z.object({ suspectId: z.string().min(1).max(80) });

export function validateCase(c, requestedCount) {
  const errors = [];
  const need = (v, path) => { if (v === undefined || v === null || v === '') errors.push(`${path} is required`); };
  if (!c || typeof c !== 'object') return ['case must be an object'];
  for (const field of ['title','summary','premise']) need(c[field], field);
  if (!c.incident) errors.push('incident is required');
  else for (const field of ['type','description','location','occurredAt']) need(c.incident[field], `incident.${field}`);
  if (!Array.isArray(c.suspects) || c.suspects.length !== requestedCount) errors.push('suspect count does not match request');
  if (!Array.isArray(c.evidence) || c.evidence.length < 5) errors.push('at least five evidence items are required');
  if (!Array.isArray(c.timeline) || c.timeline.length < 4) errors.push('at least four timeline events are required');
  const unique = (items, path) => { const ids=(items||[]).map(x=>x?.id); if(ids.some(x=>!x)||new Set(ids).size!==ids.length)errors.push(`${path} IDs must be unique`); };
  unique(c.suspects,'suspect'); unique(c.evidence,'evidence'); unique(c.timeline,'timeline');
  const suspectIds = new Set((c.suspects||[]).map(x=>x.id)); const evidenceIds = new Set((c.evidence||[]).map(x=>x.id));
  for (const [i,s] of (c.suspects||[]).entries()) for (const f of ['name','role','motive','alibi','background']) need(s[f],`suspects[${i}].${f}`);
  if (!suspectIds.has(c.solution?.culpritId)) errors.push('culprit must reference a suspect');
  for(const [i,e] of (c.evidence||[]).entries()){
    if(!['chat','image','cctv','document','witness'].includes(e.type)) errors.push(`evidence[${i}] has unsupported type`);
    if(!['clue','red-herring','contradiction','supporting'].includes(e.classification))errors.push(`evidence[${i}] has unsupported classification`);
    if(!e.title||!e.description||!e.content||typeof e.content!=='object')errors.push(`evidence[${i}] is incomplete`);
    for(const id of e.suspectIds||[])if(!suspectIds.has(id))errors.push(`evidence[${i}] references unknown suspect`);
  }
  for(const [i,t] of (c.timeline||[]).entries()){
    if(!Number.isFinite(Date.parse(t.timestamp)))errors.push(`timeline[${i}] has invalid timestamp`);
    for(const id of t.suspectIds||[])if(!suspectIds.has(id))errors.push(`timeline[${i}] references unknown suspect`);
    for(const id of t.evidenceIds||[])if(!evidenceIds.has(id))errors.push(`timeline[${i}] references unknown evidence`);
  }
  if(!c.solution || ['motive','method','opportunity','reasoning'].some(f=>!c.solution[f]))errors.push('solution is incomplete');
  if(!Array.isArray(c.solution?.keyEvidenceIds)||c.solution.keyEvidenceIds.length<2||c.solution.keyEvidenceIds.some(x=>!evidenceIds.has(x)))errors.push('solution must cite at least two existing evidence items');
  if((c.suspects||[]).some(x=>!x.id||!x.name))errors.push('suspect details are incomplete');
  return errors;
}
