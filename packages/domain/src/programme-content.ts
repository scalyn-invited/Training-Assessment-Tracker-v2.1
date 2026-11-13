import { z } from 'zod';
import { lessonTextFields, lessonMinuteFields } from '../../contracts/src/programme.js';
export * from '../../contracts/src/programme.js';
export function blockInput(count: number) {
  return z.object({
    objective: z.string().max(4000).nullable().optional(),
    prerequisites: z.string().max(4000).nullable().optional(),
    competency: z.number().int().min(1).max(100),
    criterion_one: z.string().max(2000).nullable().optional(),
    criterion_two: z.string().max(2000).nullable().optional(),
    weight_one: z.number().min(0).max(1),
    weight_two: z.number().min(0).max(1),
    lessons: z
      .array(
        z.object({
          ...Object.fromEntries(
            lessonTextFields.map((k) => [k, z.string().max(8000).nullable().optional()]),
          ),
          ...Object.fromEntries(
            lessonMinuteFields.map((k) => [
              k,
              z.number().int().min(0).max(120).nullable().optional(),
            ]),
          ),
          kpi: z.number().int().min(1).max(5),
        }),
      )
      .length(count),
  });
}
