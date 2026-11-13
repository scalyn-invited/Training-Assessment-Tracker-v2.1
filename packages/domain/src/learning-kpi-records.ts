import { randomUUID } from 'node:crypto';
import type { Sql } from '../../database/src/database.js';
import type { AuthUser } from './auth.js';
import type { Enrolment } from './enrolments.js';
import type { Delivery, Submission } from './delivery.js';
import { decrypt, encrypt, digest } from './crypto.js';
export type KpiVersion = {
  id: string;
  organisation_id: string;
  environment: string;
  enrolment_id: string;
  number: number;
  version: number;
  definition: string;
  effective_at: Date;
};
export type KpiDefinition = {
  name: string;
  baseline: string;
  target: string | number;
  unit: string;
  rationale: string;
  formula: 'approved_grade_mean' | 'manual_mean';
  direction: 'higher' | 'lower' | 'band';
  upper_target?: number;
  sample_minimum: number;
  evidence_type: 'demonstrated_competence' | 'workplace_outcome';
  owner: string;
};
export class LearningKpiRecords {
  constructor(readonly delivery: Delivery) {}
  definition(k: KpiVersion): KpiDefinition {
    return JSON.parse(decrypt(k.definition, this.delivery.key));
  }
  async current(sql: Sql, e: Enrolment, number: number) {
    return (
      await sql.query<KpiVersion>(
        'SELECT * FROM kpi_versions WHERE enrolment_id=$1 AND organisation_id=$2 AND environment=$3 AND number=$4 AND effective_at<=now() ORDER BY version DESC LIMIT 1',
        [e.id, e.organisation_id, e.environment, number],
      )
    ).rows[0];
  }
  async feed(
    sql: Sql,
    e: Enrolment,
    entity: string,
    version: number,
    kind: string,
    facts: Record<string, unknown>,
  ) {
    await sql.query(
      'INSERT INTO approved_changes(event_id,organisation_id,environment,enrolment_id,entity_id,entity_version,kind,facts) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT DO NOTHING',
      [
        randomUUID(),
        e.organisation_id,
        e.environment,
        e.id,
        entity,
        version,
        kind,
        JSON.stringify(facts),
      ],
    );
  }
  async snapshot(sql: Sql, actor: AuthUser, e: Enrolment, metric: KpiVersion) {
    const definition = this.definition(metric),
      rows = (
        await sql.query<{ id: string; value: string }>(
          'SELECT id,value FROM kpi_observations WHERE kpi_version_id=$1 AND organisation_id=$2 AND environment=$3 AND current=true AND evidence_type=$4 ORDER BY created_at,id',
          [metric.id, e.organisation_id, e.environment, definition.evidence_type],
        )
      ).rows;
    const enough = rows.length >= definition.sample_minimum,
      value = enough ? rows.reduce((sum, row) => sum + Number(row.value), 0) / rows.length : null;
    let status = 'insufficient_evidence';
    if (value !== null) {
      const target = Number(definition.target);
      if (String(definition.target).trim() === '' || !Number.isFinite(target))
        status = 'target_unknown';
      else
        status = (
          definition.direction === 'higher'
            ? value >= target
            : definition.direction === 'lower'
              ? value <= target
              : value >= target && value <= Number(definition.upper_target)
        )
          ? 'on_target'
          : 'needs_support';
    }
    const id = randomUUID();
    await sql.query(
      'INSERT INTO kpi_snapshots(id,organisation_id,environment,enrolment_id,kpi_version_id,source_ids,value,status,sample_count,actor_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)',
      [
        id,
        e.organisation_id,
        e.environment,
        e.id,
        metric.id,
        JSON.stringify(rows.map((r) => r.id)),
        value,
        status,
        rows.length,
        actor.id,
      ],
    );
    await this.delivery.enrolments.tenancy.audit(
      sql,
      actor,
      e.organisation_id,
      'kpi.snapshot_recorded',
      id,
      'Recorded comparable current evidence',
    );
    await this.feed(sql, e, id, 1, 'kpi.snapshot', {
      kpi_version_id: metric.id,
      value,
      status,
      sample_count: rows.length,
    });
    return { id, value, status, sampleCount: rows.length };
  }
  async grade(
    sql: Sql,
    actor: AuthUser,
    e: Enrolment,
    s: Submission,
    decisionId: string,
    total: number | null,
  ) {
    await sql.query(
      'UPDATE kpi_observations SET current=false WHERE submission_attempt_id=$1 AND organisation_id=$2 AND environment=$3',
      [s.id, e.organisation_id, e.environment],
    );
    const block = await this.delivery.block(sql, e, s.learning_block_id),
      number = this.delivery.content(block).lessons[s.lesson_index].kpi,
      metric = await this.current(sql, e, number!);
    if (!metric || this.definition(metric).formula !== 'approved_grade_mean' || total === null)
      return;
    const evidence = {
      decision_id: decisionId,
      submission_id: s.id,
      rubric_hash: digest(JSON.stringify(this.delivery.submitted(s).rubric)),
    };
    await sql.query(
      "INSERT INTO kpi_observations(id,organisation_id,environment,enrolment_id,kpi_version_id,submission_attempt_id,grade_decision_id,value,evidence_type,evidence,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'demonstrated_competence',$9,$10) ON CONFLICT(kpi_version_id,grade_decision_id) DO NOTHING",
      [
        randomUUID(),
        e.organisation_id,
        e.environment,
        e.id,
        metric.id,
        s.id,
        decisionId,
        total,
        encrypt(JSON.stringify(evidence), this.delivery.key),
        actor.id,
      ],
    );
    await this.snapshot(sql, actor, e, metric);
  }
}
