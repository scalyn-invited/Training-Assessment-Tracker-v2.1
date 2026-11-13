import { randomUUID } from 'node:crypto';
import type { Database } from '../../database/src/database.js';
import { Auth, type AuthUser } from './auth.js';
import { Tenancy } from './tenancy.js';
import { Enrolments } from './enrolments.js';
import { Onboarding } from './onboarding.js';
import type { OnboardingStep } from './onboarding-content.js';
import { LearningPlans } from './learning-plans.js';
import { Delivery, type DeliveryBlock, type Submission } from './delivery.js';
import { LearningGrading } from './learning-grading.js';
import { LearningLifecycle } from './learning-lifecycle.js';
import { demoClients } from './demo-catalogue.js';
import { assertFixtureMode, type DemoClient, type DemoMode } from './demo-client.js';
import { fixtureSession } from './demo-session.js';
import { digest } from './crypto.js';
import { addDays } from './learning-calendar.js';
import { z } from 'zod';
export const demoStates = [
  'onboarding',
  'draft',
  'saved',
  'submitted',
  'correction',
  'completed',
  'appeal',
] as const;
export type DemoScenario = {
  enrolment: string;
  state: string;
  programme?: string;
  draft?: string;
  submission?: string;
  previous_submission?: string;
  appeal?: string;
};
/** Called only inside the owned stage transaction; uses ordinary permission/validation services. */
export async function seedDemoScenario(
  db: Database,
  key: Buffer,
  saved: DemoClient,
  clientIndex: number,
  scenarioIndex: number,
  reference: string,
  mode: DemoMode = 'local_password',
): Promise<DemoScenario> {
  assertFixtureMode(mode);
  z.number().int().min(0).max(2).parse(clientIndex);
  z.number().int().min(0).max(6).parse(scenarioIndex);
  z.iso.datetime().parse(reference);
  const state = demoStates[scenarioIndex],
    spec = demoClients[clientIndex],
    person = scenarioIndex + 3,
    primary = person % 2 ? 1 : 2,
    client = saved.org;
  const auth = new Auth(db, key),
    tenancy = new Tenancy(auth),
    enrolments = new Enrolments(auth),
    onboarding = new Onboarding(enrolments, key);
  let at = new Date(new Date(reference).getTime() + 86400000);
  const plans = new LearningPlans(onboarding, () => at),
    delivery = new Delivery(plans),
    grading = new LearningGrading(delivery);
  const sessions: string[] = [];
  async function session(person: number) {
    const user = (
      await db.pool.query<AuthUser>(
        "SELECT * FROM users WHERE id=$1 AND is_synthetic AND environment='test'",
        [saved.users[person]],
      )
    ).rows[0];
    if (!user) throw new Error('The owned fictional account is missing.');
    const s = await fixtureSession(auth, user, mode);
    sessions.push(s.token);
    await tenancy.select(s.token, s.csrf, client);
    return s;
  }
  try {
    const admin = await session(0),
      coordinator = await session(primary),
      member = await session(person);
    const e = await enrolments.create(admin.token, admin.csrf, client, {
      memberId: saved.memberships[person],
      coordinatorId: saved.memberships[primary],
      groupId: person === 3 ? null : saved.teams[scenarioIndex % 2],
      title: spec.topic + ' \u2014 ' + state,
      reason: 'Synthetic local training scenario',
    });
    const id = e.id;
    const inputs = {
      profile: {
        current_role: spec.role,
        responsibilities: spec.tasks.join('; '),
        experience: 'Six months in this fictional role',
        tools: 'Local test workspace and case checklist',
        preferences: 'English; short worked examples',
      },
      capability: {
        target_role: 'Independent ' + spec.role,
        purpose: spec.topic,
        proficiency: 'Independent with peer review',
        success: 'Complete a safe, reproducible handover',
        prerequisites: 'Basic ticket and document editing',
        competencies: spec.tasks.join('\n'),
      },
      assessment: {
        source: 'Synthetic scenario observation',
        provider: 'Fictional internal coach',
        date: reference.slice(0, 10),
        scale: 'Practice checklist; not a certification',
        findings: 'Needs clearer evidence and an explicit next owner',
        kind: 'observed evidence',
      },
      schedule: {
        duration: 4,
        daily_minutes: 30,
        capacity_minutes: 60,
        start_date: addDays(reference.slice(0, 10), 7),
        timezone: 'Asia/Manila',
        weekdays: [1, 3, 5],
        holidays: [],
        absences: [],
        constraints: 'Thirty minutes per session; shared sixty-minute capacity',
      },
      measures: {
        kpis: spec.tasks.map((name) => ({
          name,
          baseline: 'Not yet observed',
          target: '85',
          unit: 'percent',
          rationale: 'Demonstrate safe and complete work',
          evidence: 'Approved synthetic practice submission',
          cadence: 'Weekly',
        })),
      },
      resources: {
        title: spec.topic + ' practice guide',
        reference: 'Bundled fictional scenario, no external source',
        licence: 'Synthetic demo material',
        cost: 'No charge',
        access: 'Local text editor and sample case',
        tasks: spec.tasks.join('; '),
      },
    };
    let version = 0;
    for (const [step, input] of Object.entries(inputs)) {
      version = (
        await onboarding.save(
          coordinator.token,
          coordinator.csrf,
          client,
          id,
          step as OnboardingStep,
          input,
          version,
          step === 'assessment',
        )
      ).version;
      if (state === 'onboarding') return { enrolment: id, state };
    }
    await onboarding.confirmCalendar(
      coordinator.token,
      coordinator.csrf,
      client,
      id,
      0,
      version,
      'Synthetic coach confirmed shared capacity.',
    );
    const plan = await plans.create(
      coordinator.token,
      coordinator.csrf,
      client,
      id,
      0,
      version,
      'Synthetic draft curriculum.',
    );
    let planVersion = plan.version;
    const content = (await plans.read(coordinator.token, client, id)).plan.content;
    for (const [index, block] of content.blocks.entries()) {
      planVersion = (
        await plans.edit(
          coordinator.token,
          coordinator.csrf,
          client,
          id,
          planVersion,
          index,
          {
            objective: spec.tasks[index % 3],
            prerequisites: 'Read the synthetic case and safety checklist',
            competency: (index % 3) + 1,
            criterion_one: 'Steps and evidence support the stated result',
            criterion_two: 'Clear ownership, communication and safe handling',
            weight_one: 0.6,
            weight_two: 0.4,
            lessons: block.lessons.map((_, i) => ({
              title: spec.tasks[i % 3] + ' \u2014 practice ' + (index + 1),
              explanation:
                'Identify the impact, follow the documented checks, record evidence, and name the next owner. ' +
                spec.example,
              example: spec.example,
              activity:
                'Use the fictional case to ' +
                spec.tasks[i % 3].toLowerCase() +
                '. Include the expected result and a peer verification checklist.',
              tools: 'Text editor, local test account and synthetic case notes',
              completion:
                'Submit steps, evidence and a safe next action; remove personal information.',
              reading: 5,
              practice: 15,
              assessment: 5,
              revision: 5,
              kpi: (i % 3) + 1,
            })),
          },
          'Synthetic coach authored scenario-specific content.',
        )
      ).version;
    }
    if (state === 'draft') return { enrolment: id, state, programme: plan.id };
    await plans.review(
      coordinator.token,
      coordinator.csrf,
      client,
      id,
      planVersion,
      false,
      'Synthetic curriculum submitted for review.',
    );
    await plans.review(
      coordinator.token,
      coordinator.csrf,
      client,
      id,
      planVersion,
      true,
      'Synthetic human approval of complete practice curriculum.',
    );
    const enrollmentVersion = async () =>
      Number(
        (await db.pool.query('SELECT version FROM enrolments WHERE id=$1', [id])).rows[0].version,
      );
    await delivery.activate(
      coordinator.token,
      coordinator.csrf,
      client,
      id,
      await enrollmentVersion(),
      'Synthetic programme activation.',
    );
    const blocks = (
      await db.pool.query<DeliveryBlock>(
        'SELECT * FROM learning_blocks WHERE enrolment_id=$1 ORDER BY number',
        [id],
      )
    ).rows;
    for (const block of blocks)
      for (const [i, lesson] of delivery.content(block).lessons.entries()) {
        at = new Date(lesson.date + 'T10:00:00+08:00');
        const body =
          'SYNTHETIC PRACTICE \u2014 ' +
          lesson.title +
          '\n' +
          spec.example +
          '\nMy checks: record impact; reproduce safely; compare expected results; document the next owner and follow-up. Peer checklist: evidence attached, no passwords or personal customer data.';
        let work = await delivery.save(member.token, member.csrf, client, id, block.id, i, 0, {
          body,
          files: [],
          answers: [],
        });
        if (state === 'saved') return { enrolment: id, state, draft: work.id };
        const submitted = await delivery.submit(
          member.token,
          member.csrf,
          client,
          id,
          block.id,
          i,
          work.version,
          randomUUID(),
        );
        if (state === 'submitted') return { enrolment: id, state, submission: submitted.id };
        const submission = (
            await db.pool.query<Submission>('SELECT * FROM submission_attempts WHERE id=$1', [
              submitted.id,
            ])
          ).rows[0],
          rubric = delivery.submitted(submission).rubric;
        const result = {
          rubric_id: rubric.id,
          rubric_version: rubric.version,
          criteria: rubric.criteria.map((c) => ({
            id: c.id,
            score: state === 'correction' ? 65 : 92,
            evidence_ids: [submission.id + ':text'],
            feedback:
              'Synthetic coach review: ' +
              (state === 'correction'
                ? 'Add a named owner and verifiable follow-up.'
                : 'Clear checks and safe next actions supported by the practice text.'),
            insufficient_evidence: false,
          })),
        };
        await grading.manual(
          coordinator.token,
          coordinator.csrf,
          client,
          submission.id,
          submission.version,
          state === 'correction' ? 'changes_requested' : 'approved',
          'Synthetic human review for demonstration only.',
          result,
        );
        if (state === 'correction') {
          work = await delivery.save(
            member.token,
            member.csrf,
            client,
            id,
            block.id,
            i,
            work.version,
            {
              body:
                body +
                '\nRevision: service desk lead owns the next check at 14:00; verify the recorded outcome before closure.',
              files: [],
              answers: [],
            },
          );
          const next = await delivery.submit(
            member.token,
            member.csrf,
            client,
            id,
            block.id,
            i,
            work.version,
            randomUUID(),
          );
          return {
            enrolment: id,
            state: 'correction/resubmission',
            previous_submission: submission.id,
            submission: next.id,
          };
        }
        if (state === 'appeal') {
          const current = (
            await db.pool.query<Submission>('SELECT * FROM submission_attempts WHERE id=$1', [
              submission.id,
            ])
          ).rows[0];
          const appeal = await grading.appeal(
            member.token,
            member.csrf,
            client,
            current.id,
            current.version,
            'Synthetic learner requests independent review of the evidence interpretation.',
          );
          await grading.route(
            admin.token,
            admin.csrf,
            client,
            appeal.id,
            saved.users[3 - primary],
            'Synthetic case-specific independent appeal review',
          );
          return { enrolment: id, state, submission: submission.id, appeal: appeal.id };
        }
      }
    await new LearningLifecycle(delivery).complete(
      coordinator.token,
      coordinator.csrf,
      client,
      id,
      await enrollmentVersion(),
      'Synthetic coach confirms all practice evidence and targets; no certification implied.',
    );
    return { enrolment: id, state: 'completed' };
  } finally {
    if (sessions.length)
      await db.pool.query('DELETE FROM sessions WHERE token_hash=ANY($1::text[])', [
        sessions.map(digest),
      ]);
  }
}
