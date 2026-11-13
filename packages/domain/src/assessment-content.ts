import sanitizeHtml from 'sanitize-html';
import { Parser } from 'htmlparser2';
import { z } from 'zod';
import { requireCondition } from './errors.js';
const text = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .transform((v) => v ?? '');
const id = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[\p{L}\p{N}_-]+$/u);
const distinct = (items: { id: string }[]) => new Set(items.map((i) => i.id)).size === items.length;
const matrixItem = (max: number) => z.object({ id: z.string().uuid(), text: text(max) }).strict();
export const matrixSchema = z
  .object({
    areas: z.array(matrixItem(4000)).max(30).refine(distinct, 'Areas need distinct references.'),
    ratings: z.array(matrixItem(120)).max(10).refine(distinct, 'Ratings need distinct references.'),
    instructions: text(4000).optional().default(''),
    notes_enabled: z.boolean().optional().default(false),
    required: z.boolean().optional().default(false),
  })
  .strict();
export type Matrix = z.infer<typeof matrixSchema>;
const choice = z.object({ id, text: text(1000) }).strict();
const question = z
  .object({
    id,
    type: z
      .enum(['open_response', 'multiple_choice', 'self_assessment'])
      .optional()
      .default('open_response'),
    prompt: text(4000),
    prompt_html: text(50000).optional(),
    choices: z
      .array(choice)
      .max(30)
      .refine(distinct, 'Choices need distinct references.')
      .optional()
      .default([]),
    matrix: matrixSchema.optional(),
  })
  .strict();
const section = z
  .object({
    id: z.string().uuid(),
    title: text(180),
    instructions: text(4000),
    question_ids: z.array(z.string().min(1).max(60)).max(30),
  })
  .strict();
