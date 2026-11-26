import { describe, it, expect } from 'vitest';
import * as proposals from '../packages/domain/src/assessment-proposals.js';
export const sample = {
  format: 'assessment-proposals-v1',
  questions: [
    {
      reference: 'q1',
      type: 'multiple_choice',
      prompt: 'Choose a safe action.',
      choices: [
        { reference: 'a', text: 'Check first' },
        { reference: 'b', text: 'Guess' },
      ],
      correct_choice_reference: 'a',
    },
    {
      reference: 'q2',
      type: 'open_response',
      prompt: 'Explain your check.',
      choices: [],
      suggested_answer: 'Describe the safety check.',
    },
  ],
  rubric: {
    threshold: 70,
    criteria: [
      {
        reference: 'r1',
        category: 'Safety',
        label: 'Reasoning',
        guidance: 'Explain the check.',
        weight: 1,
      },
    ],
  },
};
describe('assessment proposal contract', () => {
  it.each([
    { ...sample, format: 'v2' },
    { ...sample, title: 'unexpected' },
    { ...sample, questions: [] },
    { ...sample, questions: Array(31).fill(sample.questions[0]) },
    { ...sample, questions: [sample.questions[0], sample.questions[0]] },
    { ...sample, questions: [{ ...sample.questions[0], prompt: '<img src=x>' }] },
    { ...sample, questions: [{ ...sample.questions[0], prompt: 'x'.repeat(4001) }] },
    { ...sample, questions: [{ ...sample.questions[0], correct_choice_reference: 'missing' }] },
    {
      ...sample,
      questions: [
        {
          ...sample.questions[0],
          choices: [sample.questions[0].choices[0], sample.questions[0].choices[0]],
        },
      ],
    },
    { ...sample, questions: [{ ...sample.questions[1], correct_choice_reference: 'a' }] },
    { ...sample, questions: [{ ...sample.questions[0], suggested_answer: 'unsupported' }] },
    { ...sample, rubric: { ...sample.rubric, threshold: 101 } },
    {
      ...sample,
      rubric: { ...sample.rubric, criteria: [{ ...sample.rubric.criteria[0], weight: 0.5 }] },
    },
  ])('rejects unsafe or invalid bounded proposals %#', (input) => {
    expect(() => proposals.parseAssessmentProposals(input)).toThrow();
  });
  it('accepts exact limits, optional proposed keys and a null rubric', () => {
    const choices = Array.from({ length: 30 }, (_, i) => ({
      reference: 'c' + i,
      text: 'x'.repeat(1000),
    }));
    const questions = Array.from({ length: 30 }, (_, i) => ({
      reference: 'q' + i,
      type: 'multiple_choice',
      prompt: 'x'.repeat(4000),
      choices,
    }));
    expect(
      proposals.parseAssessmentProposals({ format: sample.format, questions, rubric: null })
        .questions,
    ).toHaveLength(30);
  });
  it.each([
    {
      ...sample,
      questions: [
        {
          ...sample.questions[0],
          choices: Array.from({ length: 31 }, (_, i) => ({ reference: 'c' + i, text: 'Choice' })),
        },
      ],
    },
    {
      ...sample,
      questions: [
        {
          ...sample.questions[0],
          choices: [
            { reference: 'a', text: 'x'.repeat(1001) },
            { reference: 'b', text: 'B' },
          ],
        },
      ],
    },
    {
      ...sample,
      questions: [{ ...sample.questions[1], suggested_answer: '<script>alert(1)</script>' }],
    },
    { ...sample, questions: [{ ...sample.questions[1], prompt_html: '<p>HTML</p>' }] },
    { ...sample, questions: [{ ...sample.questions[1], prompt: 'bad\u0000control' }] },
    {
      ...sample,
      rubric: {
        ...sample.rubric,
        criteria: Array.from({ length: 31 }, (_, i) => ({
          ...sample.rubric.criteria[0],
          reference: 'c' + i,
          weight: 1 / 31,
        })),
      },
    },
    {
      ...sample,
      rubric: { ...sample.rubric, criteria: [{ ...sample.rubric.criteria[0], weight: 0 }] },
    },
    {
      ...sample,
      rubric: {
        ...sample.rubric,
        criteria: [
          { ...sample.rubric.criteria[0], weight: 0.5 },
          { ...sample.rubric.criteria[0], weight: 0.5 },
        ],
      },
    },
  ])('rejects nested limits and unexpected content %#', (input) =>
    expect(() => proposals.parseAssessmentProposals(input)).toThrow(),
  );
  it('accepts bounded versioned plain-text proposals without persisting them', () => {
    expect(proposals.parseAssessmentProposals(sample)).toEqual(sample);
  });
});
