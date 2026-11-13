import { z } from 'zod';
import { validDate, validTimezone } from './learning-calendar.js';
import { onboardingFields, type OnboardingStep } from '../../contracts/src/onboarding.js';
export {
  onboardingSteps,
  onboardingFields,
  type OnboardingStep,
} from '../../contracts/src/onboarding.js';
export function onboardingSchema(step: OnboardingStep, complete = false) {
  const optional = (schema: z.ZodType): z.ZodType =>
    complete ? schema : schema.nullable().optional();
  const text = (max = 4000) =>
    optional(
      z
        .string()
        .trim()
        .min(complete ? 1 : 0)
        .max(max),
    );
  const date = z.string().refine(validDate, 'Enter a valid date.');
  const dates = z
    .array(date)
    .max(366)
    .refine((a) => new Set(a).size === a.length, 'Dates must be distinct.')
    .nullable()
    .optional();
  if (step in onboardingFields) {
    const fields = onboardingFields[step as keyof typeof onboardingFields];
    const shape: Record<string, z.ZodType> = Object.fromEntries(
      Object.keys(fields).map((key) => [key, text()]),
    );
    if (step === 'assessment') {
      shape.date = optional(
        date.refine(
          (d) => d <= new Date().toISOString().slice(0, 10),
          'Assessment date cannot be in the future.',
        ),
      );
      shape.kind = optional(z.enum(['provider score', 'self report', 'observed evidence']));
    }
    return z.object(shape);
  }
  if (step === 'schedule')
    return z.object({
      duration: optional(
        z
          .number()
          .int()
          .refine((v) => [4, 6, 8, 10, 12].includes(v)),
      ),
      daily_minutes: optional(z.number().int().min(15).max(120)),
      capacity_minutes: optional(z.number().int().min(15).max(120)),
      start_date: optional(date),
      timezone: optional(z.string().refine(validTimezone, 'Choose a valid timezone.')),
      weekdays: optional(
        z
          .array(z.number().int().min(1).max(7))
          .min(1)
          .max(7)
          .refine((a) => new Set(a).size === a.length),
      ),
      holidays: dates,
      absences: dates,
      constraints: z.string().max(4000).nullable().optional(),
    });
  return z.object({
    kpis: optional(
      z
        .array(
          z.object({
            name: text(200),
            baseline: text(200),
            target: text(200),
            unit: text(100),
            rationale: text(1000),
            evidence: text(1000),
            cadence: text(200),
          }),
        )
        .min(3)
        .max(5),
    ),
  });
}
