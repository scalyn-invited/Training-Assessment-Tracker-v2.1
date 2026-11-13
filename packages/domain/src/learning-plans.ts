import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Sql } from '../../database/src/database.js';
import type { AuthUser } from './auth.js';
import type { Enrolment } from './enrolments.js';
import { Onboarding, type OnboardingVersion, type MemberCalendar } from './onboarding.js';
import { encrypt, decrypt, digest } from './crypto.js';
import { DomainError, requireCondition } from './errors.js';
import {
  blockInput,
  lessonTextFields,
  lessonMinuteFields,
  type ProgrammeContent,
  type LearningBlock,
  type Lesson,
} from './programme-content.js';
export type Programme = {
  id: string;
  organisation_id: string;
  environment: string;
  enrolment_id: string;
  onboarding_version_id: string;
  member_calendar_id: string;
  version: number;
  state: 'draft' | 'needs_review' | 'approved' | 'superseded';
  content: string;
  reason: string;
  actor_id: string;
  created_at: Date;
};
function today(timezone: string, now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export class LearningPlans {
  constructor(
    readonly onboarding: Onboarding,
    readonly now: () => Date = () => new Date(),
  ) {}
  content(plan: Programme): ProgrammeContent {
    return JSON.parse(decrypt(plan.content, this.onboarding.key));
  }
  async latest(sql: Sql, e: Enrolment) {
    return (
      await sql.query<Programme>(
        'SELECT * FROM programme_versions WHERE enrolment_id=$1 AND organisation_id=$2 AND environment=$3 ORDER BY version DESC LIMIT 1',
        [e.id, e.organisation_id, e.environment],
      )
    ).rows[0];
  }
  async current(sql: Sql, e: Enrolment, expected: number) {
    z.number().int().min(0).parse(expected);
    const plan = await this.latest(sql, e);
    requireCondition(
      (plan?.version ?? 0) === expected,
      409,
      'programme_conflict',
      'The plan changed. Review the current version before saving or approving.',
    );
    return plan;
  }
  async inputs(sql: Sql, e: Enrolment, plan: Programme) {
    const draft = await this.onboarding.latest(sql, e),
      calendar = await this.onboarding.calendar(sql, e);
    requireCondition(
      draft?.id === plan.onboarding_version_id && calendar?.id === plan.member_calendar_id,
      409,
      'programme_inputs_changed',
      'Onboarding or the shared calendar changed. Create a refreshed draft from the reviewed inputs first.',
    );
    return { draft, calendar, data: this.onboarding.complete(draft) };
  }
  async snapshot(
    sql: Sql,
    actor: AuthUser,
    e: Enrolment,
    draft: OnboardingVersion,
    calendar: MemberCalendar,
    content: ProgrammeContent,
    reason: string,
    previous?: Programme,
  ) {
    z.string().trim().min(8).max(2000).parse(reason);
    if (previous && ['draft', 'needs_review'].includes(previous.state))
      await sql.query(
        "UPDATE programme_versions SET state='superseded',updated_at=now() WHERE id=$1",
        [previous.id],
      );
    const id = randomUUID();
    const plan = (
      await sql.query<Programme>(
        "INSERT INTO programme_versions(id,organisation_id,environment,enrolment_id,onboarding_version_id,member_calendar_id,version,state,content,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10) RETURNING *",
        [
          id,
          e.organisation_id,
          e.environment,
          e.id,
          draft.id,
          calendar.id,
          (previous?.version ?? 0) + 1,
          encrypt(JSON.stringify(content), this.onboarding.key),
          reason,
          actor.id,
        ],
      )
    ).rows[0];
    await this.onboarding.enrolments.tenancy.audit(
      sql,
      actor,
      e.organisation_id,
      'programme.draft_saved',
      id,
      reason,
    );
    return { id, version: plan.version, state: plan.state };
  }
  async create(
    token: string,
    csrf: string,
    client: string,
    id: string,
    expected: number,
    onboardingVersion: number,
    reason: string,
  ) {
    z.number().int().positive().parse(onboardingVersion);
    return this.onboarding.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.onboarding.authorise(sql, actor, e, true);
      const previous = await this.current(sql, e, expected),
        draft = await this.onboarding.latest(sql, e);
      requireCondition(
        draft && draft.version === onboardingVersion,
        409,
        'onboarding_conflict',
        'Onboarding changed. Review the latest revision.',
      );
      const data = this.onboarding.complete(draft),
        calendar = await this.onboarding.calendar(sql, e);
      requireCondition(
        calendar,
        409,
        'calendar_required',
        'Confirm the shared capacity calendar first.',
      );
      const schedule = data.schedule!;
      for (const key of ['timezone', 'weekdays', 'holidays', 'absences'] as const)
        requireCondition(
          JSON.stringify(schedule[key] ?? []) === JSON.stringify(calendar[key]),
          422,
          'calendar_mismatch',
          'Availability differs from the confirmed shared calendar. Review and confirm it before creating the plan.',
        );
      requireCondition(
        schedule.capacity_minutes === calendar.daily_minutes,
        409,
        'capacity_unconfirmed',
        'Confirm the proposed shared daily capacity first.',
      );
      requireCondition(
        String(schedule.start_date) >= today(calendar.timezone, this.now()),
        422,
        'past_start',
        'Choose today or a future start date.',
      );
      const old = previous ? this.content(previous) : null;
      const blocks = this.onboarding.calendarRules
        .blocks(calendar, String(schedule.start_date), Number(schedule.duration))
        .map((block, index) => {
          const prior = old?.blocks[index];
          return {
            number: block.number,
            start: block.start,
            freeze_at: block.freeze_at,
            objective: prior?.objective ?? '',
            prerequisites: prior?.prerequisites ?? '',
            competency: prior?.competency ?? 1,
            criterion_one: prior?.criterion_one ?? '',
            criterion_two: prior?.criterion_two ?? '',
            weight_one: prior?.weight_one ?? 0.5,
            weight_two: prior?.weight_two ?? 0.5,
            lessons: block.days.map((date, i) => ({
              ...prior?.lessons[i],
              date,
              kpi: prior?.lessons[i]?.kpi ?? 1,
            })),
          };
        });
      return this.snapshot(sql, actor, e, draft, calendar, { blocks }, reason, previous);
    });
  }
  async edit(
    token: string,
    csrf: string,
    client: string,
    id: string,
    expected: number,
    index: number,
    input: unknown,
    reason: string,
  ) {
    z.number().int().min(0).parse(index);
    return this.onboarding.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.onboarding.authorise(sql, actor, e, true);
      const plan = await this.current(sql, e, expected);
      requireCondition(plan, 404, 'programme_unavailable', 'This curriculum is unavailable.');
      const { draft, calendar } = await this.inputs(sql, e, plan),
        content = this.content(plan),
        old = content.blocks[index];
      requireCondition(old, 404, 'block_unavailable', 'This learning block is unavailable.');
      const validated = blockInput(old.lessons.length).parse(input);
      content.blocks[index] = {
        ...old,
        ...validated,
        lessons: validated.lessons.map(
          (lesson, i) => ({ ...lesson, date: old.lessons[i].date }) as Lesson,
        ),
      };
      return this.snapshot(sql, actor, e, draft, calendar, content, reason, plan);
    });
  }
  async validate(sql: Sql, e: Enrolment, plan: Programme, content = this.content(plan)) {
    const { draft, calendar, data } = await this.inputs(sql, e, plan),
      schedule = data.schedule!;
    const expected = this.onboarding.calendarRules.blocks(
      calendar,
      String(schedule.start_date),
      Number(schedule.duration),
    );
    const errors: Record<string, string> = {},
      days: Record<string, number> = {};
    if (content.blocks.length !== expected.length)
      errors.blocks = 'The plan must contain every required learning block.';
    const competencies = String(data.capability!.competencies)
      .trim()
      .split(/\r\n|[\n\r\u0085\u2028\u2029]/)
      .filter((v) => v.trim());
    const kpis = data.measures!.kpis as unknown[];
    for (const [index, block] of content.blocks.entries()) {
      const label = `Block ${index + 1}`;
      if (
        !block.objective?.trim() ||
        !block.prerequisites?.trim() ||
        !block.criterion_one?.trim() ||
        !block.criterion_two?.trim() ||
        !Number.isInteger(block.competency) ||
        block.competency < 1 ||
        block.competency > competencies.length ||
        ![block.weight_one, block.weight_two].every(
          (n) => Number.isFinite(n) && n >= 0 && n <= 1,
        ) ||
        Math.abs(block.weight_one + block.weight_two - 1) > 0.000001
      )
        errors[`block_${index}`] =
          `${label}: add objectives, prerequisites, a valid competency and two rubric criteria whose weights sum to 1.`;
      if (
        JSON.stringify(block.lessons.map((l) => l.date)) !==
          JSON.stringify(expected[index]?.days ?? []) ||
        block.start !== expected[index]?.start ||
        block.freeze_at !== expected[index]?.freeze_at ||
        block.number !== index + 1
      )
        errors[`dates_${index}`] =
          `${label}: lesson dates or block boundaries do not match the confirmed calendar.`;
      for (const lesson of block.lessons) {
        const day = lesson.date;
        if (lessonTextFields.some((key) => !lesson[key]?.trim()))
          errors[day] =
            `${label}, ${day}: include usable content, worked example, activity, tools and completion criteria.`;
        const values = lessonMinuteFields.map((key) => lesson[key] ?? 0),
          minutes = values.reduce((a, b) => a + b, 0);
        if (
          values.some((n) => !Number.isInteger(n) || n < 0 || n > 120) ||
          minutes < 15 ||
          minutes > 120 ||
          minutes > Number(schedule.daily_minutes)
        )
          errors[`minutes_${day}`] =
            `${day}: reading, practice, assessment and revision must total 15–120 minutes and fit the agreed plan budget.`;
        if (!Number.isInteger(lesson.kpi) || lesson.kpi < 1 || lesson.kpi > kpis.length)
          errors[`kpi_${day}`] = `${day}: select a KPI from the confirmed onboarding measures.`;
        if (day in days) errors[`duplicate_${day}`] = 'Lesson dates must not repeat.';
        days[day] = minutes;
      }
    }
    if (Object.keys(errors).length)
      throw new DomainError(422, 'programme_incomplete', Object.values(errors).join(' '), errors);
    await this.onboarding.calendarRules.assertCapacity(sql, calendar, days, e.id);
    return { days, draft, calendar };
  }
  async review(
    token: string,
    csrf: string,
    client: string,
    id: string,
    expected: number,
    approve: boolean,
    reason: string,
  ) {
    return this.onboarding.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.onboarding.authorise(sql, actor, e, true);
      requireCondition(
        actor.id !== e.member_id,
        403,
        'self_approval',
        'Members cannot approve their own curriculum.',
      );
      const plan = await this.current(sql, e, expected);
      requireCondition(
        plan && plan.state === (approve ? 'needs_review' : 'draft'),
        409,
        'programme_state',
        'This version is not awaiting that action.',
      );
      const { days, calendar, draft } = await this.validate(sql, e, plan);
      requireCondition(
        Object.keys(days)[0] >= today(calendar.timezone, this.now()),
        409,
        'past_start',
        'The start date has passed; explicitly reschedule the draft.',
      );
      if (!approve) {
        await sql.query(
          "UPDATE programme_versions SET state='needs_review',updated_at=now() WHERE id=$1",
          [plan.id],
        );
        await this.onboarding.enrolments.tenancy.audit(
          sql,
          actor,
          client,
          'programme.review_requested',
          plan.id,
          'Validated all blocks for exact-version review',
        );
        return { id: plan.id, version: plan.version, state: 'needs_review' };
      }
      z.string().trim().min(8).max(2000).parse(reason);
      await sql.query(
        "UPDATE programme_versions SET state='superseded',updated_at=now() WHERE enrolment_id=$1 AND state='approved'",
        [e.id],
      );
      await sql.query(
        'UPDATE capacity_allocations SET active=false WHERE enrolment_id=$1 AND active',
        [e.id],
      );
      for (const [day, minutes] of Object.entries(days))
        await sql.query(
          'INSERT INTO capacity_allocations(id,organisation_id,environment,programme_version_id,enrolment_id,member_id,day,minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [randomUUID(), client, e.environment, plan.id, e.id, e.member_id, day, minutes],
        );
      await sql.query(
        'INSERT INTO programme_approvals(id,organisation_id,environment,programme_version_id,actor_id,reason,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          randomUUID(),
          client,
          e.environment,
          plan.id,
          actor.id,
          reason,
          digest(JSON.stringify(this.content(plan))),
        ],
      );
      await sql.query(
        "UPDATE programme_versions SET state='approved',updated_at=now() WHERE id=$1",
        [plan.id],
      );
      const schedule = this.onboarding.data(draft).schedule!;
      await sql.query(
        "UPDATE enrolments SET status='ready',version=version+1,timezone=$1,duration_weeks=$2,daily_minutes=$3,updated_at=now() WHERE id=$4",
        [calendar.timezone, schedule.duration, schedule.daily_minutes, e.id],
      );
      await this.onboarding.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'programme.approved',
        plan.id,
        reason,
      );
      await sql.query(
        "INSERT INTO approved_changes(event_id,organisation_id,environment,enrolment_id,entity_id,entity_version,kind,facts) VALUES($1,$2,$3,$4,$5,$6,'programme.approved',$7)",
        [
          randomUUID(),
          client,
          e.environment,
          e.id,
          plan.id,
          plan.version,
          JSON.stringify({ title: e.title, programme_version_id: plan.id, status: 'approved' }),
        ],
      );
      return { id: plan.id, version: plan.version, state: 'approved' };
    });
  }
  async read(token: string, client: string, id: string, version?: number) {
    if (version !== undefined) z.number().int().positive().parse(version);
    return this.onboarding.auth.db.transaction(async (sql) => {
      const actor = await this.onboarding.enrolments.context(sql, token, client),
        e = await this.onboarding.enrolments.record(sql, actor, client, id, 'details');
      const versions = (
          await sql.query<Programme>(
            'SELECT * FROM programme_versions WHERE enrolment_id=$1 AND organisation_id=$2 AND environment=$3 ORDER BY version DESC',
            [id, client, e.environment],
          )
        ).rows,
        plan = version ? versions.find((p) => p.version === version) : versions[0];
      requireCondition(
        plan,
        404,
        'programme_unavailable',
        'No curriculum draft is available. Complete and confirm onboarding first.',
      );
      const pinned = (
        await sql.query<OnboardingVersion>(
          'SELECT * FROM onboarding_versions WHERE id=$1 AND organisation_id=$2 AND environment=$3',
          [plan.onboarding_version_id, client, e.environment],
        )
      ).rows[0];
      const calendar = (
        await sql.query<MemberCalendar>(
          'SELECT * FROM member_calendars WHERE id=$1 AND environment=$2 AND member_id=$3',
          [plan.member_calendar_id, e.environment, e.member_id],
        )
      ).rows[0];
      const inputs = this.onboarding.data(pinned);
      const member = (
        await sql.query<{ name: string }>('SELECT name FROM users WHERE id=$1 AND environment=$2', [
          e.member_id,
          e.environment,
        ])
      ).rows[0];
      const approval =
        (
          await sql.query(
            'SELECT content_hash,reason,created_at FROM programme_approvals WHERE programme_version_id=$1',
            [plan.id],
          )
        ).rows[0] ?? null;
      return {
        enrolment: { id: e.id, title: e.title, status: e.status, memberName: member.name },
        calendar: { version: calendar.version, timezone: calendar.timezone },
        references: {
          competencies: String(inputs.capability?.competencies ?? '')
            .split(/\r\n|[\n\r\u0085\u2028\u2029]/)
            .filter((v) => v.trim()),
          measures: inputs.measures?.kpis ?? [],
          resources: inputs.resources ?? {},
          dailyMinutes: inputs.schedule?.daily_minutes,
        },
        plan: {
          id: plan.id,
          version: plan.version,
          state: plan.state,
          content: this.content(plan),
          reason: plan.reason,
          createdAt: plan.created_at,
        },
        versions: versions.map((p) => ({
          version: p.version,
          state: p.state,
          reason: p.reason,
          createdAt: p.created_at,
        })),
        previous: versions.find((p) => p.version < plan.version)
          ? this.content(versions.find((p) => p.version < plan.version)!)
          : null,
        approval,
        editable:
          plan.id === versions[0].id &&
          ['onboarding', 'ready'].includes(e.status) &&
          (await this.onboarding.enrolments.permissions(sql, actor, e)).manage,
      };
    });
  }
}
