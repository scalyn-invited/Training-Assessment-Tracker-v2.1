import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Sql } from '../../database/src/database.js';
import { Enrolments, type Enrolment } from './enrolments.js';
import type { AuthUser } from './auth.js';
import { requireCondition } from './errors.js';
export const AI_TASKS = [
  'generate_programme',
  'assess_initial',
  'grade_submission',
  'propose_adaptation',
  'suggest_kpi_actions',
  'generate_assessment_topic',
] as const;
export type AiTask = (typeof AI_TASKS)[number];
const profileSchema = z.object({
  adapter: z.enum(['mock', 'anthropic', 'gemini']),
  model: z.string().trim().min(1),
  version: z.string().min(1),
  enabled: z.literal(true),
  data_classes: z.array(z.enum(['synthetic', 'confirmed_training'])),
  purposes: z.array(z.enum(AI_TASKS)),
  context_bytes: z.number().int().positive(),
  max_output_tokens: z.number().int().positive(),
  input_rate: z.number().nonnegative(),
  output_rate: z.number().nonnegative(),
  rate_version: z.string().min(1),
  currency: z.literal('USD'),
  requests_per_minute: z.number().int().positive(),
  secret_reference: z.string().optional(),
  endpoint: z.string().optional(),
});
export type Profile = z.infer<typeof profileSchema> & { id: string };
export type AiConfig = {
  providers: Record<string, unknown>;
  liveEnabled: boolean;
  organisationLimit: number;
  programmeLimit: number;
  authoringLimit?: number;
  authoringCallLimit?: number;
};
export function aiConfig(): AiConfig {
  const live = (name: string, adapter: 'anthropic' | 'gemini', endpoint: string) => ({
    adapter,
    model: process.env['AI_' + name + '_MODEL'],
    version: '1',
    enabled: process.env['AI_' + name + '_ENABLED'] === 'true',
    data_classes: (process.env['AI_' + name + '_DATA_CLASSES'] ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
    purposes: ['generate_programme'],
    context_bytes: 60000,
    max_output_tokens: 12000,
    input_rate:
      process.env['AI_' + name + '_INPUT_RATE'] === undefined
        ? undefined
        : Number(process.env['AI_' + name + '_INPUT_RATE']),
    output_rate:
      process.env['AI_' + name + '_OUTPUT_RATE'] === undefined
        ? undefined
        : Number(process.env['AI_' + name + '_OUTPUT_RATE']),
    rate_version: process.env['AI_' + name + '_RATE_VERSION'],
    currency: 'USD',
    requests_per_minute: 10,
    secret_reference: 'ai.secrets.' + adapter,
    endpoint,
  });
  return {
    authoringLimit: Number(process.env.AI_AUTHORING_LIMIT_MICRO_USD ?? 0),
    authoringCallLimit: Number(process.env.AI_AUTHORING_CALL_LIMIT ?? 0),
    liveEnabled: process.env.AI_LIVE_ENABLED === 'true',
    organisationLimit: Number(process.env.AI_ORGANISATION_LIMIT_MICRO_USD ?? 10000000),
    programmeLimit: Number(process.env.AI_PROGRAMME_LIMIT_MICRO_USD ?? 5000000),
    providers: {
      mock: {
        adapter: 'mock',
        model: 'synthetic-lessons-v1',
        version: '1',
        enabled: true,
        data_classes: ['synthetic'],
        purposes: [...AI_TASKS],
        context_bytes: 60000,
        max_output_tokens: 12000,
        input_rate: 1,
        output_rate: 1,
        rate_version: 'synthetic-ledger-v1',
        currency: 'USD',
        requests_per_minute: 30,
      },
      anthropic: live('ANTHROPIC', 'anthropic', 'https://api.anthropic.com/v1/messages'),
      gemini: live('GEMINI', 'gemini', 'https://generativelanguage.googleapis.com/v1beta/models/'),
    },
  };
}
export class AiRegistry {
  constructor(
    readonly enrolments: Enrolments,
    readonly config: () => AiConfig = aiConfig,
  ) {}
  profile(id: string, task: AiTask): Profile {
    z.enum(AI_TASKS).parse(task);
    const parsed = profileSchema.safeParse(this.config().providers[id]);
    requireCondition(
      parsed.success && parsed.data.purposes.includes(task),
      422,
      'provider_unavailable',
      'Provider configuration needs an enabled, qualified model, limits and pricing for this task.',
    );
    requireCondition(
      !(process.env.NODE_ENV === 'production' && parsed.data.adapter === 'mock'),
      422,
      'mock_production',
      'AI generation is not configured.',
    );
    return { ...parsed.data, id };
  }
  authoringUsable(profile: Profile, environment: string) {
    requireCondition(
      environment === 'test' &&
        process.env.NODE_ENV !== 'production' &&
        profile.adapter === 'mock' &&
        profile.id === 'mock' &&
        profile.data_classes.includes('synthetic'),
      422,
      'authoring_provider_disabled',
      'Only the fixed local synthetic authoring fixture is enabled. Paid API and Codex adapters are disabled.',
    );
  }
  authoringSnapshot(environment: string) {
    const profile = this.profile('mock', 'generate_assessment_topic');
    this.authoringUsable(profile, environment);
    return {
      task: 'generate_assessment_topic' as const,
      policy_id: null,
      policy_version: 0,
      providers: [profile],
      max_calls_per_block: 1,
      max_repairs: 0,
      currency: 'USD',
    };
  }
  async usable(sql: Sql, profile: Profile, e: Enrolment) {
    const member = (
      await sql.query<{ is_synthetic: boolean }>(
        'SELECT is_synthetic FROM users WHERE id=$1 AND environment=$2',
        [e.member_id, e.environment],
      )
    ).rows[0];
    requireCondition(member, 404, 'member_unavailable', 'Member is unavailable.');
    const classification = member.is_synthetic ? 'synthetic' : 'confirmed_training';
    requireCondition(
      profile.data_classes.includes(classification),
      422,
      'provider_classification',
      'Provider is not approved for this data classification.',
    );
    requireCondition(
      profile.adapter !== 'mock' ||
        (classification === 'synthetic' &&
          e.environment === 'test' &&
          process.env.NODE_ENV !== 'production'),
      422,
      'mock_scope',
      'Mock generation is restricted to the local synthetic sandbox.',
    );
    requireCondition(
      profile.adapter === 'mock' || (this.config().liveEnabled && classification !== 'synthetic'),
      422,
      'live_disabled',
      'Live generation is disabled or the input is synthetic.',
    );
  }
  async admin(sql: Sql, token: string, client: string, csrf?: string) {
    const actor = await this.enrolments.context(sql, token, client, csrf);
    requireCondition(
      await this.enrolments.access.administer(sql, actor, client),
      403,
      'admin_required',
      'Client administration authority is required.',
    );
    return actor;
  }
  async policy(sql: Sql, client: string, environment: string, task: AiTask) {
    return (
      await sql.query<{ id: string; version: number; routing: string[] }>(
        'SELECT id,version,routing FROM ai_policies WHERE organisation_id=$1 AND environment=$2 AND task=$3 ORDER BY version DESC LIMIT 1',
        [client, environment, task],
      )
    ).rows[0];
  }
  async snapshot(sql: Sql, e: Enrolment, task: AiTask) {
    const policy = await this.policy(sql, e.organisation_id, e.environment, task),
      providers: Profile[] = [];
    for (const id of policy?.routing ?? ['mock']) {
      const profile = this.profile(id, task);
      await this.usable(sql, profile, e);
      providers.push(profile);
    }
    return {
      task,
      policy_id: policy?.id ?? null,
      policy_version: policy?.version ?? 0,
      providers,
      max_calls_per_block: 5,
      max_repairs: 1,
      currency: 'USD',
    };
  }
  async settings(token: string, client: string) {
    return this.enrolments.auth.db.transaction(async (sql) => {
      const actor = await this.admin(sql, token, client);
      const policies: { task: AiTask; version: number; routing: string[] }[] = [];
      for (const task of AI_TASKS)
        policies.push({
          task,
          ...((await this.policy(sql, client, actor.environment, task)) ?? {
            version: 0,
            routing: ['mock'],
          }),
        });
      // Explicit public metadata only: never return provider credentials or arbitrary configuration.
      const providers = Object.entries(this.config().providers).flatMap(([id, value]) => {
        const publicProfile = z
          .object({
            adapter: z.enum(['mock', 'anthropic', 'gemini']),
            model: z.string().optional(),
            context_bytes: z.number().int().positive(),
            max_output_tokens: z.number().int().positive(),
          })
          .safeParse(value);
        if (
          !publicProfile.success ||
          (actor.environment === 'production' && publicProfile.data.adapter === 'mock')
        )
          return [];
        const qualified = profileSchema.safeParse(value);
        return [
          {
            id,
            adapter: publicProfile.data.adapter,
            model: publicProfile.data.model ?? 'Model not configured',
            enabled: qualified.success,
            contextBytes: publicProfile.data.context_bytes,
            maxOutputTokens: publicProfile.data.max_output_tokens,
            purposes: qualified.success ? qualified.data.purposes : [],
            currency: 'USD',
            rateVersion: qualified.success ? qualified.data.rate_version : 'Not configured',
          },
        ];
      });
      const ambiguous = (
        await sql.query<{ id: string; spent: string; reserved: string }>(
          "SELECT id,spent,reserved FROM ai_runs WHERE organisation_id=$1 AND environment=$2 AND status='ambiguous' ORDER BY created_at",
          [client, actor.environment],
        )
      ).rows;
      return {
        policies,
        providers,
        ambiguous,
        organisationLimit: this.config().organisationLimit,
        programmeLimit: this.config().programmeLimit,
      };
    });
  }
  async save(
    token: string,
    csrf: string,
    client: string,
    task: AiTask,
    expected: number,
    primary: string,
    fallback: string | null,
  ) {
    z.enum(AI_TASKS).parse(task);
    z.number().int().min(0).parse(expected);
    z.string().min(1).parse(primary);
    return this.enrolments.auth.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
      const actor = await this.admin(sql, token, client, csrf),
        latest = await this.policy(sql, client, actor.environment, task);
      requireCondition(
        (latest?.version ?? 0) === expected,
        409,
        'stale_routing',
        'Routing changed; reload before saving.',
      );
      const routing = [...new Set([primary, fallback].filter((v): v is string => Boolean(v)))];
      for (const id of routing) this.profile(id, task);
      const id = randomUUID();
      await sql.query(
        'INSERT INTO ai_policies(id,organisation_id,environment,task,version,routing,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [id, client, actor.environment, task, expected + 1, JSON.stringify(routing), actor.id],
      );
      await this.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'ai.routing_changed',
        id,
        'Updated provider routing',
      );
      return { id, version: expected + 1 };
    });
  }
  async actor(sql: Sql, id: string, environment: string): Promise<AuthUser> {
    const actor = (
      await sql.query<AuthUser>(
        'SELECT id,name,email,global_admin,permission_version,environment FROM users WHERE id=$1 AND environment=$2',
        [id, environment],
      )
    ).rows[0];
    requireCondition(
      actor && (await this.enrolments.access.active(sql, id, environment)),
      403,
      'actor_unavailable',
      'The requesting actor no longer has current access.',
    );
    return actor;
  }
}
