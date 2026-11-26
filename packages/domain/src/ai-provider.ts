import type { Profile } from './ai-registry.js';
import { parseTopicRequest, syntheticTopicProposal } from './assessment-topic.js';
export type ProviderResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  externalId: string | null;
  refused?: boolean;
};
export class ProviderFailure extends Error {
  constructor(
    readonly kind: 'ambiguous' | 'refused' | 'invalid_output' | 'throttled' | 'unavailable',
  ) {
    super(kind);
  }
}
export type Provider = (
  profile: Profile & { prompt: string },
  input: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<ProviderResult>;
/** Deterministic demonstration output only; never a calibrated grade or an approval. */
export const mockProvider: Provider = async (_profile, input) => {
  if (input.task === 'generate_assessment_topic')
    return {
      text: JSON.stringify(syntheticTopicProposal(parseTopicRequest(input.options))),
      inputTokens: 100,
      outputTokens: 100,
      externalId: 'synthetic-topic-v1',
    };
  if (input.task === 'assess_initial' || input.task === 'grade_submission') {
    const evidence = input.evidence as { id: string; text: string }[],
      rubric = input.rubric as { id: string; version: number; criteria: { id: string }[] },
      hasText = Buffer.byteLength(evidence[0]?.text.trim() ?? '') >= 30;
    return {
      text: JSON.stringify({
        rubric_id: rubric.id,
        rubric_version: rubric.version,
        criteria: rubric.criteria.map((c) => ({
          id: c.id,
          score: hasText ? 70 : 0,
          evidence_ids: evidence.length ? [evidence[0].id] : [],
          feedback:
            'Synthetic demonstration score only. A human must independently review the supplied work against this criterion.',
          insufficient_evidence: !hasText || (input.unread_files as unknown[]).length > 0,
        })),
      }),
      inputTokens: 100,
      outputTokens: 100,
      externalId: 'mock-grade',
    };
  }
  if (input.task === 'propose_adaptation') {
    const block = structuredClone(input.replacement) as { lessons: { activity: string }[] };
    for (const lesson of block.lessons)
      lesson.activity +=
        ' Synthetic support: explain one decision and verify it using the existing checklist.';
    return {
      text: JSON.stringify({
        replacement: block,
        source_ids: input.source_ids,
        reason: 'Synthetic support proposal; validate against the approved evidence.',
      }),
      inputTokens: 100,
      outputTokens: 200,
      externalId: 'mock-adaptation',
    };
  }
  if (input.task === 'suggest_kpi_actions')
    return {
      text: JSON.stringify({
        source_ids: input.source_ids,
        actions: [
          'Review the approved evidence with the coordinator.',
          'Practise the existing task within its allocated minutes.',
        ],
      }),
      inputTokens: 100,
      outputTokens: 100,
      externalId: 'mock-kpi',
    };
  if (input.schema_version === 'block-v1') {
    const resource = input.resource as { id: string },
      dates = input.dates as string[];
    const budget = Number(input.daily_minutes),
      reading = Math.floor(budget / 6),
      assessment = Math.floor(budget / 6),
      revision = Math.floor(budget / 6);
    return {
      text: JSON.stringify({
        objective: 'Synthetic practice objective: apply the reviewed method.',
        prerequisites: 'Review the preceding block and induction.',
        prerequisite_block: Number(input.block_number) - 1,
        competency: 1,
        criterion_one: 'Demonstrate the reviewed safe method.',
        criterion_two: 'Provide observable evidence of the method.',
        weight_one: 0.5,
        weight_two: 0.5,
        lessons: dates.map((date) => ({
          date,
          title: 'Synthetic practice lesson',
          explanation:
            'Synthetic content only: read the reviewed resource and identify its method.',
          example: 'Synthetic demonstration: observe the method described by the coordinator.',
          activity: 'Synthetic practice: demonstrate the reviewed method with supervision.',
          tools: 'Use only tools permitted by the reviewed resource.',
          completion: 'Record observed evidence for independent coordinator review.',
          reading,
          practice: budget - reading - assessment - revision,
          assessment,
          revision,
          kpi: 1,
          resource_id: resource.id,
        })),
      }),
      inputTokens: 100,
      outputTokens: 100,
      externalId: 'mock-programme-block',
    };
  }
  throw new ProviderFailure('unavailable');
};
