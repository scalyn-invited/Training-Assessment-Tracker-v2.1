import { describe, expect, it } from 'vitest';
import {
  generationInput,
  validateGeneratedBlock,
} from '../packages/domain/src/programme-generation-contract.js';
import type { LearningBlock } from '../packages/domain/src/programme-content.js';
const block: LearningBlock = {
  number: 2,
  start: '2090-01-09',
  freeze_at: '2090-01-05T09:00:00Z',
  competency: 1,
  weight_one: 0.5,
  weight_two: 0.5,
  lessons: [
    { date: '2090-01-09', kpi: 1 },
    { date: '2090-01-10', kpi: 1 },
  ],
};
const input = generationInput(
  {
    profile: { current_role: 'Operator' },
    capability: { competencies: 'Safe practice\nCommunication' },
    assessment: { findings: 'Confirmed observations', kind: 'observed evidence' },
    schedule: { daily_minutes: 30 },
    measures: { kpis: [{ name: 'Quality' }, { name: 'Time' }, { name: 'Safety' }] },
    resources: {
      title: 'Reviewed handbook',
      reference: 'Internal handbook',
      id: 'untrusted override',
    },
  },
  'onboarding-id',
  block,
  1,
  'Focus on the reviewed examples',
);
function valid() {
  return {
    objective: 'Apply reviewed safe practice',
    prerequisites: 'Complete induction',
    prerequisite_block: 1,
    competency: 2,
    criterion_one: 'Demonstrate safe practice',
    criterion_two: 'Record objective evidence',
    weight_one: 0.5,
    weight_two: 0.5,
    lessons: input.dates.map((date) => ({
      date,
      title: 'Safe practice lesson',
      explanation: 'Read the reviewed method',
      example: 'Observe the worked example',
      activity: 'Demonstrate the method',
      tools: 'Use the approved handbook',
      completion: 'Record observed evidence',
      reading: 5,
      practice: 15,
      assessment: 5,
      revision: 5,
      kpi: 3,
      resource_id: input.resource.id,
    })),
  };
}
describe('source programme generation contract', () => {
  it('pins reviewed findings, dates, resource provenance and sequence', () => {
    expect(input.resource.id).toBe('onboarding-id:resource:1');
    expect(input.confirmed_findings).toBe('Confirmed observations');
    expect(input.dates).toEqual(block.lessons.map((l) => l.date));
    expect(input.output_shape.prerequisite_block).toBe(1);
    expect(validateGeneratedBlock(valid(), input)).toEqual(valid());
  });
  it.each([
    'date',
    'resource',
    'order',
    'count',
    'sequence',
    'competency',
    'kpi',
    'weight',
    'over-budget',
    'under-budget',
    'fraction',
    'negative',
    'blank',
    'short',
    'too-long',
    'unknown-block',
    'unknown-lesson',
  ])('rejects %s violations without modifying the source', (kind) => {
    const candidate = valid(),
      before = structuredClone(input);
    if (kind === 'date') candidate.lessons[0].date = '2090-01-11';
    if (kind === 'resource') candidate.lessons[0].resource_id = 'another resource';
    if (kind === 'order') candidate.lessons.reverse();
    if (kind === 'count') candidate.lessons.pop();
    if (kind === 'sequence') candidate.prerequisite_block = 0;
    if (kind === 'competency') candidate.competency = 3;
    if (kind === 'kpi') candidate.lessons[0].kpi = 4;
    if (kind === 'weight') candidate.weight_two = 0.6;
    if (kind === 'over-budget') candidate.lessons[0].revision = 6;
    if (kind === 'under-budget') {
      candidate.lessons[0].reading = 0;
      candidate.lessons[0].practice = 0;
    }
    if (kind === 'fraction') candidate.lessons[0].practice = 14.5;
    if (kind === 'negative') candidate.lessons[0].reading = -1;
    if (kind === 'blank') candidate.lessons[0].tools = '          ';
    if (kind === 'short') candidate.objective = 'short';
    if (kind === 'too-long') candidate.lessons[0].explanation = 'x'.repeat(8001);
    if (kind === 'unknown-block') Object.assign(candidate, { approve: true });
    if (kind === 'unknown-lesson') Object.assign(candidate.lessons[0], { execute: 'untrusted' });
    expect(() => validateGeneratedBlock(candidate, input)).toThrow('invalid_output');
    expect(input).toEqual(before);
  });
  it('accepts the budget boundaries and floating point weight tolerance', () => {
    const candidate = valid();
    candidate.weight_two = 0.5000001;
    expect(validateGeneratedBlock(candidate, input).lessons).toHaveLength(2);
    candidate.lessons.forEach((l) => {
      l.reading = 0;
      l.practice = 5;
    });
    expect(validateGeneratedBlock(candidate, input).lessons).toHaveLength(2);
  });
});
