import { z } from 'zod';
import { parseAssessmentProposals } from './assessment-proposals.js';
export const topicRequestSchema = z
  .object({
    topic: z
      .string()
      .trim()
      .min(3)
      .max(500)
      .regex(/^[^<>\x00-\x1f]+$/),
    count: z.number().int().min(2).max(30).default(5),
    difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
    language: z.literal('English').default('English'),
    types: z.literal('mixed').default('mixed'),
  })
  .strict();
export type TopicRequest = z.infer<typeof topicRequestSchema>;
export function parseTopicRequest(input: unknown): TopicRequest {
  return topicRequestSchema.parse(input);
}
export function validateTopicProposal(input: TopicRequest, output: unknown) {
  const proposal = parseAssessmentProposals(output);
  if (
    proposal.questions.length !== input.count ||
    !proposal.rubric ||
    new Set(proposal.questions.map((q) => q.type)).size !== 2 ||
    proposal.questions.some((q) =>
      q.type === 'multiple_choice' ? !q.correct_choice_reference : !q.suggested_answer,
    )
  ) {
    throw new Error('Incomplete topic proposal.');
  }
  return proposal;
}
// Fixed synthetic fixture, not a model or an assertion of subject-matter quality.
export function syntheticTopicProposal(input: TopicRequest) {
  return {
    format: 'assessment-proposals-v1',
    questions: Array.from({ length: input.count }, (_, i) =>
      i % 2 === 0
        ? {
            reference: 'q' + i,
            type: 'multiple_choice',
            prompt: `Synthetic Cedar workshop scenario ${i + 1}: what should you do before using equipment?`,
            choices: [
              {
                reference: 'safe',
                text: 'Inspect the equipment and follow the workshop safety procedure.',
              },
              { reference: 'unsafe', text: 'Begin without checking.' },
            ],
            correct_choice_reference: 'safe',
          }
        : {
            reference: 'q' + i,
            type: 'open_response',
            prompt: `Synthetic Cedar workshop scenario ${i + 1}: explain how you would report a hazard.`,
            choices: [],
            suggested_answer:
              'Stop work, protect others from the hazard and report it to the workshop supervisor.',
          },
    ),
    rubric: {
      threshold: 75,
      criteria: [
        {
          reference: 'safety',
          category: 'Safety',
          label: 'Safe procedure',
          guidance: 'Identifies the hazard and explains safe actions and reporting.',
          weight: 1,
        },
      ],
    },
  };
}
