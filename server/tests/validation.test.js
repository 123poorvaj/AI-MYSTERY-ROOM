import { describe, expect, it } from 'vitest';
import { createSchema, validateCase } from '../src/validation.js';

function playableCase() {
  const suspects = ['suspect_1', 'suspect_2', 'suspect_3'].map((id, index) => ({
    id, name: `Suspect ${index + 1}`, role: 'Guest', motive: 'A personal stake in the incident',
    alibi: 'Was in the dining room', background: 'A long-time friend of the host'
  }));
  const evidence = Array.from({ length: 5 }, (_, index) => ({
    id: `evidence_${index + 1}`, type: 'document', title: `Record ${index + 1}`,
    description: 'A fictional record from the case.', content: { text: 'The entry was changed.' },
    suspectIds: ['suspect_1'], classification: 'clue'
  }));
  const timeline = Array.from({ length: 4 }, (_, index) => ({
    id: `event_${index + 1}`, timestamp: `2030-10-24T21:0${index}:00Z`,
    description: `A relevant event ${index + 1}.`, suspectIds: ['suspect_1'], evidenceIds: [`evidence_${index + 1}`]
  }));
  return {
    title: 'The Locked Observatory', summary: 'A chart vanished during a storm.', premise: 'A fictional case premise.',
    incident: { type: 'theft', description: 'A chart was stolen.', location: 'North Observatory', occurredAt: '2030-10-24T21:30:00Z' },
    suspects, evidence, timeline,
    solution: { culpritId: 'suspect_1', motive: 'To hide a discovery.', method: 'Swapped the chart.', opportunity: 'They had the only key.', reasoning: 'The changed entry and the recording agree.', keyEvidenceIds: ['evidence_1', 'evidence_2'] }
  };
}

describe('case creation input', () => {
  it('trims and accepts a valid premise with defaults', () => {
    const result = createSchema.parse({ premise: '  A theft during a storm at a remote hotel.  ' });
    expect(result.premise).toBe('A theft during a storm at a remote hotel.');
    expect(result.difficulty).toBe('medium');
    expect(result.suspectCount).toBe(4);
  });

  it('rejects short premises and out-of-range suspect counts', () => {
    expect(createSchema.safeParse({ premise: 'Too short' }).success).toBe(false);
    expect(createSchema.safeParse({ premise: 'A sufficiently long premise about an unusual theft.', suspectCount: 7 }).success).toBe(false);
  });
});

describe('generated case validation', () => {
  it('accepts a structurally consistent case with the requested number of suspects', () => {
    expect(validateCase(playableCase(), 3)).toEqual([]);
  });

  it('rejects duplicate IDs and references to missing evidence', () => {
    const value = playableCase();
    value.evidence[1].id = value.evidence[0].id;
    value.solution.keyEvidenceIds = ['evidence_1', 'missing'];
    expect(validateCase(value, 3).join(' ')).toMatch(/unique|existing evidence/);
  });

  it('rejects a culprit ID that does not belong to the suspect list', () => {
    const value = playableCase();
    value.solution.culpritId = 'unknown';
    expect(validateCase(value, 3)).toContain('culprit must reference a suspect');
  });
});
