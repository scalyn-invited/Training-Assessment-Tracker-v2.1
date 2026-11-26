import { liveProviders } from './ai-live-providers.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Sql } from '../../database/src/database.js';
import type { AuthUser } from './auth.js';
import type { Enrolment } from './enrolments.js';
import { AiRegistry, type AiTask, type Profile } from './ai-registry.js';
import {
  mockProvider,
  ProviderFailure,
  type Provider,
  type ProviderResult,
} from './ai-provider.js';
import { encrypt, decrypt, digest } from './crypto.js';
import { DomainError, requireCondition } from './errors.js';
import { enqueue, type Job } from './outbox.js';
export type AiRun = {
  id: string;
  organisation_id: string;
  environment: 'test' | 'production';
  enrolment_id: string | null;
  scope?: 'enrolment' | 'assessment_authoring';
  actor_id: string;
  task: AiTask;
  subject_id: string;
  status: string;
  payload_hash: string;
  task_input: string | null;
  reserved: string | number;
  spent: string | number;
  configuration: {
    providers: Profile[];
    prompt: string;
    prompt_hash: string;
    prompt_version: string;
    schema_version: string;
    task: AiTask;
    policy_id: string | null;
    policy_version: number;
    max_calls_per_block: number;
    max_repairs: number;
    currency: string;
  };
};
export type AiBlock = {
  id: string;
  organisation_id: string;
  environment: 'test' | 'production';
  ai_run_id: string;
  status: string;
  block_index: number;
  calls: number;
  repairs: number;
  provider_index: number;
  dispatch_seq: number;
  available_at: Date;
  started_at: Date | null;
  claim_token: string | null;
};
export type TaskHandler = {
  prompt: string;
  promptVersion?: string;
  schemaVersion?: string;
  inputs?: (input: Record<string, unknown>) => Record<string, unknown>[];
  authorizeAuthoring?: (sql: Sql, run: AiRun, actor: AuthUser) => Promise<void>;
  authorize: (sql: Sql, run: AiRun, actor: AuthUser, e: Enrolment) => Promise<void>;
  validate: (
    sql: Sql,
    run: AiRun,
    input: Record<string, unknown>,
    output: unknown,
  ) => Promise<unknown>;
  receive: (sql: Sql, run: AiRun, output: unknown) => Promise<void>;
  fail: (sql: Sql, run: AiRun, error: string) => Promise<void>;
};
export class AiGateway {
  readonly handlers = new Map<AiTask, TaskHandler>();
  constructor(
    readonly registry: AiRegistry,
    readonly key: Buffer,
    readonly providers: Partial<Record<Profile['adapter'], Provider>> = {
      mock: mockProvider,
      ...liveProviders(),
    },
  ) {}
  get db() {
    return this.registry.enrolments.auth.db;
  }
  register(task: AiTask, handler: TaskHandler) {
    this.handlers.set(task, handler);
  }
  async usable(sql: Sql, run: AiRun, profile: Profile, e?: Enrolment) {
    if (run.scope === 'assessment_authoring') {
      this.registry.authoringUsable(profile, run.environment);
      return;
    }
    requireCondition(e, 404, 'enrolment_unavailable', 'Training record is unavailable.');
    await this.registry.usable(sql, profile, e);
  }
  async records(sql: Sql, id: string) {
    const block = (await sql.query<AiBlock>('SELECT * FROM ai_blocks WHERE id=$1 FOR UPDATE', [id]))
      .rows[0];
    if (!block) return null;
    const run = (
      await sql.query<AiRun>(
        'SELECT * FROM ai_runs WHERE id=$1 AND organisation_id=$2 AND environment=$3',
        [block.ai_run_id, block.organisation_id, block.environment],
      )
    ).rows[0];
    return run ? { block, run } : null;
  }
  async authorized(sql: Sql, run: AiRun) {
    const handler = this.handlers.get(run.task);
    requireCondition(
      handler &&
        handler.prompt === run.configuration.prompt &&
        digest(handler.prompt) === run.configuration.prompt_hash &&
        (handler.schemaVersion ?? run.task + '-v1') === run.configuration.schema_version,
      409,
      'stale_prompt',
      'The task definition changed.',
    );
    const actor = await this.registry.actor(sql, run.actor_id, run.environment);
    requireCondition(
      await this.registry.enrolments.access.available(sql, run.organisation_id, run.environment),
      403,
      'client_unavailable',
      'Client is unavailable.',
    );
    if (run.scope === 'assessment_authoring') {
      requireCondition(
        handler.authorizeAuthoring,
        403,
        'authoring_handler',
        'Authoring handler is unavailable.',
      );
      await handler.authorizeAuthoring(sql, run, actor);
      return { handler, actor, e: undefined };
    }
    const e = (
      await sql.query<Enrolment>(
        'SELECT * FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3',
        [run.enrolment_id, run.organisation_id, run.environment],
      )
    ).rows[0];
    requireCondition(e, 404, 'enrolment_unavailable', 'Training record is unavailable.');
    await handler.authorize(sql, run, actor, e);
    return { handler, actor, e };
  }
  async requestIn(
    sql: Sql,
    actor: AuthUser,
    e: Enrolment,
    task: AiTask,
    subject: string,
    input: Record<string, unknown>,
    programme: string | null = null,
    idempotency = subject,
  ) {
    return this.requestScoped(sql, actor, e, task, subject, input, programme, idempotency);
  }
  async requestAuthoring(
    sql: Sql,
    actor: AuthUser,
    client: string,
    idempotency: string,
    input: Record<string, unknown>,
  ) {
    return this.requestScoped(
      sql,
      actor,
      { id: null, organisation_id: client, environment: actor.environment },
      'generate_assessment_topic',
      randomUUID(),
      input,
      null,
      idempotency,
    );
  }
  async requestScoped(
    sql: Sql,
    actor: AuthUser,
    e: Enrolment | { id: null; organisation_id: string; environment: 'test' | 'production' },
    task: AiTask,
    subject: string,
    input: Record<string, unknown>,
    programme: string | null,
    idempotency: string,
  ) {
    const authoring = e.id === null;
    requireCondition(
      authoring === (task === 'generate_assessment_topic'),
      422,
      'ai_scope',
      'Task scope is invalid.',
    );
    await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [e.organisation_id]);
    const handler = this.handlers.get(task);
    requireCondition(handler, 422, 'task_unavailable', 'This analysis task is not configured.');
    const inputs = handler.inputs?.(input) ?? [input];
    requireCondition(
      inputs.length > 0 && inputs.length <= 12,
      422,
      'block_count',
      'Invalid task block count.',
    );
    const json = JSON.stringify(input),
      hash = digest(json),
      snapshot =
        e.id === null
          ? this.registry.authoringSnapshot(e.environment)
          : await this.registry.snapshot(sql, e, task);
    const config = {
      ...snapshot,
      prompt: handler.prompt,
      prompt_hash: digest(handler.prompt),
      prompt_version: handler.promptVersion ?? task + '-v1',
      schema_version: handler.schemaVersion ?? task + '-v1',
    };
    let maximum = 0;
    for (const profile of config.providers) {
      requireCondition(
        inputs.every(
          (part) =>
            Buffer.byteLength(JSON.stringify({ ...part, repair: true })) +
              Buffer.byteLength(handler.prompt) <=
            profile.context_bytes,
        ),
        422,
        'context_limit',
        'The evidence exceeds the configured model context.',
      );
      maximum = Math.max(
        maximum,
        Math.ceil(
          profile.context_bytes * profile.input_rate +
            profile.max_output_tokens * profile.output_rate,
        ),
      );
    }
    const reserve = maximum * config.max_calls_per_block * inputs.length,
      limits = this.registry.config();
    z.number().int().nonnegative().safe().parse(reserve);
    z.number().int().nonnegative().safe().parse(limits.organisationLimit);
    z.number().int().nonnegative().safe().parse(limits.programmeLimit);
    const run: AiRun = {
      id: randomUUID(),
      organisation_id: e.organisation_id,
      environment: e.environment,
      enrolment_id: e.id,
      scope: authoring ? 'assessment_authoring' : 'enrolment',
      actor_id: actor.id,
      task,
      subject_id: subject,
      status: 'queued',
      payload_hash: hash,
      task_input: encrypt(json, this.key),
      reserved: reserve,
      spent: 0,
      configuration: config,
    };
    await this.authorized(sql, run);
    const existing = (
      await sql.query<AiRun>(
        'SELECT * FROM ai_runs WHERE organisation_id=$1 AND environment=$2 AND actor_id=$3 AND idempotency_key=$4',
        [e.organisation_id, e.environment, actor.id, idempotency],
      )
    ).rows[0];
    if (existing) {
      requireCondition(
        existing.enrolment_id === e.id && existing.task === task && existing.payload_hash === hash,
        409,
        'ai_idempotency',
        'Idempotency key has different input.',
      );
      return existing;
    }
    if (authoring) {
      const active = await sql.query(
        "SELECT id FROM ai_runs WHERE organisation_id=$1 AND environment=$2 AND scope='assessment_authoring' AND status IN ('queued','running','ambiguous')",
        [e.organisation_id, e.environment],
      );
      requireCondition(
        !active.rowCount,
        409,
        'authoring_active',
        'An authoring request is active or awaiting reconciliation.',
      );
      const calls = (
        await sql.query(
          "SELECT count(*)::int count FROM ai_runs WHERE organisation_id=$1 AND environment=$2 AND scope='assessment_authoring'",
          [e.organisation_id, e.environment],
        )
      ).rows[0].count;
      const limit = z
        .number()
        .int()
        .nonnegative()
        .safe()
        .parse(limits.authoringCallLimit ?? 0);
      requireCondition(
        calls < limit,
        422,
        'authoring_call_limit',
        'Shared authoring call allowance reached.',
      );
    }
    const spent = (
      await sql.query<{ total: string; programme: string }>(
        "SELECT coalesce(sum(reserved+spent),0) total,coalesce(sum(CASE WHEN (enrolment_id=$3 OR ($3::uuid IS NULL AND scope='assessment_authoring')) THEN reserved+spent ELSE 0 END),0) programme FROM ai_runs WHERE organisation_id=$1 AND environment=$2",
        [e.organisation_id, e.environment, e.id],
      )
    ).rows[0];
    requireCondition(
      BigInt(spent.total) + BigInt(reserve) <= BigInt(limits.organisationLimit) &&
        BigInt(spent.programme) + BigInt(reserve) <=
          BigInt(
            authoring
              ? z
                  .number()
                  .int()
                  .nonnegative()
                  .safe()
                  .parse(limits.authoringLimit ?? 0)
              : limits.programmeLimit,
          ),
      422,
      'spend_limit',
      'AI spending limit reached. Manual review remains available.',
    );
    await sql.query(
      "INSERT INTO ai_runs(id,organisation_id,environment,enrolment_id,actor_id,programme_version_id,idempotency_key,payload_hash,task,subject_id,status,configuration,task_input,reserved,message,scope) VALUES($1,$2,$3,$4,$5,$6,$13,$8,$9,$7::uuid,'queued',$10,$11,$12,'Queued for provisional analysis.',$14)",
      [
        run.id,
        e.organisation_id,
        e.environment,
        e.id,
        actor.id,
        programme,
        subject,
        hash,
        task,
        JSON.stringify(config),
        run.task_input,
        reserve,
        idempotency,
        run.scope,
      ],
    );
    for (let index = 0; index < inputs.length; index++) {
      const block = (
        await sql.query<AiBlock>(
          'INSERT INTO ai_blocks(id,organisation_id,environment,ai_run_id,block_index) VALUES($1,$2,$3,$4,$5) RETURNING *',
          [randomUUID(), e.organisation_id, e.environment, run.id, index],
        )
      ).rows[0];
      await this.dispatch(sql, run, block);
    }
    await this.registry.enrolments.tenancy.audit(
      sql,
      actor,
      e.organisation_id,
      'ai.task_requested',
      run.id,
      'Reserved spending for provisional analysis',
    );
    return run;
  }
  async dispatch(sql: Sql, run: AiRun, block: AiBlock) {
    const seq = block.dispatch_seq + 1;
    const event = await enqueue(
      sql,
      { organisationId: run.organisation_id, environment: run.environment, actorId: run.actor_id },
      'ai.task',
      'ai:' + block.id + ':' + seq,
      { blockId: block.id, generation: seq },
    );
    await sql.query('UPDATE outbox_events SET available_at=$1 WHERE id=$2', [
      block.available_at,
      event,
    ]);
    await sql.query('UPDATE ai_blocks SET dispatch_seq=$1,updated_at=now() WHERE id=$2', [
      seq,
      block.id,
    ]);
  }
  async stop(sql: Sql, run: AiRun, block: AiBlock, error: string) {
    const state = error === 'ambiguous' ? 'ambiguous' : 'failed';
    await sql.query(
      'UPDATE ai_runs SET status=$1,reserved=$2,message=$3,updated_at=now() WHERE id=$4',
      [
        state,
        state === 'ambiguous' ? run.reserved : 0,
        'Task stopped: ' + error + '. Human review or reconciliation is required.',
        run.id,
      ],
    );
    await sql.query('UPDATE ai_blocks SET status=$1,updated_at=now() WHERE id=$2', [
      state,
      block.id,
    ]);
    await sql.query(
      "UPDATE ai_attempts SET status=$1,updated_at=now() WHERE ai_block_id=$2 AND status='running'",
      [error, block.id],
    );
    await sql.query(
      "UPDATE ai_blocks SET status='cancelled',updated_at=now() WHERE ai_run_id=$1 AND status='queued'",
      [run.id],
    );
    await this.handlers.get(run.task)?.fail(sql, run, error);
    await sql.query(
      'INSERT INTO audit_events(id,organisation_id,environment,actor_id,action,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        randomUUID(),
        run.organisation_id,
        run.environment,
        run.actor_id,
        'ai.task_stopped',
        run.id,
        JSON.stringify({ error }),
      ],
    );
  }
  async lease(sql: Sql, job: Job) {
    return Boolean(
      (
        await sql.query(
          "SELECT id FROM outbox_events WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND status='processing' AND lease_token=$4 AND lease_until>now()",
          [job.id, job.organisation_id, job.environment, job.lease_token],
        )
      ).rowCount,
    );
  }
  async invoke(
    adapter: Provider,
    profile: Profile & { prompt: string },
    input: Record<string, unknown>,
  ) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        adapter(profile, input, controller.signal),
        new Promise<ProviderResult>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new ProviderFailure('ambiguous'));
          }, 90000);
          timer.unref();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  blockInputs(run: AiRun) {
    requireCondition(
      run.task_input,
      409,
      'ai_trace_pruned',
      'Temporary AI input was removed under retention policy. Start a new reviewed request.',
    );
    const input = JSON.parse(decrypt(run.task_input, this.key)) as Record<string, unknown>;
    return this.handlers.get(run.task)?.inputs?.(input) ?? [input];
  }
  async process(job: Job) {
    requireCondition(
      job.environment === (process.env.NODE_ENV === 'production' ? 'production' : 'test'),
      403,
      'environment_mismatch',
      'Cannot process another environment.',
    );
    const id = z.uuid().parse(job.payload.blockId);
    const claim = await this.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [job.organisation_id]);
      const found = await this.records(sql, id);
      if (!found) return null;
      const { run, block } = found;
      requireCondition(
        run.organisation_id === job.organisation_id &&
          run.environment === job.environment &&
          run.actor_id === job.actor_id,
        403,
        'job_scope',
        'Job scope changed.',
      );
      if (
        !(await this.lease(sql, job)) ||
        !['queued', 'running'].includes(run.status) ||
        block.status !== 'queued' ||
        block.dispatch_seq !== job.payload.generation ||
        block.available_at > new Date()
      )
        return null;
      if (
        (
          await sql.query(
            "SELECT id FROM ai_blocks WHERE organisation_id=$1 AND environment=$2 AND status='running'",
            [run.organisation_id, run.environment],
          )
        ).rowCount
      )
        return null;
      let profile: Profile;
      try {
        const { e } = await this.authorized(sql, run);
        profile = run.configuration.providers[block.provider_index];
        await this.usable(sql, run, this.registry.profile(profile.id, run.task), e);
        await this.usable(sql, run, profile, e);
      } catch {
        await this.stop(sql, run, block, 'stale');
        return null;
      }
      await sql.query('INSERT INTO ai_provider_locks(provider) VALUES($1) ON CONFLICT DO NOTHING', [
        profile.id,
      ]);
      await sql.query('SELECT provider FROM ai_provider_locks WHERE provider=$1 FOR UPDATE', [
        profile.id,
      ]);
      const rate = Number(
        (
          await sql.query(
            "SELECT count(*) count FROM ai_attempts WHERE provider=$1 AND created_at>=now()-interval '1 minute'",
            [profile.id],
          )
        ).rows[0].count,
      );
      if (rate >= profile.requests_per_minute) {
        const updated = (
          await sql.query<AiBlock>(
            "UPDATE ai_blocks SET available_at=now()+interval '1 minute' WHERE id=$1 RETURNING *",
            [id],
          )
        ).rows[0];
        await this.dispatch(sql, run, updated);
        return null;
      }
      const token = randomUUID(),
        attempt = randomUUID();
      await sql.query(
        "UPDATE ai_blocks SET status='running',calls=calls+1,started_at=now(),claim_token=$1,updated_at=now() WHERE id=$2",
        [token, id],
      );
      await sql.query(
        "INSERT INTO ai_attempts(id,organisation_id,environment,ai_block_id,number,provider,model,status) VALUES($1,$2,$3,$4,$5,$6,$7,'running')",
        [
          attempt,
          run.organisation_id,
          run.environment,
          id,
          block.calls + 1,
          profile.id,
          profile.model,
        ],
      );
      await sql.query("UPDATE ai_runs SET status='running',updated_at=now() WHERE id=$1", [run.id]);
      return {
        run,
        block,
        profile,
        token,
        attempt,
        input: this.blockInputs(run)[block.block_index],
      };
    });
    if (!claim) return;
    const started = Date.now();
    let result: ProviderResult | undefined,
      output: unknown,
      error: string | null = null;
    try {
      const adapter = this.providers[claim.profile.adapter];
      if (!adapter) throw new ProviderFailure('unavailable');
      result = await this.invoke(
        adapter,
        { ...claim.profile, prompt: claim.run.configuration.prompt },
        { ...claim.input, repair: claim.block.repairs > 0 },
      );
      if (
        !Number.isSafeInteger(result.inputTokens) ||
        !Number.isSafeInteger(result.outputTokens) ||
        result.inputTokens < 0 ||
        result.outputTokens < 0
      )
        throw new ProviderFailure('ambiguous');
      if (result.refused) throw new ProviderFailure('refused');
      if (Buffer.byteLength(result.text) > 2 * 1024 * 1024)
        throw new ProviderFailure('invalid_output');
      try {
        output = JSON.parse(result.text);
      } catch {
        throw new ProviderFailure('invalid_output');
      }
      if (!output || typeof output !== 'object' || Array.isArray(output))
        throw new ProviderFailure('invalid_output');
    } catch (cause) {
      error = cause instanceof ProviderFailure ? cause.kind : 'ambiguous';
    }
    await this.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [job.organisation_id]);
      const found = await this.records(sql, id);
      if (!found) return;
      const { run, block } = found;
      if (
        block.status !== 'running' ||
        block.claim_token !== claim.token ||
        run.status !== 'running'
      )
        return;
      if (!(await this.lease(sql, job))) {
        await this.stop(sql, run, block, 'ambiguous');
        return;
      }
      const usage =
        result &&
        Number.isSafeInteger(result.inputTokens) &&
        Number.isSafeInteger(result.outputTokens) &&
        result.inputTokens >= 0 &&
        result.outputTokens >= 0;
      let cost = usage
        ? Math.ceil(
            result!.inputTokens * claim.profile.input_rate +
              result!.outputTokens * claim.profile.output_rate,
          )
        : null;
      if (cost !== null && !Number.isSafeInteger(cost)) {
        cost = null;
        error = 'ambiguous';
      }
      await sql.query(
        'UPDATE ai_attempts SET status=$1,external_id=$2,input_tokens=$3,output_tokens=$4,cost=$5,latency_ms=$6,updated_at=now() WHERE id=$7',
        [
          error ?? 'received',
          result?.externalId?.slice(0, 200) ?? null,
          usage ? result!.inputTokens : null,
          usage ? result!.outputTokens : null,
          cost,
          Math.min(Date.now() - started, 2147483647),
          claim.attempt,
        ],
      );
      if (cost !== null) {
        const overrun = BigInt(cost) > BigInt(run.reserved);
        run.spent = (BigInt(run.spent) + BigInt(cost)).toString();
        run.reserved = (overrun ? 0n : BigInt(run.reserved) - BigInt(cost)).toString();
        await sql.query('UPDATE ai_runs SET spent=$1,reserved=$2 WHERE id=$3', [
          run.spent,
          run.reserved,
          run.id,
        ]);
        if (overrun) {
          await this.stop(sql, run, block, 'budget_overrun');
          return;
        }
      }
      let handler: TaskHandler;
      try {
        const current = await this.authorized(sql, run);
        handler = current.handler;
        await this.usable(sql, run, this.registry.profile(claim.profile.id, run.task), current.e);
        await this.usable(sql, run, claim.profile, current.e);
      } catch {
        await this.stop(sql, run, block, error === 'ambiguous' ? 'ambiguous' : 'stale');
        return;
      }
      if (!error) {
        try {
          output = await handler.validate(sql, run, claim.input, output);
        } catch {
          error = 'invalid_output';
        }
      }
      if (
        ((error === 'invalid_output' && block.repairs < run.configuration.max_repairs) ||
          (error === 'throttled' && block.calls < 4)) &&
        block.calls < run.configuration.max_calls_per_block
      ) {
        let next = block.provider_index;
        if (error === 'throttled' && run.configuration.providers[next + 1]) next++;
        const delay = error === 'throttled' ? 10 * block.calls + Math.floor(Math.random() * 6) : 0;
        const updated = (
          await sql.query<AiBlock>(
            "UPDATE ai_blocks SET status='queued',repairs=repairs+$1,provider_index=$2,available_at=now()+($3::int*interval '1 second'),claim_token=NULL,updated_at=now() WHERE id=$4 RETURNING *",
            [error === 'invalid_output' ? 1 : 0, next, delay, id],
          )
        ).rows[0];
        await sql.query('UPDATE ai_attempts SET status=$1 WHERE id=$2', [error, claim.attempt]);
        await this.dispatch(sql, run, updated);
        return;
      }
      if (error) {
        await sql.query('UPDATE ai_attempts SET status=$1 WHERE id=$2', [error, claim.attempt]);
        await this.stop(sql, run, block, error);
        return;
      }
      await sql.query("UPDATE ai_attempts SET status='validated' WHERE id=$1", [claim.attempt]);
      await sql.query(
        "UPDATE ai_blocks SET status='complete',output=$1,updated_at=now() WHERE id=$2",
        [encrypt(JSON.stringify(output), this.key), id],
      );
      const completed = (
        await sql.query<{ status: string; output: string }>(
          'SELECT status,output FROM ai_blocks WHERE ai_run_id=$1 ORDER BY block_index',
          [run.id],
        )
      ).rows;
      if (completed.some((part) => part.status !== 'complete')) return;
      await sql.query('SAVEPOINT apply_ai_result');
      try {
        await handler.receive(
          sql,
          run,
          handler.inputs
            ? completed.map((part) => JSON.parse(decrypt(part.output, this.key)))
            : output,
        );
        await sql.query('RELEASE SAVEPOINT apply_ai_result');
      } catch (cause) {
        await sql.query('ROLLBACK TO SAVEPOINT apply_ai_result');
        await sql.query('RELEASE SAVEPOINT apply_ai_result');
        if (!(cause instanceof DomainError)) throw cause;
        await this.stop(sql, run, block, 'stale');
        return;
      }
      await sql.query(
        "UPDATE ai_runs SET status='complete',reserved=0,message='Provisional result ready for human review.',updated_at=now() WHERE id=$1",
        [run.id],
      );
    });
  }
  async recover() {
    const environment = process.env.NODE_ENV === 'production' ? 'production' : 'test';
    const refs = (
      await this.db.pool.query<{ id: string; organisation_id: string }>(
        "SELECT id,organisation_id FROM ai_blocks WHERE environment=$1 AND status IN ('running','queued') ORDER BY id",
        [environment],
      )
    ).rows;
    for (const ref of refs)
      await this.db.transaction(async (sql) => {
        await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [
          ref.organisation_id,
        ]);
        const found = await this.records(sql, ref.id);
        if (!found) return;
        const { run, block } = found;
        if (block.status === 'running') {
          if (block.started_at && block.started_at <= new Date(Date.now() - 180000))
            await this.stop(sql, run, block, 'ambiguous');
          return;
        }
        if (block.status !== 'queued' || !['queued', 'running'].includes(run.status)) return;
        try {
          await this.authorized(sql, run);
        } catch {
          await this.stop(sql, run, block, 'stale');
          return;
        }
        const active = await sql.query(
          "SELECT id FROM outbox_events WHERE organisation_id=$1 AND environment=$2 AND kind='ai.task' AND payload->>'blockId'=$3 AND (status='pending' OR (status='processing' AND lease_until>now()))",
          [run.organisation_id, run.environment, block.id],
        );
        if (!active.rowCount) await this.dispatch(sql, run, block);
      });
  }
  async reconcile(
    token: string,
    csrf: string,
    client: string,
    id: string,
    total: number,
    reason: string,
  ) {
    z.number().int().nonnegative().safe().parse(total);
    z.string().min(8).max(2000).parse(reason);
    return this.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
      const actor = await this.registry.admin(sql, token, client, csrf);
      const run = (
        await sql.query<AiRun>(
          'SELECT * FROM ai_runs WHERE id=$1 AND organisation_id=$2 AND environment=$3 FOR UPDATE',
          [id, client, actor.environment],
        )
      ).rows[0];
      requireCondition(run, 404, 'run_unavailable', 'Analysis run is unavailable.');
      requireCondition(
        run.status === 'ambiguous' && total >= Number(run.spent),
        409,
        'reconcile_conflict',
        'Reconciliation must include all known charges.',
      );
      await sql.query(
        "UPDATE ai_runs SET spent=$1,reserved=0,status='failed',message='Charges reconciled by administrator. A new request is required.',updated_at=now() WHERE id=$2",
        [total, id],
      );
      await this.registry.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'ai.charge_reconciled',
        id,
        reason,
      );
      return { id, spent: total, reserved: 0, status: 'failed' };
    });
  }
}
