import { describe, expect, it } from 'vitest';
import {
  LearningCalendar,
  validDate,
  type LearningCalendarData,
} from '../packages/domain/src/learning-calendar.js';
const service = new LearningCalendar();
const calendar: LearningCalendarData = {
  member_id: 'member',
  environment: 'test',
  timezone: 'Asia/Manila',
  daily_minutes: 60,
  weekdays: [1, 2, 3, 4, 5],
  holidays: [],
  absences: [],
};
describe('source learning calendar rules', () => {
  it('uses business days rather than learner weekdays or absences for the freeze', () => {
    expect(service.freeze(calendar, '2027-01-11')).toBe('2027-01-07T09:00:00+00:00');
    expect(
      service.freeze({ ...calendar, weekdays: [1], absences: ['2027-01-07'] }, '2027-01-11'),
    ).toBe('2027-01-07T09:00:00+00:00');
    expect(service.freeze({ ...calendar, holidays: ['2027-01-08'] }, '2027-01-11')).toBe(
      '2027-01-06T09:00:00+00:00',
    );
    expect(service.freeze({ ...calendar, business_weekdays: [7, 1, 2, 3, 4] }, '2027-01-11')).toBe(
      '2027-01-07T09:00:00+00:00',
    );
  });
  it('uses the offset on the cutoff day, including DST and fractional offsets', () => {
    expect(service.freeze({ ...calendar, timezone: 'America/New_York' }, '2027-03-15')).toBe(
      '2027-03-11T22:00:00+00:00',
    );
    expect(service.freeze({ ...calendar, timezone: 'America/New_York' }, '2027-03-22')).toBe(
      '2027-03-18T21:00:00+00:00',
    );
    expect(service.freeze({ ...calendar, timezone: 'Asia/Kathmandu' }, '2027-01-11')).toBe(
      '2027-01-07T11:15:00+00:00',
    );
  });
  it('retains seven-day blocks without moving dates around leave', () => {
    const blocks = service.blocks(
      { ...calendar, holidays: ['2027-01-11'], absences: ['2027-01-12'] },
      '2027-01-11',
      4,
    );
    expect(blocks[0].days).toEqual(['2027-01-13', '2027-01-14', '2027-01-15']);
    expect(blocks[1].start).toBe('2027-01-18');
    for (const duration of [4, 6, 8, 10, 12])
      expect(service.blocks(calendar, '2027-01-11', duration)).toHaveLength(duration);
    expect(() =>
      service.blocks({ ...calendar, weekdays: [1], holidays: ['2027-01-11'] }, '2027-01-11', 4),
    ).toThrow('no available days');
  });
  it('rejects malformed dates, unsupported durations and empty business calendars', () => {
    expect(validDate('2027-02-29')).toBe(false);
    expect(validDate('2028-02-29')).toBe(true);
    expect(() => service.blocks(calendar, '2027-01-11', 30)).toThrow('learning blocks');
    expect(() => service.freeze({ ...calendar, business_weekdays: [] }, '2027-01-11')).toThrow(
      'business weekday',
    );
    expect(() => service.freeze({ ...calendar, timezone: 'invalid' }, '2027-01-11')).toThrow(
      'timezone',
    );
  });
});
