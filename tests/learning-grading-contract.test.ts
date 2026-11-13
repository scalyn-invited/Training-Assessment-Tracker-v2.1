import { it, expect } from 'vitest';
import {
  validateLearningGrade,
  objectiveLearningGrade,
  learningGradingInput,
} from '../packages/domain/src/learning-grading-contract.js';
import type { SubmissionContent } from '../packages/domain/src/delivery.js';
const work: SubmissionContent = {
  body: 'Observed safe practice',
  files: ['file-1'],
  answers: [0, 1],
  rubric: {
    id: 'rubric',
    version: 2,
    criteria: [
      { id: 'safe', label: 'Safe method', weight: 0.3, maximum: 100, competency: 1 },
      { id: 'evidence', label: 'Evidence', weight: 0.7, maximum: 100, competency: 1 },
    ],
  },
  quiz_snapshot: {
    id: 'quiz',
    questions: [
      { id: '0', prompt: 'Safe method?', options: ['Check', 'Guess'], criterion_id: 'safe' },
      { id: '1', prompt: 'Evidence?', options: ['Recorded', 'Assumed'], criterion_id: 'evidence' },
    ],
    answer_key: { '0': 0, '1': 0 },
  },
};
function result() {
  return {
    rubric_id: 'rubric',
    rubric_version: 2,
    criteria: [
      {
        id: 'evidence',
        score: 80.125,
        evidence_ids: ['file-1'],
        feedback: 'Observed demonstration',
        insufficient_evidence: false,
      },
      {
        id: 'safe',
        score: 90,
        evidence_ids: ['submission:text'],
        feedback: 'Safe recorded method',
        insufficient_evidence: false,
      },
    ],
  };
}
it('computes weighted totals independently of criterion order and rounds to three decimals', () => {
  expect(validateLearningGrade(result(), 'submission', work).total).toBe(83.088);
});
it('keeps missing evidence nonnumeric even when other criteria have scores', () => {
  const r = result();
  r.criteria[0].insufficient_evidence = true;
  expect(validateLearningGrade(r, 'submission', work).total).toBeNull();
});
it('rejects stale rubric versions, replaced and duplicated criteria', () => {
  for (const mutate of [
    (r: ReturnType<typeof result>) => {
      r.rubric_version = 1;
    },
    (r: ReturnType<typeof result>) => {
      r.rubric_id = 'other';
    },
    (r: ReturnType<typeof result>) => {
      r.criteria[0].id = 'invented';
    },
    (r: ReturnType<typeof result>) => {
      r.criteria[0].id = 'safe';
    },
    (r: ReturnType<typeof result>) => {
      r.criteria.pop();
    },
  ]) {
    const r = result();
    mutate(r);
    expect(() => validateLearningGrade(r, 'submission', work)).toThrow();
  }
});
it('rejects invented evidence, score bounds, unknown properties and unverified value types', () => {
  for (const mutate of [
    (r: any) => {
      r.criteria[0].evidence_ids = ['another-submission:text'];
    },
    (r: any) => {
      r.criteria[0].score = 101;
    },
    (r: any) => {
      r.criteria[0].score = -1;
    },
    (r: any) => {
      r.criteria[0].score = NaN;
    },
    (r: any) => {
      r.criteria[0].score = '80';
    },
    (r: any) => {
      r.criteria[0].evidence_ids = [];
    },
    (r: any) => {
      r.criteria[0].feedback = ' ';
    },
    (r: any) => {
      r.criteria[0].insufficient_evidence = 'false';
    },
    (r: any) => {
      r.approved = true;
    },
  ]) {
    const r = result();
    mutate(r);
    expect(() => validateLearningGrade(r, 'submission', work)).toThrow();
  }
});
it('honours Unicode feedback length without rejecting valid supplementary characters', () => {
  const r = result();
  r.criteria[0].feedback = String.fromCodePoint(0x1f600).repeat(4000);
  expect(validateLearningGrade(r, 'submission', work).total).toBe(83.088);
  r.criteria[0].feedback += 'x';
  expect(() => validateLearningGrade(r, 'submission', work)).toThrow();
});
it('marks zero-index answers deterministically from the pinned key without approving anything', () => {
  const result = objectiveLearningGrade('submission', work);
  expect(result.criteria.map((c) => c.score)).toEqual([100, 0]);
  expect(validateLearningGrade(result, 'submission', work).total).toBe(30);
  expect(result).not.toHaveProperty('approved');
});
it('marks unanswered quiz criteria insufficient instead of an official zero', () => {
  const missing = { ...work, answers: [0, null] };
  const result = objectiveLearningGrade('submission', missing);
  expect(result.criteria[1].insufficient_evidence).toBe(true);
  expect(validateLearningGrade(result, 'submission', missing).total).toBeNull();
  expect(() => objectiveLearningGrade('submission', { ...work, quiz_snapshot: null })).toThrow();
});
it('supplies pinned text and rubric to grading while keeping file content explicitly unread', () => {
  const input = learningGradingInput('submission', work, 'Review only supplied evidence');
  expect(input.evidence).toEqual([{ id: 'submission:text', text: work.body }]);
  expect(input.unread_files).toEqual(['file-1']);
  expect(input.rubric).toEqual(work.rubric);
  expect(input).not.toHaveProperty('answer_key');
  expect(input).not.toHaveProperty('quiz_snapshot');
});
