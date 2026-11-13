import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Sql } from '../../database/src/database.js';
import type { Enrolment } from './enrolments.js';
import { LearningKpiRecords, type KpiVersion } from './learning-kpi-records.js';
import { encrypt } from './crypto.js';
import { requireCondition } from './errors.js';
const text = (max: number) => z.string().trim().min(1).max(max);
export const kpiDefinitionSchema = z.object({
  name: text(200),
  rationale: text(1000),
  unit: text(100),
  target: z.number(),
  baseline: text(200),
  direction: z.enum(['higher', 'lower', 'band']),
  upper_target: z.number().nullable().optional(),
  formula: z.enum(['approved_grade_mean', 'manual_mean']),
  sample_minimum: z.number().int().min(1).max(100),
  evidence_type: z.enum(['demonstrated_competence', 'workplace_outcome']),
});
export class LearningKpis extends LearningKpiRecords {
  async metric(sql: Sql, e: Enrolment, id: string) {
    const metric = (
      await sql.query<KpiVersion>(
        'SELECT * FROM kpi_versions WHERE id=$1 AND enrolment_id=$2 AND organisation_id=$3 AND environment=$4',
        [id, e.id, e.organisation_id, e.environment],
      )
    ).rows[0];
    requireCondition(metric, 404, 'metric_unavailable', 'This KPI definition is unavailable.');
    return metric;
  }
  async revise(
    token: string,
    csrf: string,
    client: string,
    id: string,
    previousId: string,
    input: unknown,
    effective: string,
    reason: string,
  ) {
    return this.delivery.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.delivery.plans.onboarding.authorise(sql, actor, e, true);
      this.delivery.reason(reason);
      const previous = await this.metric(sql, e, previousId),
        latest = (
          await sql.query<KpiVersion>(
            'SELECT * FROM kpi_versions WHERE enrolment_id=$1 AND number=$2 ORDER BY version DESC LIMIT 1',
            [id, previous.number],
          )
        ).rows[0];
      requireCondition(
        latest.id === previousId,
        409,
        'metric_changed',
        'KPI definition changed. Reload the latest version.',
      );
      const d = kpiDefinitionSchema.parse(input);
      const instant = Date.parse(effective);
      requireCondition(
        /(Z|[+-]\d{2}:\d{2})$/.test(effective) && Number.isFinite(instant) && instant >= Date.now(),
        422,
        'metric_effective',
        'Choose a future effective date and time with its UTC offset.',
      );
      requireCondition(
        d.upper_target == null || d.upper_target >= d.target,
        422,
        'metric_band',
        'The upper target cannot be lower than the target.',
      );
      requireCondition(
        d.direction !== 'band' || d.upper_target != null,
        422,
        'metric_band',
        'A band needs an upper target.',
      );
      requireCondition(
        d.formula !== 'approved_grade_mean' ||
          (d.evidence_type === 'demonstrated_competence' && d.unit === 'percent'),
        422,
        'metric_comparability',
        'Grade means measure demonstrated competence in percent, not workplace outcomes.',
      );
      const definition = {
          ...d,
          ...(d.upper_target == null ? { upper_target: undefined } : {}),
          owner: actor.id,
        },
        next = randomUUID();
      await sql.query(
        'INSERT INTO kpi_versions(id,organisation_id,environment,enrolment_id,number,version,definition,effective_at,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          next,
          client,
          e.environment,
          id,
          previous.number,
          previous.version + 1,
          encrypt(JSON.stringify(definition), this.delivery.key),
          new Date(instant),
          actor.id,
          reason,
        ],
      );
      await this.delivery.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'kpi.definition_revised',
        next,
        reason,
      );
      return {
        id: next,
        version: previous.version + 1,
        effectiveAt: new Date(instant).toISOString(),
      };
    });
  }
  async observe(
    token: string,
    csrf: string,
    client: string,
    id: string,
    metricId: string,
    value: number,
    evidence: string,
    reason: string,
  ) {
    return this.delivery.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.delivery.plans.onboarding.authorise(sql, actor, e, true);
      this.delivery.reason(reason);
      const metric = await this.metric(sql, e, metricId),
        definition = this.definition(metric);
      requireCondition(
        Number.isFinite(value) &&
          definition.formula === 'manual_mean' &&
          (await this.current(sql, e, metric.number))?.id === metric.id,
        409,
        'metric_observation',
        'Record observations only against the current observed-evidence KPI definition.',
      );
      z.string().trim().min(10).max(4000).parse(evidence);
      const observation = randomUUID();
      await sql.query(
        'INSERT INTO kpi_observations(id,organisation_id,environment,enrolment_id,kpi_version_id,value,evidence_type,evidence,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          observation,
          client,
          e.environment,
          id,
          metric.id,
          value,
          definition.evidence_type,
          encrypt(JSON.stringify({ reference: evidence, reason }), this.delivery.key),
          actor.id,
        ],
      );
      const snapshot = await this.snapshot(sql, actor, e, metric);
      return { id: observation, snapshot };
    });
  }
  async refresh(token: string, csrf: string, client: string, id: string, metricId: string) {
    return this.delivery.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.delivery.plans.onboarding.authorise(sql, actor, e, true);
      return this.snapshot(sql, actor, e, await this.metric(sql, e, metricId));
    });
  }
  async read(token: string, client: string, id: string) {
    return this.delivery.db.transaction(async (sql) => {
      const actor = await this.delivery.enrolments.context(sql, token, client),
        e = await this.delivery.enrolments.record(sql, actor, client, id, 'details');
      await this.delivery.plans.onboarding.authorise(sql, actor, e);
      const coordinator = (await this.delivery.enrolments.permissions(sql, actor, e)).manage;
      const current = (
        await sql.query<KpiVersion>(
          'SELECT DISTINCT ON(number) * FROM kpi_versions WHERE enrolment_id=$1 AND effective_at<=now() ORDER BY number,version DESC',
          [id],
        )
      ).rows;
      const publicDefinition = (k: KpiVersion) => {
        const { owner, ...definition } = this.definition(k);
        return definition;
      };
      const metrics = [];
      for (const metric of current) {
        const snapshots = (
          await sql.query<{
            id: string;
            source_ids: string[];
            value: string | null;
            status: string;
            sample_count: number;
            created_at: Date;
          }>(
            'SELECT * FROM kpi_snapshots WHERE kpi_version_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',
            [metric.id],
          )
        ).rows;
        const latest = coordinator
          ? (
              await sql.query<KpiVersion>(
                'SELECT * FROM kpi_versions WHERE enrolment_id=$1 AND number=$2 ORDER BY version DESC LIMIT 1',
                [id, metric.number],
              )
            ).rows[0]
          : null;
        const snap = snapshots[0];
        metrics.push({
          id: metric.id,
          number: metric.number,
          version: metric.version,
          definition: publicDefinition(metric),
          effectiveAt: metric.effective_at,
          snapshot: snap
            ? {
                id: snap.id,
                sourceIds: snap.source_ids,
                value: snap.value === null ? null : Number(snap.value),
                status: snap.status,
                sampleCount: snap.sample_count,
                createdAt: snap.created_at,
              }
            : null,
          latest: latest
            ? {
                id: latest.id,
                version: latest.version,
                definition: publicDefinition(latest),
                effectiveAt: latest.effective_at,
              }
            : null,
        });
      }
      const member = (
        await sql.query<{ name: string }>('SELECT name FROM users WHERE id=$1', [e.member_id])
      ).rows[0];
      return {
        enrolment: { id: e.id, title: e.title, status: e.status },
        memberName: member.name,
        coordinator,
        metrics,
      };
    });
  }
}
