import { z } from 'zod';
import { DomainError } from './errors.js';

// Interchange references are local names, never database IDs or object keys.
export const PROPOSAL_MAX_BYTES = 256 * 1024;
const reference = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,59}$/);
const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(
      (v) => !!v.trim() && !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),
      'Use nonempty plain text without markup or control characters.',
    );
const distinct = (items: { reference: string }[]) =>
  new Set(items.map((v) => v.reference)).size === items.length;
const choice = z.object({ reference, text: text(1000) }).strict();
const question = z
  .discriminatedUnion('type', [
    z
      .object({
        reference,
        type: z.literal('multiple_choice'),
        prompt: text(4000),
        choices: z.array(choice).min(2).max(30).refine(distinct),
        correct_choice_reference: reference.optional(),
      })
      .strict(),
    z
      .object({
        reference,
        type: z.literal('open_response'),
        prompt: text(4000),
        choices: z.array(choice).length(0),
        suggested_answer: text(4000).optional(),
      })
      .strict(),
  ])
  .refine(
    (q) =>
      q.type !== 'multiple_choice' ||
      !q.correct_choice_reference ||
      q.choices.some((c) => c.reference === q.correct_choice_reference),
    'Correct choice must reference a choice in this question.',
  );
const rubric = z
  .object({
    threshold: z.number().min(0).max(100).nullable(),
    criteria: z
      .array(
        z
          .object({
            reference,
            category: text(120),
            label: text(180),
            guidance: text(4000),
            weight: z.number().positive().max(1),
          })
          .strict(),
      )
      .min(1)
      .max(30)
      .refine(distinct)
      .refine(
        (cs) => Math.abs(cs.reduce((sum, c) => sum + c.weight, 0) - 1) < 0.000001,
        'Weights must total 1.',
      ),
  })
  .strict();
const schema = z
  .object({
    format: z.literal('assessment-proposals-v1'),
    questions: z.array(question).min(1).max(30).refine(distinct),
    rubric: rubric.nullable(),
  })
  .strict();
export type AssessmentProposals = z.infer<typeof schema>;
export function parseAssessmentProposals(input: unknown): AssessmentProposals {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new DomainError(
      422,
      'invalid_assessment_proposal',
      'Use the assessment-proposals-v1 format with bounded plain-text questions, unique references and valid rubric weights.',
    );
  return result.data;
}
