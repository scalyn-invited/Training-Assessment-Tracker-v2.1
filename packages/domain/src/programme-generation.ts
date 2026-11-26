import { z } from 'zod';
import type { Sql } from '../../database/src/database.js';
import type { AuthUser } from './auth.js';
import type { Enrolment } from './enrolments.js';
import { LearningPlans, type Programme } from './learning-plans.js';
import { AiGateway, type AiRun } from './ai-gateway.js';
import { decrypt } from './crypto.js';
import { requireCondition } from './errors.js';
import {
  generationInput,
  GENERATION_PROMPT,
  validateGeneratedBlock,
  type GenerationInput,
} from './programme-generation-contract.js';
type Input = { baseVersion: number; baseId: string; feedback: string; blocks: GenerationInput[] };
export class ProgrammeGeneration {
  constructor(
    readonly plans: LearningPlans,
    readonly gateway: AiGateway,
  ) {
    gateway.register('generate_programme', {
      prompt: GENERATION_PROMPT,
      promptVersion: 'generation-v1',
      schemaVersion: 'block-v1',
      inputs: (input) => (input as Input).blocks,
      authorize: (sql, run, actor, e) => this.authorize(sql, run, actor, e),
      validate: async (_sql, _run, input, output) =>
        validateGeneratedBlock(output, input as GenerationInput),
      receive: (sql, run, output) => this.receive(sql, run, output),
      fail: async () => {},
    });
  }
  input(run: AiRun): Input {
    requireCondition(
      run.task_input,
      409,
      'ai_trace_pruned',
      'Temporary AI input was removed under retention policy. Start a new reviewed request.',
    );
    return JSON.parse(decrypt(run.task_input, this.gateway.key));
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
    await this.plans.onboarding.authorise(sql, actor, e, true);
    requireCondition(
      ['onboarding', 'ready'].includes(e.status),
      409,
      'training_active',
      'Generation is unavailable after training starts.',
    );
    const input = this.input(run),
      plan = await this.plans.current(sql, e, input.baseVersion);
    requireCondition(
      plan && plan.id === input.baseId && run.subject_id === plan.id,
      409,
      'generation_base_changed',
      'The generation baseline changed.',
    );
    await this.plans.inputs(sql, e, plan);
  }
  async request(
    token: string,
    csrf: string,
    client: string,
    id: string,
    expected: number,
    key: string,
    feedback = '',
  ) {
    z.number().int().positive().parse(expected);
    z.string().min(1).max(80).parse(key);
    z.string().max(4000).parse(feedback);
    return this.plans.onboarding.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.plans.onboarding.authorise(sql, actor, e, true);
      const existing = (
        await sql.query<AiRun>(
          'SELECT * FROM ai_runs WHERE organisation_id=$1 AND environment=$2 AND actor_id=$3 AND idempotency_key=$4',
          [client, actor.environment, actor.id, key],
        )
      ).rows[0];
      if (existing) {
        requireCondition(
          existing.task === 'generate_programme' && existing.enrolment_id === id,
          409,
          'ai_idempotency',
          'The request key was already used for another task.',
        );
        const previous = this.input(existing);
        requireCondition(
          previous.baseVersion === expected && previous.feedback === feedback,
          409,
          'ai_idempotency',
          'The request key was already used for different inputs.',
        );
        return this.publicRun(existing);
      }
      requireCondition(
        !(
          await sql.query(
            "SELECT id FROM ai_runs WHERE enrolment_id=$1 AND organisation_id=$2 AND environment=$3 AND task='generate_programme' AND status IN ('queued','running','ambiguous')",
            [id, client, actor.environment],
          )
        ).rowCount,
        409,
        'generation_pending',
        'Resolve the existing generation before starting another.',
      );
      const plan = await this.plans.current(sql, e, expected);
      requireCondition(plan, 409, 'programme_required', 'Create a curriculum draft first.');
      const { data } = await this.plans.inputs(sql, e, plan);
      const input: Input = {
        baseVersion: plan.version,
        baseId: plan.id,
        feedback,
        blocks: this.plans
          .content(plan)
          .blocks.map((block, index) =>
            generationInput(data, plan.onboarding_version_id, block, index, feedback),
          ),
      };
      const run = await this.gateway.requestIn(
        sql,
        actor,
        e,
        'generate_programme',
        plan.id,
        input,
        plan.id,
        key,
      );
      return this.publicRun(run);
    });
  }
  publicRun(run: AiRun) {
    return {
      id: run.id,
      status: run.status,
      reserved: Number(run.reserved),
      spent: Number(run.spent),
    };
  }
  async receive(sql: Sql, run: AiRun, output: unknown) {
    const { actor, e } = await this.gateway.authorized(sql, run);
    requireCondition(e, 422, 'ai_scope', 'Programme generation requires an enrolment.');
    const input = this.input(run),
      base = await this.plans.current(sql, e, input.baseVersion);
    requireCondition(
      base && base.id === input.baseId,
      409,
      'generation_base_changed',
      'The generation baseline changed.',
    );
    const { draft, calendar } = await this.plans.inputs(sql, e, base),
      content = this.plans.content(base);
    requireCondition(
      Array.isArray(output) && output.length === content.blocks.length,
      409,
      'generation_incomplete',
      'Every block must complete before a draft is created.',
    );
    content.blocks = content.blocks.map((block, index) => ({
      ...block,
      ...validateGeneratedBlock(output[index], input.blocks[index]),
    }));
    content.generation_run_id = run.id;
    await this.plans.validate(sql, e, base, content);
    const next = await this.plans.snapshot(
      sql,
      actor,
      e,
      draft,
      calendar,
      content,
      'AI draft ' + run.id + '; coordinator review required.',
      base,
    );
    await sql.query('UPDATE ai_runs SET result_version_id=$1 WHERE id=$2', [next.id, run.id]);
    await this.plans.onboarding.enrolments.tenancy.audit(
      sql,
      actor,
      e.organisation_id,
      'ai.draft_created',
      run.id,
      'Created draft version ' + next.version + '; human approval required',
    );
  }
  async read(token: string, client: string, id: string, runId?: string) {
    return this.gateway.db.transaction(async (sql) => {
      const actor = await this.plans.onboarding.enrolments.context(sql, token, client),
        e = await this.plans.onboarding.enrolments.record(sql, actor, client, id, 'details');
      await this.plans.onboarding.authorise(sql, actor, e, true);
      const rows = (
        await sql.query<
          AiRun & { message: string; created_at: Date; result_version: number | null }
        >(
          "SELECT r.*,p.version result_version FROM ai_runs r LEFT JOIN programme_versions p ON p.id=r.result_version_id AND p.organisation_id=r.organisation_id AND p.environment=r.environment WHERE r.enrolment_id=$1 AND r.organisation_id=$2 AND r.environment=$3 AND r.task='generate_programme' AND ($4::uuid IS NULL OR r.id=$4) ORDER BY r.created_at DESC LIMIT 10",
          [id, client, actor.environment, runId ?? null],
        )
      ).rows;
      return {
        enrolment: { id: e.id, title: e.title },
        runs: await Promise.all(
          rows.map(async (run) => ({
            ...this.publicRun(run),
            message: run.message,
            createdAt: run.created_at,
            resultVersion: run.result_version,
            baseVersion: run.task_input ? this.input(run).baseVersion : null,
            feedback: run.task_input ? this.input(run).feedback : '',
            configuration: {
              policyVersion: run.configuration.policy_version,
              promptVersion: run.configuration.prompt_version,
              schemaVersion: run.configuration.schema_version,
              providers: run.configuration.providers.map((p) => ({
                id: p.id,
                model: p.model,
                version: p.version,
                rateVersion: p.rate_version,
                synthetic: p.adapter === 'mock',
              })),
            },
            attempts: (
              await sql.query(
                'SELECT a.provider,a.model,a.status,a.input_tokens,a.output_tokens,a.external_id,b.block_index FROM ai_attempts a JOIN ai_blocks b ON b.id=a.ai_block_id AND b.organisation_id=a.organisation_id AND b.environment=a.environment WHERE b.ai_run_id=$1 AND a.organisation_id=$2 AND a.environment=$3 ORDER BY b.block_index,a.number',
                [run.id, client, actor.environment],
              )
            ).rows,

            blocks: (
              await sql.query(
                'SELECT block_index,status,calls,repairs FROM ai_blocks WHERE ai_run_id=$1 AND organisation_id=$2 AND environment=$3 ORDER BY block_index',
                [run.id, client, actor.environment],
              )
            ).rows,
          })),
        ),
      };
    });
  }
}
