import { z } from 'zod';
import type { AssessmentSnapshot } from './assessment-responses.js';
import { objective } from './assessment-content.js';
import { requireCondition } from './errors.js';
const numeric = z
  .union([
    z.number(),
    z
      .string()
      .trim()
      .regex(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/)
      .transform(Number),
  ])
  .pipe(z.number().min(0).max(100))
  .nullable();
const resultSchema = z
  .object({
    rubric_id: z.string().min(1),
    rubric_version: z.number().int(),
    criteria: z.array(
      z
        .object({
          id: z.string().min(1),
          score: numeric,
          evidence_ids: z.array(z.string().min(1)),
          feedback: z
            .string()
            .refine((v) => [...v].length <= 4000, 'Keep feedback within 4,000 characters.')
            .refine((v) => Boolean(v.trim()), 'Enter feedback.'),
          insufficient_evidence: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();
/** Evidence IDs must come from the review service's current, hash-verified evidence projection. */
export function scoreAssessment(
  snapshot: AssessmentSnapshot,
  input: unknown,
  evidenceIds: readonly string[],
) {
  const base = {
    threshold: snapshot.rubric.threshold,
    rubric_id: snapshot.definition_id,
    rubric_version: snapshot.revision,
    objective: objective(snapshot),
  };
  if (!snapshot.questions.some((q) => q.type === 'open_response'))
    return {
      ...base,
      criteria: [],
      categories: {},
      total: null,
      success: null,
      rubric_applicable: false,
    };
  const result = resultSchema.parse(input),
    criteria = snapshot.rubric.criteria;
  requireCondition(
    result.rubric_id === snapshot.definition_id && result.rubric_version === snapshot.revision,
    422,
    'rubric_mismatch',
    'Rubric version mismatch.',
  );
  requireCondition(
    result.criteria.length === criteria.length &&
      new Set(result.criteria.map((r) => r.id)).size === criteria.length,
    422,
    'invalid_criteria',
    'Score each pinned criterion exactly once.',
  );
  const known = new Map(criteria.map((c) => [c.id, c])),
    evidence = new Set(evidenceIds);
  const categories = new Map<string, { weighted: number; weight: number; missing: boolean }>();
  let total = 0,
    missing = false;
  const rows = result.criteria.map((row) => {
    const criterion = known.get(row.id);
    requireCondition(
      criterion,
      422,
      'unknown_criterion',
      'Use criteria from the submitted rubric.',
    );
    requireCondition(
      row.evidence_ids.every((id) => evidence.has(id)),
      422,
      'invalid_evidence',
      'Evidence must be submitted text or confirmed, unchanged file content.',
    );
    const normalized = { ...row, score: row.insufficient_evidence ? null : row.score };
    if (row.insufficient_evidence) missing = true;
    else
      requireCondition(
        row.score !== null && row.evidence_ids.length > 0,
        422,
        'score_requires_evidence',
        'A score requires evidence.',
      );
    const weight = criterion.weight!;
    const category = categories.get(criterion.category) ?? {
      weighted: 0,
      weight: 0,
      missing: false,
    };
    category.weighted += (normalized.score ?? 0) * weight;
    category.weight += weight;
    category.missing ||= row.insufficient_evidence;
    categories.set(criterion.category, category);
    total += (normalized.score ?? 0) * weight;
    return normalized;
  });
  return {
    ...base,
    criteria: rows,
    categories: Object.fromEntries(
      [...categories].map(([name, value]) => [
        name,
        value.missing ? null : Math.round((value.weighted / value.weight) * 1000) / 1000,
      ]),
    ),
    total: missing ? null : Math.round(total * 1000) / 1000,
    success: missing || base.threshold === null ? null : total >= base.threshold,
    rubric_applicable: true,
  };
}
