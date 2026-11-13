import {
  validateSupport,
  type AdaptationInput,
} from '../packages/domain/src/learning-support-contract.js';
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

const source = '00000000-0000-4000-8000-000000000001';
function request(): AdaptationInput {
  return {
    task: 'propose_adaptation',
    source_ids: [source],
    replacement: { ...block, ...valid() },
    contract: input,
    evidence: [],
  };
}
function output() {
  const r = request();
  r.replacement.lessons[0].activity = 'Practise the existing method with a reviewed checklist.';
  return {
    source_ids: [source],
    replacement: r.replacement,
    reason: 'Reviewed support within existing capacity',
  };
}
it('accepts teaching changes without changing the pinned input', () => {
  const before = request();
  expect(validateSupport('propose_adaptation', before, output())).toEqual(output());
  expect(before.replacement.lessons[0].activity).toBe('Demonstrate the method');
});
it.each([
  'date',
  'minutes',
  'criterion',
  'completion',
  'resource',
  'sequence',
  'competency',
  'kpi',
  'unknown',
  'sources',
  'short',
])('rejects %s changes', (kind) => {
  const o = output();
  if (kind === 'date') o.replacement.lessons[0].date = '2091-01-01';
  if (kind === 'minutes') o.replacement.lessons[0].practice = 10;
  if (kind === 'criterion') o.replacement.criterion_one = 'Different evidence requirement';
  if (kind === 'completion')
    o.replacement.lessons[0].completion = 'Different completion requirement';
  if (kind === 'resource') (o.replacement.lessons[0] as any).resource_id = 'other';
  if (kind === 'sequence') (o.replacement as any).prerequisite_block = 0;
  if (kind === 'competency') o.replacement.competency = 1;
  if (kind === 'kpi') o.replacement.lessons[0].kpi = 2;
  if (kind === 'unknown') (o.replacement as any).override = true;
  if (kind === 'sources') o.source_ids = [];
  if (kind === 'short') o.replacement.lessons[0].activity = 'short';
  expect(() => validateSupport('propose_adaptation', request(), o)).toThrow();
});
it('requires exact suggestion sources and bounded provisional actions', () => {
  const i = {
    task: 'suggest_kpi_actions' as const,
    source_ids: [source],
    evidence: [],
    daily_minutes: 30,
  };
  expect(
    validateSupport(i.task, i, {
      source_ids: [source],
      actions: ['Review the approved evidence.'],
    }),
  ).toEqual({ source_ids: [source], actions: ['Review the approved evidence.'] });
  for (const o of [
    { source_ids: [], actions: ['Review the approved evidence.'] },
    { source_ids: [source], actions: [] },
    { source_ids: [source], actions: ['short'] },
    { source_ids: [source], actions: ['Review the approved evidence.'], target: 0 },
  ])
    expect(() => validateSupport(i.task, i, o)).toThrow();
});
it('retains source rejection when rescheduled dates differ from the pinned original programme contract', () => {
  const r = request(),
    o = output();
  r.replacement.lessons[0].date = '2090-01-16';
  o.replacement.lessons[0].date = '2090-01-16';
  expect(() => validateSupport('propose_adaptation', r, o)).toThrow();
});
