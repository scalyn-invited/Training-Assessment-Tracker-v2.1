import { requireCondition } from './errors.js';
import type { Sql } from '../../database/src/database.js';

export type LearningCalendarData = {
  member_id: string;
  environment: string;
  timezone: string;
  daily_minutes: number;
  weekdays: number[];
  business_weekdays?: number[];
  holidays: string[];
  absences: string[];
};
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
export function addDays(day: string, count: number): string {
  requireCondition(validDate(day), 422, 'invalid_date', 'Enter a valid calendar date.');
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
function weekday(day: string): number {
  return new Date(day + 'T00:00:00Z').getUTCDay() || 7;
}
// Convert local wall time using the runtime IANA database, including DST and fractional offsets.
// Verify the result rather than accepting a silently shifted/nonexistent local time.
function cutoffUtc(day: string, timezone: string): string {
  requireCondition(validTimezone(timezone), 422, 'invalid_timezone', 'Choose a valid timezone.');
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const target = Date.parse(day + 'T17:00:00Z');
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
    );
    const wall = Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
    );
    if (wall === target) return new Date(instant).toISOString().replace('.000Z', '+00:00');
    instant += target - wall;
  }
  requireCondition(
    false,
    422,
    'invalid_cutoff',
    'The local cutoff does not exist. Review the calendar timezone.',
  );
}
export class LearningCalendar {
  available(calendar: LearningCalendarData, day: string): boolean {
    requireCondition(validDate(day), 422, 'invalid_date', 'Enter a valid calendar date.');
    return (
      calendar.weekdays.includes(weekday(day)) &&
      !calendar.holidays.includes(day) &&
      !calendar.absences.includes(day)
    );
  }
  freeze(calendar: LearningCalendarData, start: string): string {
    const businessDays = calendar.business_weekdays ?? [1, 2, 3, 4, 5];
    requireCondition(
      businessDays.length > 0 && businessDays.every((d) => Number.isInteger(d) && d >= 1 && d <= 7),
      422,
      'invalid_business_days',
      'Choose at least one business weekday.',
    );
    let day = start,
      remaining = 2;
    while (remaining > 0) {
      day = addDays(day, -1);
      if (businessDays.includes(weekday(day)) && !calendar.holidays.includes(day)) remaining--;
    }
    return cutoffUtc(day, calendar.timezone);
  }
  blocks(calendar: LearningCalendarData, start: string, duration: number) {
    requireCondition(
      [4, 6, 8, 10, 12].includes(duration),
      422,
      'invalid_duration',
      'Choose 4, 6, 8, 10 or 12 learning blocks.',
    );
    return Array.from({ length: duration }, (_, index) => {
      const day = addDays(start, index * 7);
      const days = Array.from({ length: 7 }, (_, offset) => addDays(day, offset)).filter((d) =>
        this.available(calendar, d),
      );
      requireCondition(
        days.length,
        422,
        'empty_block',
        'A block has no available days. Choose an explicit revised start date or calendar.',
      );
      return { number: index + 1, start: day, days, freeze_at: this.freeze(calendar, day) };
    });
  }
  async assertCapacity(
    sql: Sql,
    calendar: LearningCalendarData,
    days: Record<string, number>,
    excludeEnrolment?: string,
  ) {
    // Authorised service callers hold the member lock. Aggregate globally for that member,
    // as in V2; never expose another programme's identity or content to this caller.
    for (const [day, minutes] of Object.entries(days)) {
      requireCondition(
        Number.isInteger(minutes) && minutes >= 0,
        422,
        'invalid_minutes',
        'Minutes must be a non-negative whole number.',
      );
      const result = await sql.query<{ reserved: string }>(
        'SELECT COALESCE(sum(minutes),0) reserved FROM capacity_allocations WHERE member_id=$1 AND environment=$2 AND active AND day=$3::date AND ($4::uuid IS NULL OR enrolment_id<>$4::uuid)',
        [calendar.member_id, calendar.environment, day, excludeEnrolment ?? null],
      );
      requireCondition(
        this.available(calendar, day) &&
          Number(result.rows[0].reserved) + minutes <= calendar.daily_minutes,
        422,
        'capacity_exceeded',
        `Shared capacity is exceeded on ${day}. Review and explicitly reschedule; no minutes were changed.`,
      );
    }
  }
}
