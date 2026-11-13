import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Sql } from '../../database/src/database.js';
import type { AuthUser } from './auth.js';
import type { Enrolment } from './enrolments.js';
import type { Programme } from './learning-plans.js';
import type { OnboardingVersion } from './onboarding.js';
import { Delivery, type DeliveryBlock } from './delivery.js';
import { LearningKpiRecords, type KpiVersion } from './learning-kpi-records.js';
import { AiGateway, type AiRun } from './ai-gateway.js';
import { generationInput } from './programme-generation-contract.js';
import {
  SUPPORT_POLICY,
  SUPPORT_PROMPT,
  validateSupport,
  type AdaptationInput,
  type SuggestionInput,
} from './learning-support-contract.js';
import { encrypt, decrypt } from './crypto.js';
import { requireCondition } from './errors.js';
export type Adaptation = {
  id: string;
  organisation_id: string;
  environment: string;
  enrolment_id: string;
  learning_block_id: string | null;
  member_calendar_id: string;
  evidence_block: number;
  source_ids: string[];
  policy_version: string;
  status: string;
  replacement: string | null;
  reason: string;
  actor_id: string;
  approved_by: string | null;
  approved_at: Date | null;
  created_at: Date;
};
type Suggestion = {
  id: string;
  enrolment_id: string;
  source_ids: string[];
  status: string;
  actions: string | null;
  actor_id: string;
  created_at: Date;
};
export class LearningSupport {
  readonly kpis: LearningKpiRecords;
  constructor(
    readonly delivery: Delivery,
    readonly gateway?: AiGateway,
  ) {
    this.kpis = new LearningKpiRecords(delivery);
    for (const task of ['propose_adaptation', 'suggest_kpi_actions'] as const)
      gateway?.register(task, {
        prompt: SUPPORT_PROMPT,
        authorize: (sql, run, actor, e) => this.authorize(sql, run, actor, e),
        validate: async (_sql, run, input, output) =>
          validateSupport(run.task, input as AdaptationInput | SuggestionInput, output),
        receive: (sql, run, output) => this.receive(sql, run, output),
        fail: (sql, run, error) => this.fail(sql, run, error),
      });
  }
  get onboarding() {
    return this.delivery.plans.onboarding;
  }
  async eligible(sql: Sql, b: DeliveryBlock) {
    return (
      b.state === 'current' &&
      !b.started_at &&
      Date.now() < Date.parse(this.delivery.content(b).freeze_at) &&
      !(
        await sql.query(
          'SELECT id FROM work_drafts WHERE learning_block_id=$1 UNION ALL SELECT id FROM submission_attempts WHERE learning_block_id=$1 LIMIT 1',
          [b.id],
        )
      ).rowCount
    );
  }
  async sources(sql: Sql, e: Enrolment, ids: string[]) {
    if (!ids.length || new Set(ids).size !== ids.length) return false;
    const rows = await sql.query(
      "SELECT s.id FROM submission_attempts s JOIN grade_attempts g ON g.id=s.approved_grade_id WHERE s.enrolment_id=$1 AND s.organisation_id=$2 AND s.environment=$3 AND s.approved_grade_id=ANY($4::uuid[]) AND g.status='approved'",
      [e.id, e.organisation_id, e.environment, ids],
    );
    return rows.rowCount === ids.length;
  }
  async proposal(sql: Sql, e: Enrolment, id: string) {
    const p = (
      await sql.query<Adaptation>(
        'SELECT * FROM adaptation_proposals WHERE id=$1 AND enrolment_id=$2 AND organisation_id=$3 AND environment=$4',
        [id, e.id, e.organisation_id, e.environment],
      )
    ).rows[0];
    requireCondition(p, 404, 'proposal_unavailable', 'This adaptation proposal is unavailable.');
    return p;
  }
  input(run: AiRun) {
    requireCondition(
      run.task_input,
      409,
      'ai_trace_pruned',
      'Temporary AI input was removed under retention policy. Start a new reviewed request.',
    );
    return JSON.parse(decrypt(run.task_input, this.delivery.key)) as
      AdaptationInput | SuggestionInput;
  }
  async authorize(sql: Sql, run: AiRun, actor: AuthUser, initial: Enrolment) {
    await sql.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
      [actor.id, initial.member_id],
    ]);
    const e = (
      await sql.query<Enrolment>(
        'SELECT * FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3 FOR UPDATE',
        [initial.id, initial.organisation_id, initial.environment],
      )
    ).rows[0];
    await this.onboarding.authorise(sql, actor, e, true);
    const table = run.task === 'propose_adaptation' ? 'adaptation_proposals' : 'kpi_suggestions';
    const subject = (
      await sql.query<{ actor_id: string; status: string }>(
        'SELECT actor_id,status FROM ' +
          table +
          ' WHERE id=$1 AND enrolment_id=$2 AND organisation_id=$3 AND environment=$4',
        [run.subject_id, e.id, e.organisation_id, e.environment],
      )
    ).rows[0];
    requireCondition(
      subject?.actor_id === actor.id && subject.status === 'queued',
      409,
      'support_stale',
      'This support request changed. Create a new request after reviewing current evidence.',
    );
  }
  async plan(sql: Sql, e: Enrolment, id?: string) {
    const p = (
      await sql.query<Programme>(
        "SELECT * FROM programme_versions WHERE enrolment_id=$1 AND organisation_id=$2 AND environment=$3 AND (($4::uuid IS NOT NULL AND id=$4) OR ($4::uuid IS NULL AND state='approved')) ORDER BY version DESC LIMIT 1",
        [e.id, e.organisation_id, e.environment, id ?? null],
      )
    ).rows[0];
    requireCondition(p, 409, 'plan_required', 'An approved programme is required.');
    return p;
  }
  async planData(sql: Sql, p: Programme) {
    const version = (
      await sql.query<OnboardingVersion>(
        'SELECT * FROM onboarding_versions WHERE id=$1 AND enrolment_id=$2',
        [p.onboarding_version_id, p.enrolment_id],
      )
    ).rows[0];
    requireCondition(
      version,
      409,
      'onboarding_required',
      'The pinned onboarding input is unavailable.',
    );
    return this.onboarding.data(version);
  }
  async propose(
    token: string,
    csrf: string,
    client: string,
    id: string,
    evidenceBlock: number,
    reason: string,
  ) {
    z.number().int().min(1).max(12).parse(evidenceBlock);
    this.delivery.reason(reason);
    return this.delivery.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.onboarding.authorise(sql, actor, e, true);
      requireCondition(
        e.status === 'active',
        409,
        'training_inactive',
        'Adaptation requires active training.',
      );
      const ids = (
        await sql.query<{ approved_grade_id: string }>(
          'SELECT s.approved_grade_id FROM submission_attempts s JOIN learning_blocks b ON b.id=s.learning_block_id WHERE s.enrolment_id=$1 AND b.number=$2 AND s.approved_grade_id IS NOT NULL ORDER BY s.created_at,s.id',
          [id, evidenceBlock],
        )
      ).rows.map((r) => r.approved_grade_id);
      requireCondition(
        await this.sources(sql, e, ids),
        409,
        'approved_sources',
        'Approved evidence is required.',
      );
      const calendar = await this.onboarding.calendar(sql, e);
      requireCondition(calendar, 409, 'calendar_required', 'The shared calendar is unavailable.');
      const candidates = (
        await sql.query<DeliveryBlock>(
          "SELECT * FROM learning_blocks WHERE enrolment_id=$1 AND state='current' AND number>=$2 ORDER BY number",
          [id, evidenceBlock + 2],
        )
      ).rows;
      let target: DeliveryBlock | undefined;
      for (const b of candidates)
        if (b.member_calendar_id === calendar.id && (await this.eligible(sql, b))) {
          target = b;
          break;
        }
      const proposalId = randomUUID(),
        status = target ? 'queued' : 'final_support';
      await sql.query(
        'INSERT INTO adaptation_proposals(id,organisation_id,environment,enrolment_id,learning_block_id,member_calendar_id,evidence_block,source_ids,policy_version,status,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)',
        [
          proposalId,
          client,
          e.environment,
          id,
          target?.id ?? null,
          calendar.id,
          evidenceBlock,
          JSON.stringify(ids),
          SUPPORT_POLICY,
          status,
          reason,
          actor.id,
        ],
      );
      let runId: string | null = null;
      if (target) {
        requireCondition(
          this.gateway,
          409,
          'support_unavailable',
          'Support generation is not configured.',
        );
        const plan = await this.plan(sql, e, target.programme_version_id),
          data = await this.planData(sql, plan),
          original = this.delivery.plans.content(plan).blocks[target.number - 1];
        const evidence = (
          await sql.query<{ id: string; scores: string }>(
            'SELECT g.id,d.scores FROM grade_attempts g JOIN grade_decisions d ON d.grade_attempt_id=g.id WHERE g.id=ANY($1::uuid[]) ORDER BY g.id',
            [ids],
          )
        ).rows.map((r) => ({ id: r.id, result: JSON.parse(decrypt(r.scores, this.delivery.key)) }));
        const input: AdaptationInput = {
          task: 'propose_adaptation',
          source_ids: ids,
          replacement: this.delivery.content(target),
          contract: generationInput(
            data,
            plan.onboarding_version_id,
            original,
            target.number - 1,
            '',
          ),
          evidence,
        };
        runId = (
          await this.gateway.requestIn(
            sql,
            actor,
            e,
            'propose_adaptation',
            proposalId,
            input,
            plan.id,
          )
        ).id;
      }
      await this.delivery.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'adaptation.requested',
        proposalId,
        reason,
      );
      return { id: proposalId, status, targetNumber: target?.number ?? null, runId };
    });
  }
  async suggest(token: string, csrf: string, client: string, id: string) {
    return this.delivery.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.onboarding.authorise(sql, actor, e, true);
      requireCondition(
        this.gateway,
        409,
        'support_unavailable',
        'Support generation is not configured.',
      );
      const metrics = (
        await sql.query<KpiVersion>(
          'SELECT DISTINCT ON(number) * FROM kpi_versions WHERE enrolment_id=$1 AND effective_at<=now() ORDER BY number,version DESC',
          [id],
        )
      ).rows;
      requireCondition(
        metrics.length,
        409,
        'metrics_required',
        'KPI evidence snapshots are required.',
      );
      const snapshots = [];
      for (const metric of metrics) snapshots.push(await this.kpis.snapshot(sql, actor, e, metric));
      const suggestionId = randomUUID(),
        ids = snapshots.map((s) => s.id),
        plan = await this.plan(sql, e),
        data = await this.planData(sql, plan);
      await sql.query(
        "INSERT INTO kpi_suggestions(id,organisation_id,environment,enrolment_id,source_ids,status,actor_id) VALUES($1,$2,$3,$4,$5::jsonb,'queued',$6)",
        [suggestionId, client, e.environment, id, JSON.stringify(ids), actor.id],
      );
      const input: SuggestionInput = {
        task: 'suggest_kpi_actions',
        source_ids: ids,
        evidence: snapshots.map((s) => ({
          id: s.id,
          status: s.status,
          value: s.value,
          sample_count: s.sampleCount,
        })),
        daily_minutes: Number(data.schedule!.daily_minutes),
      };
      const run = await this.gateway.requestIn(
        sql,
        actor,
        e,
        'suggest_kpi_actions',
        suggestionId,
        input,
        plan.id,
      );
      return { id: suggestionId, runId: run.id, status: 'queued' };
    });
  }
  async receive(sql: Sql, run: AiRun, output: unknown) {
    const result = validateSupport(run.task, this.input(run), output);
    if ('actions' in result) {
      const changed = await sql.query(
        "UPDATE kpi_suggestions SET actions=$1,status='provisional',updated_at=now() WHERE id=$2 AND enrolment_id=$3 AND organisation_id=$4 AND environment=$5 AND status='queued' RETURNING id",
        [
          encrypt(JSON.stringify(result.actions), this.delivery.key),
          run.subject_id,
          run.enrolment_id,
          run.organisation_id,
          run.environment,
        ],
      );
      requireCondition(changed.rowCount, 409, 'support_stale', 'This support request changed.');
      return;
    }
    const e = (
        await sql.query<Enrolment>(
          'SELECT * FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3',
          [run.enrolment_id, run.organisation_id, run.environment],
        )
      ).rows[0],
      p = await this.proposal(sql, e, run.subject_id);
    requireCondition(
      p.status === 'queued' &&
        p.learning_block_id &&
        (await this.sources(sql, e, p.source_ids)) &&
        (await this.eligible(sql, await this.delivery.block(sql, e, p.learning_block_id))),
      409,
      'proposal_stale',
      'The approved sources or eligible target changed.',
    );
    await sql.query(
      "UPDATE adaptation_proposals SET replacement=$1,reason=$2,status='provisional',updated_at=now() WHERE id=$3",
      [encrypt(JSON.stringify(result.replacement), this.delivery.key), result.reason, p.id],
    );
  }
  async fail(sql: Sql, run: AiRun, error: string) {
    const table = run.task === 'propose_adaptation' ? 'adaptation_proposals' : 'kpi_suggestions';
    await sql.query(
      'UPDATE ' +
        table +
        " SET status=$1,updated_at=now() WHERE id=$2 AND organisation_id=$3 AND environment=$4 AND status='queued'",
      [
        error === 'ambiguous' ? 'ambiguous' : 'failed',
        run.subject_id,
        run.organisation_id,
        run.environment,
      ],
    );
  }
  async approve(
    token: string,
    csrf: string,
    client: string,
    id: string,
    proposalId: string,
    baseId: string,
    reason: string,
  ) {
    this.delivery.reason(reason);
    return this.delivery.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.onboarding.authorise(sql, actor, e, true);
      const p = await this.proposal(sql, e, proposalId),
        calendar = await this.onboarding.calendar(sql, e);
      requireCondition(
        e.status === 'active' &&
          p.status === 'provisional' &&
          p.learning_block_id === baseId &&
          p.policy_version === SUPPORT_POLICY &&
          p.member_calendar_id === calendar?.id,
        409,
        'proposal_stale',
        'Proposal is stale, started or frozen.',
      );
      const base = await this.delivery.block(sql, e, baseId);
      requireCondition(
        base.number >= p.evidence_block + 2 &&
          (await this.sources(sql, e, p.source_ids)) &&
          (await this.eligible(sql, base)),
        409,
        'proposal_stale',
        'Proposal is stale, started or frozen.',
      );
      const run = (
        await sql.query<AiRun>(
          "SELECT * FROM ai_runs WHERE subject_id=$1 AND enrolment_id=$2 AND organisation_id=$3 AND environment=$4 AND task='propose_adaptation'",
          [p.id, id, client, e.environment],
        )
      ).rows[0];
      requireCondition(
        run && p.replacement,
        409,
        'support_result',
        'The pinned support result is unavailable.',
      );
      const replacement = JSON.parse(decrypt(p.replacement, this.delivery.key));
      validateSupport('propose_adaptation', this.input(run), {
        replacement,
        source_ids: p.source_ids,
        reason: p.reason,
      });
      await sql.query(
        "UPDATE learning_blocks SET state='superseded',updated_at=now() WHERE id=$1",
        [base.id],
      );
      const next = randomUUID();
      await sql.query(
        'INSERT INTO learning_blocks(id,organisation_id,environment,enrolment_id,programme_version_id,member_calendar_id,number,version,content,rubric,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
        [
          next,
          client,
          e.environment,
          id,
          base.programme_version_id,
          base.member_calendar_id,
          base.number,
          base.version + 1,
          encrypt(JSON.stringify(replacement), this.delivery.key),
          base.rubric,
          actor.id,
          reason,
        ],
      );
      const quizzes = (
        await sql.query<{ lesson_index: number; questions: string; answer_key: string }>(
          'SELECT * FROM objective_quizzes WHERE learning_block_id=$1',
          [base.id],
        )
      ).rows;
      for (const q of quizzes)
        await sql.query(
          'INSERT INTO objective_quizzes(id,organisation_id,environment,enrolment_id,learning_block_id,lesson_index,questions,answer_key,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [
            randomUUID(),
            client,
            e.environment,
            id,
            next,
            q.lesson_index,
            q.questions,
            q.answer_key,
            actor.id,
            'Preserve reviewed quiz across explicit content or schedule version.',
          ],
        );
      await sql.query(
        "UPDATE adaptation_proposals SET status='approved',approved_by=$1,approved_at=now(),updated_at=now() WHERE id=$2",
        [actor.id, p.id],
      );
      await this.delivery.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'adaptation.approved',
        p.id,
        reason + '; replacement ' + next,
      );
      await this.delivery.notice(sql, e, e.member_id, 'adapted:' + p.id, 'future_plan_updated');
      return { id: next, version: base.version + 1 };
    });
  }
  async read(token: string, client: string, id: string) {
    return this.delivery.db.transaction(async (sql) => {
      const actor = await this.delivery.enrolments.context(sql, token, client),
        e = await this.delivery.enrolments.record(sql, actor, client, id, 'details');
      await this.onboarding.authorise(sql, actor, e);
      const coordinator = (await this.delivery.enrolments.permissions(sql, actor, e)).manage;
      const proposals = (
        await sql.query<Adaptation>(
          "SELECT * FROM adaptation_proposals WHERE enrolment_id=$1 AND ($2::boolean OR status IN ('approved','source_review_required')) ORDER BY created_at DESC,id",
          [id, coordinator],
        )
      ).rows;
      const suggestions = coordinator
        ? (
            await sql.query<Suggestion>(
              'SELECT * FROM kpi_suggestions WHERE enrolment_id=$1 ORDER BY created_at DESC,id LIMIT 10',
              [id],
            )
          ).rows
        : [];
      return {
        coordinator,
        proposals: proposals.map((p) => ({
          id: p.id,
          baseId: p.learning_block_id,
          status: p.status,
          evidenceBlock: p.evidence_block,
          sourceIds: p.source_ids,
          policy: p.policy_version,
          reason: p.reason,
          replacement: p.replacement
            ? (JSON.parse(decrypt(p.replacement, this.delivery.key)) as ReturnType<
                Delivery['content']
              >)
            : null,
          createdAt: p.created_at,
        })),
        suggestions: suggestions.map((s) => ({
          id: s.id,
          status: s.status,
          sourceIds: s.source_ids,
          actions: s.actions ? (JSON.parse(decrypt(s.actions, this.delivery.key)) as string[]) : [],
          createdAt: s.created_at,
        })),
      };
    });
  }
}
