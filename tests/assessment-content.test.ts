import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  draft,
  readiness,
  sanitize,
  mediaIds,
  matrixResponse,
  requiredMatrixErrors,
  objective,
} from '../packages/domain/src/assessment-content.js';
const base = () => ({
  title: 'Safety assessment',
  questions: [
    {
      id: 'q1',
      type: 'multiple_choice',
      prompt: 'Choose the safe response.',
      choices: [
        { id: 'a', text: 'Check first' },
        { id: 'b', text: 'Proceed blindly' },
      ],
    },
  ],
  answer_key: { q1: 'a' },
  rubric: { threshold: 75, criteria: [] },
});
describe('source assessment content rules', () => {
  it('permits incomplete drafts but blocks publication until ready', () => {
    const value = draft({
      title: null,
      questions: [{ id: 'open', prompt: null }],
      rubric: { threshold: null, criteria: [] },
    });
    expect(readiness(value)).toMatchObject({
      title: 'Add an assessment title.',
      criteria: 'Add scoring criteria for open responses.',
    });
    expect(readiness(draft(base()))).toEqual({});
  });
  it('removes executable rich text and remote or data images while retaining private media', () => {
    const id = randomUUID();
    const html = sanitize(
      '<p onclick="evil()">Hello <strong>world</strong><script>alert(1)</script><a href="javascript:evil()">bad</a><img src="https://remote.invalid/a.png"><img src="data:image/png;base64,aaaa"><img src="/assessments/media/' +
        id +
        '" onerror="evil()" alt="Diagram"></p>',
    );
    expect(html).not.toMatch(/onclick|script|onerror|javascript|https:|base64/);
    expect(html).toContain('/assessments/media/' + id);
    const input = base();
    const parsed = draft({ ...input, questions: [{ ...input.questions[0], prompt_html: html }] });
    expect(parsed.questions[0].prompt).toContain('Hello world');
    expect(mediaIds(parsed.questions)).toEqual([id]);
  });
  it('preserves stable references while reordering sections and rejects orphaned questions', () => {
    const input = base(),
      questions = [...input.questions, { ...input.questions[0], id: 'q2' }];
    const sections = [
      { id: randomUUID(), title: 'Second', instructions: '', question_ids: ['q2'] },
      { id: randomUUID(), title: 'First', instructions: '', question_ids: ['q1'] },
    ];
    expect(draft({ ...input, questions, sections }).questions.map((q) => q.id)).toEqual([
      'q2',
      'q1',
    ]);
    expect(() => draft({ ...input, questions, sections: sections.slice(0, 1) })).toThrow(
      'Every question',
    );
    expect(() =>
      draft({ ...input, questions, sections: [...sections, { ...sections[0], id: randomUUID() }] }),
    ).toThrow();
  });
  it('pins choice keys and validates scoring weights', () => {
    const input = base();
    expect(readiness(draft({ ...input, answer_key: { q1: 'deleted' } }))).toHaveProperty(
      'questions.0.correct',
    );
    const value = draft({
      ...input,
      questions: [{ id: 'open', prompt: 'Explain' }],
      rubric: {
        threshold: 75,
        criteria: [
          {
            id: 'c',
            category: 'Safety',
            label: 'Reasoning',
            guidance: 'Use supplied evidence',
            weight: 0.5,
          },
        ],
      },
    });
    expect(readiness(value)).toHaveProperty('criteria');
    expect(objective({ ...draft(input), responses: { q1: 'a' } })).toEqual({
      correct: 1,
      total: 1,
      percentage: 100,
      policy: 'equal-weight-v1',
    });
    expect(objective({ ...draft(input), responses: {} })?.percentage).toBe(0);
  });
  it('validates matrices against the assigned revision and does not treat notes as ratings', () => {
    const area = randomUUID(),
      yes = randomUUID(),
      no = randomUUID();
    const value = draft({
      title: 'Self reflection',
      questions: [
        {
          id: 'm',
          type: 'self_assessment',
          prompt: 'Reflect',
          matrix: {
            areas: [{ id: area, text: 'I check evidence' }],
            ratings: [
              { id: yes, text: 'Always' },
              { id: no, text: 'Never' },
            ],
            required: true,
            notes_enabled: true,
          },
        },
      ],
      rubric: { threshold: null, criteria: [] },
    });
    const q = value.questions[0];
    expect(readiness(value)).toEqual({});
    const note = matrixResponse(q, { [area]: { note: 'A note without a rating' } });
    expect(requiredMatrixErrors(value.questions, { m: note })).toHaveProperty(
      'responses.m.' + area + '.rating_id',
    );
    const response = matrixResponse(q, { [area]: { rating_id: yes, note: 'Supported' } });
    expect(requiredMatrixErrors(value.questions, { m: response })).toEqual({});
    expect(() => matrixResponse(q, { [area]: { rating_id: randomUUID() } })).toThrow(
      'assigned assessment revision',
    );
    expect(() => matrixResponse(q, { [randomUUID()]: { rating_id: yes } })).toThrow(
      'assigned assessment revision',
    );
    q.matrix!.notes_enabled = false;
    expect(() => matrixResponse(q, { [area]: { rating_id: yes, note: 'Not allowed' } })).toThrow(
      'notes are enabled',
    );
  });
  it('rejects duplicate and blank rating headings at publication', () => {
    const value = draft({
      title: 'Reflection',
      questions: [
        {
          id: 'm',
          type: 'self_assessment',
          prompt: 'Reflect',
          matrix: {
            areas: [],
            ratings: [
              { id: randomUUID(), text: 'Always' },
              { id: randomUUID(), text: ' always ' },
            ],
          },
        },
      ],
      rubric: { threshold: null, criteria: [] },
    });
    expect(readiness(value)).toHaveProperty('questions.0.matrix.ratings.1.text');
    expect(readiness(value)).toHaveProperty('questions.0.matrix.areas');
  });
});
