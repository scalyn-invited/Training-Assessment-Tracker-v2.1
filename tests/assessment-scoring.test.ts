import { it, expect } from 'vitest';
import { draft } from '../packages/domain/src/assessment-content.js';
import { scoreAssessment } from '../packages/domain/src/assessment-scoring.js';
import type { AssessmentSnapshot } from '../packages/domain/src/assessment-responses.js';
const snapshot = (): AssessmentSnapshot => ({
  ...draft({
    title: 'Pinned rubric',
    questions: [
      { id: 'written', type: 'open_response', prompt: 'Explain your evidence.' },
      {
        id: 'choice',
        type: 'multiple_choice',
        prompt: 'Choose.',
        choices: [
          { id: 'yes', text: 'Yes' },
          { id: 'no', text: 'No' },
        ],
      },
    ],
    answer_key: { choice: 'yes' },
    rubric: {
      threshold: 75,
      criteria: [
        {
          id: 'a',
          category: 'Practice',
          label: 'Analysis',
          guidance: 'Assess evidence.',
          weight: 0.25,
        },
        {
          id: 'b',
          category: 'Practice',
          label: 'Accuracy',
          guidance: 'Assess accuracy.',
          weight: 0.25,
        },
        {
          id: 'c',
          category: 'Communication',
          label: 'Clarity',
          guidance: 'Assess clarity.',
          weight: 0.5,
        },
      ],
    },
  }),
  definition_id: 'pinned-definition',
  revision: 3,
  objective_policy: 'equal-weight-v1',
  responses: { written: 'My explanation.', choice: 'yes' },
  context: null,
  files: [],
});
const result = () => ({
  rubric_id: 'pinned-definition',
  rubric_version: 3,
  criteria: ['a', 'b', 'c'].map((id, i) => ({
    id,
    score: [80, 60, 90][i],
    evidence_ids: ['attempt:written'],
    feedback: 'Evidence supports this judgment.',
    insufficient_evidence: false,
  })),
});
it('uses pinned weights and category denominators while keeping objective scoring separate', () => {
  const scored = scoreAssessment(snapshot(), result(), ['attempt:written']);
  expect(scored).toMatchObject({
    total: 80,
    categories: { Practice: 70, Communication: 90 },
    success: true,
    rubric_applicable: true,
    objective: { correct: 1, total: 1, percentage: 100, policy: 'equal-weight-v1' },
    rubric_version: 3,
  });
  expect(JSON.stringify(scored)).not.toContain('answer_key');
  const wrongChoice = snapshot();
  wrongChoice.responses.choice = 'no';
  expect(scoreAssessment(wrongChoice, result(), ['attempt:written'])).toMatchObject({
    total: 80,
    objective: { percentage: 0 },
  });
});
it('propagates insufficient evidence without inventing zero scores', () => {
  const data = result();
  data.criteria[0].insufficient_evidence = true;
  data.criteria[0].evidence_ids = [];
  const scored = scoreAssessment(snapshot(), data, ['attempt:written']);
  expect(scored).toMatchObject({
    total: null,
    success: null,
    categories: { Practice: null, Communication: 90 },
  });
  expect(scored.criteria[0].score).toBeNull();
  expect(data.criteria[0].score).toBe(80);
});
it('rejects wrong revisions, missing or duplicated criteria and unconfirmed evidence', () => {
  expect(() =>
    scoreAssessment(snapshot(), { ...result(), rubric_version: 2 }, ['attempt:written']),
  ).toThrow('Rubric version');
  const duplicated = result();
  duplicated.criteria[1].id = 'a';
  expect(() => scoreAssessment(snapshot(), duplicated, ['attempt:written'])).toThrow(
    'exactly once',
  );
  const unknown = result();
  unknown.criteria[1].id = 'other';
  expect(() => scoreAssessment(snapshot(), unknown, ['attempt:written'])).toThrow(
    'submitted rubric',
  );
  expect(() => scoreAssessment(snapshot(), result(), [])).toThrow('confirmed, unchanged');
  const empty = result();
  empty.criteria[0].evidence_ids = [];
  expect(() => scoreAssessment(snapshot(), empty, ['attempt:written'])).toThrow(
    'requires evidence',
  );
  expect(() =>
    scoreAssessment(snapshot(), { ...result(), criteria: [] }, ['attempt:written']),
  ).toThrow('exactly once');
});
it('bounds feedback and scores and accepts numeric form values without accepting arbitrary coercion', () => {
  const data = result();
  expect(
    scoreAssessment(
      snapshot(),
      { ...data, criteria: data.criteria.map((r) => ({ ...r, score: String(r.score) })) },
      ['attempt:written'],
    ).total,
  ).toBe(80);
  for (const score of [null, -1, 101, Infinity, NaN, '', true, '0x10'])
    expect(() =>
      scoreAssessment(
        snapshot(),
        { ...data, criteria: data.criteria.map((r) => ({ ...r, score })) },
        ['attempt:written'],
      ),
    ).toThrow();
  expect(() =>
    scoreAssessment(
      snapshot(),
      { ...data, criteria: data.criteria.map((r) => ({ ...r, feedback: ' ' })) },
      ['attempt:written'],
    ),
  ).toThrow();
  expect(() =>
    scoreAssessment(snapshot(), { ...data, unexpected: true }, ['attempt:written']),
  ).toThrow();
});
it('compares the unrounded total to threshold and preserves a missing threshold', () => {
  const input = snapshot(),
    data = result();
  input.rubric.threshold = 80.0001;
  expect(scoreAssessment(input, data, ['attempt:written']).success).toBe(false);
  input.rubric.threshold = null;
  expect(scoreAssessment(input, data, ['attempt:written'])).toMatchObject({
    total: 80,
    success: null,
  });
});
it('does not invent rubric grades for objective-only or reflective assessments', () => {
  const input = snapshot();
  input.questions = input.questions.filter((q) => q.type === 'multiple_choice');
  expect(scoreAssessment(input, {}, [])).toMatchObject({
    criteria: [],
    categories: {},
    total: null,
    success: null,
    rubric_applicable: false,
    objective: { percentage: 100 },
  });
  input.questions = [];
  expect(scoreAssessment(input, {}, []).objective).toBeNull();
});

it('counts feedback limits in Unicode characters like the source', () => {
  const data = result(),
    feedback = String.fromCodePoint(0x1f642).repeat(4000);
  const rows = data.criteria.map((row) => ({ ...row, feedback }));
  expect(scoreAssessment(snapshot(), { ...data, criteria: rows }, ['attempt:written']).total).toBe(
    80,
  );
  expect(() =>
    scoreAssessment(
      snapshot(),
      { ...data, criteria: rows.map((row) => ({ ...row, feedback: row.feedback + 'x' })) },
      ['attempt:written'],
    ),
  ).toThrow();
});