const schema = z.object({
  title: text(180),
  questions: z.array(question).max(30).refine(distinct, 'Questions need distinct references.'),
  sections: z
    .array(section)
    .max(30)
    .refine(distinct, 'Sections need distinct references.')
    .nullable()
    .optional()
    .default(null),
  answer_key: z.record(z.string(), z.string().max(60).nullable()).optional().default({}),
  rubric: z
    .object({
      threshold: z.number().min(0).max(100).nullable(),
      criteria: z
        .array(
          z
            .object({
              id,
              category: text(120),
              label: text(180),
              guidance: text(4000),
              weight: z.number().min(0).max(1).nullable(),
            })
            .strict(),
        )
        .max(30)
        .refine(distinct, 'Criteria need distinct references.'),
    })
    .strict(),
});
export type AssessmentDraft = z.infer<typeof schema>;
export type Question = AssessmentDraft['questions'][number];
export function sanitize(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'a', 'img'],
    allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    exclusiveFilter: (frame) =>
      frame.tag === 'img' && !/^\/assessments\/media\/[a-f0-9-]{36}$/.test(frame.attribs.src ?? ''),
  });
}
function plain(html: string) {
  let value = '';
  const parser = new Parser(
    {
      ontext: (t) => {
        value += t;
      },
      onopentag: (name) => {
        if (name === 'br') value += '\n';
      },
      onclosetag: (name) => {
        if (['p', 'li'].includes(name)) value += '\n';
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  return value.trim();
}
export function mediaIds(questions: Question[]) {
  return [
    ...new Set(
      questions.flatMap((q) =>
        [...(q.prompt_html ?? '').matchAll(/\/assessments\/media\/([a-f0-9-]{36})/g)].map(
          (m) => m[1],
        ),
      ),
    ),
  ];
}
export function draft(input: unknown): AssessmentDraft {
  const data = schema.parse(input);
  const keys: Record<string, string | null> = Object.create(null);
  for (const q of data.questions) {
    if (q.prompt_html !== undefined) {
      q.prompt_html = sanitize(q.prompt_html);
      q.prompt = plain(q.prompt_html);
      requireCondition(
        [...q.prompt].length <= 4000,
        422,
        'prompt_too_long',
        'Keep the prompt within 4,000 characters.',
      );
    }
    if (q.type === 'self_assessment') q.matrix ??= matrixSchema.parse({ areas: [], ratings: [] });
    else delete q.matrix;
    if (q.type !== 'multiple_choice') q.choices = [];
    else keys[q.id] = Object.hasOwn(data.answer_key, q.id) ? data.answer_key[q.id] : null;
  }
  if (data.sections !== null) {
    const members = data.sections.flatMap((s) => s.question_ids),
      questions = new Map(data.questions.map((q) => [q.id, q]));
    requireCondition(
      members.length === new Set(members).size &&
        members.length === questions.size &&
        members.every((m) => questions.has(m)),
      422,
      'invalid_sections',
      'Every question must belong to exactly one section.',
    );
    data.questions = members.map((m) => questions.get(m)!);
  }
  data.answer_key = keys;
  return data;
}
export function matrixReadiness(matrix: Matrix, prefix: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!matrix.areas.length) errors[prefix + '.areas'] = 'Add at least one assessment area.';
  matrix.areas.forEach((a, i) => {
    if (!a.text.trim())
      errors[prefix + '.areas.' + i + '.text'] = 'Enter a statement for area ' + (i + 1) + '.';
  });
  if (matrix.ratings.length < 2) errors[prefix + '.ratings'] = 'Add at least two rating columns.';
  const seen = new Set<string>();
  matrix.ratings.forEach((r, i) => {
    const value = r.text.trim().toLocaleLowerCase('en');
    if (!value || seen.has(value))
      errors[prefix + '.ratings.' + i + '.text'] =
        'Use a distinct, non-blank heading for rating ' + (i + 1) + '.';
    seen.add(value);
  });
  return errors;
}
export function readiness(data: AssessmentDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (data.sections !== null) {
    if (!data.sections.length) errors.sections = 'Add at least one section.';
    data.sections.forEach((s, i) => {
      if (!s.title.trim()) errors['sections.' + i + '.title'] = 'Add a section title.';
      if (!s.question_ids.length)
        errors['sections.' + i + '.question_ids'] = 'Add at least one question to each section.';
    });
  }
  if (!data.title.trim()) errors.title = 'Add an assessment title.';
  if (!data.questions.length) errors.questions = 'Add at least one question.';
  let open = false;
  data.questions.forEach((q, i) => {
    if (!q.prompt.trim()) errors['questions.' + i + '.prompt'] = 'Add a question prompt.';
    if (q.type === 'open_response') {
      open = true;
      return;
    }
    if (q.type === 'self_assessment') {
      Object.assign(errors, matrixReadiness(q.matrix!, 'questions.' + i + '.matrix'));
      return;
    }
    if (q.choices.length < 2) errors['questions.' + i + '.choices'] = 'Add at least two choices.';
    q.choices.forEach((c, j) => {
      if (!c.text.trim())
        errors['questions.' + i + '.choices.' + j + '.text'] = 'Enter choice text.';
    });
    if (!q.choices.some((c) => c.id === data.answer_key[q.id]))
      errors['questions.' + i + '.correct'] = 'Select one correct answer that still exists.';
  });
  const criteria = data.rubric.criteria;
  if (open && !criteria.length) errors.criteria = 'Add scoring criteria for open responses.';
  if (criteria.length) {
    criteria.forEach((c, i) => {
      for (const key of ['category', 'label', 'guidance'] as const)
        if (!c[key].trim())
          errors['criteria.' + i + '.' + key] = 'Complete the criterion ' + key + '.';
      if ((c.weight ?? 0) <= 0) errors['criteria.' + i + '.weight'] = 'Enter a weight above zero.';
    });
    if (Math.abs(criteria.reduce((sum, c) => sum + (c.weight ?? 0), 0) - 1) >= 0.000001)
      errors.criteria = 'Criterion weights must total 100%.';
  }
  return errors;
}
export function matrixResponse(
  q: Question,
  value: unknown,
): Record<string, { rating_id: string | null; note: string }> {
  requireCondition(
    value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length <= 30,
    422,
    'invalid_matrix_response',
    'Use one rating and optional note per assessment area.',
  );
  const matrix = q.matrix!,
    areas = new Set(matrix.areas.map((a) => a.id)),
    ratings = new Set(matrix.ratings.map((r) => r.id)),
    result: Record<string, { rating_id: string | null; note: string }> = {};
  for (const [area, raw] of Object.entries(value)) {
    requireCondition(
      areas.has(area) &&
        raw !== null &&
        typeof raw === 'object' &&
        !Array.isArray(raw) &&
        Object.keys(raw).every((k) => ['rating_id', 'note'].includes(k)),
      422,
      'invalid_matrix_area',
      'Use areas from the assigned assessment revision.',
    );
    const row = raw as Record<string, unknown>,
      rating = row.rating_id ?? null,
      note = row.note ?? '';
    requireCondition(
      rating === null || rating === '' || (typeof rating === 'string' && ratings.has(rating)),
      422,
      'invalid_matrix_rating',
      'Select a rating from the assigned assessment revision.',
    );
    requireCondition(
      typeof note === 'string' && [...note].length <= 500 && (matrix.notes_enabled || !note.trim()),
      422,
      'invalid_matrix_note',
      'Use a note up to 500 characters only when notes are enabled.',
    );
    result[area] = { rating_id: rating ? String(rating) : null, note };
  }
  return result;
}
export function requiredMatrixErrors(questions: Question[], responses: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  for (const q of questions)
    if (q.type === 'self_assessment' && q.matrix?.required)
      for (const area of q.matrix.areas) {
        const response = responses[q.id] as Record<string, { rating_id?: string }> | undefined;
        if (!response?.[area.id]?.rating_id)
          errors['responses.' + q.id + '.' + area.id + '.rating_id'] =
            'Choose a rating for: ' + area.text;
      }
  return errors;
}
export function objective(snapshot: {
  questions: Question[];
  responses: Record<string, unknown>;
  answer_key: Record<string, string | null>;
}) {
  const questions = snapshot.questions.filter((q) => q.type === 'multiple_choice');
  if (!questions.length) return null;
  const correct = questions.filter(
    (q) => snapshot.responses[q.id] && snapshot.responses[q.id] === snapshot.answer_key[q.id],
  ).length;
  return {
    correct,
    total: questions.length,
    percentage: Math.round((100000 * correct) / questions.length) / 1000,
    policy: 'equal-weight-v1',
  };
}
