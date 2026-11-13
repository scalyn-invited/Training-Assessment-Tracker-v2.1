import { z } from 'zod';
import type { Sql } from '../../database/src/database.js';
import type { AuthUser } from './auth.js';
import type { Enrolment } from './enrolments.js';
import type { EvidenceFile } from './evidence-files.js';
import { DocumentExtractions, type Extraction } from './document-extractions.js';
import { Onboarding } from './onboarding.js';
import { onboardingSchema } from './onboarding-content.js';
import { requireCondition } from './errors.js';
import { encrypt, decrypt } from './crypto.js';
import { EXTRACTION_ERRORS } from './document-errors.js';
type ReviewedExtraction = Extraction & {
  review_data: string | null;
  confirmed_onboarding_id: string | null;
};
export class OnboardingDocuments {
  readonly onboarding: Onboarding;
  constructor(readonly extractions: DocumentExtractions) {
    this.onboarding = new Onboarding(extractions.reviews.enrolments, extractions.reviews.key);
  }
  async file(sql: Sql, actor: AuthUser, e: Enrolment, id: string, lock = false) {
    await this.onboarding.authorise(sql, actor, e, true);
    const file = (
      await sql.query<EvidenceFile>(
        'SELECT * FROM evidence_files WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND enrolment_id=$4' +
          (lock ? ' FOR UPDATE' : ''),
        [id, e.organisation_id, e.environment, e.id],
      )
    ).rows[0];
    requireCondition(
      file && (await this.extractions.files.canRead(sql, actor, file, e)),
      404,
      'file_unavailable',
      'This private assessment file is unavailable.',
    );
    requireCondition(
      file.purpose === 'assessment',
      422,
      'assessment_file_required',
      'Choose an assessment document, not submitted work.',
    );
    return file;
  }
  async request(token: string, csrf: string, client: string, enrolment: string, fileId: string) {
    return this.onboarding.locked(token, csrf, client, enrolment, async (sql, actor, e) => {
      const file = await this.file(sql, actor, e, fileId, true);
      requireCondition(
        ['clean', 'quarantined', 'scanning'].includes(file.scan_status),
        409,
        'scan_rejected',
        'The source was rejected, deleted or is unavailable for scanning.',
      );
      return this.extractions.admit(sql, actor, e, file, null, null);
    });
  }
  async read(token: string, client: string, enrolment: string, fileId: string) {
    return this.onboarding.auth.db.transaction(async (sql) => {
      const actor = await this.onboarding.enrolments.context(sql, token, client);
      const e = await this.onboarding.enrolments.record(sql, actor, client, enrolment, 'manage');
      const file = await this.file(sql, actor, e, fileId);
      const runs = (
        await sql.query<ReviewedExtraction>(
          'SELECT * FROM document_extractions WHERE evidence_file_id=$1 AND organisation_id=$2 AND environment=$3 AND assessment_attempt_id IS NULL ORDER BY attempt DESC',
          [file.id, client, e.environment],
        )
      ).rows;
      const latest = runs[0],
        draft = await this.onboarding.latest(sql, e);
      const intact =
        latest && ['ready', 'confirmed'].includes(latest.status)
          ? Boolean(await this.extractions.intact(latest, file))
          : false;
      await this.onboarding.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'extraction.viewed',
        file.id,
        'Viewed private extraction review',
      );
      return {
        file: { id: file.id, name: file.original_name, status: file.scan_status },
        enrolment: { id: e.id, title: e.title },
        onboardingVersion: draft?.version ?? 0,
        editable: ['onboarding', 'ready'].includes(e.status),
        run: latest
          ? {
              id: latest.id,
              version: latest.version,
              status: latest.status,
              engine: latest.engine,
              pages: latest.page_count,
              warnings: latest.warnings ?? [],
              text:
                intact && latest.extracted_text
                  ? decrypt(latest.extracted_text, this.onboarding.key)
                  : null,
              review:
                intact && latest.review_data
                  ? JSON.parse(decrypt(latest.review_data, this.onboarding.key))
                  : {},
              confirmedOnboardingId: latest.confirmed_onboarding_id,
              error: latest.error_code
                ? (EXTRACTION_ERRORS[latest.error_code] ?? EXTRACTION_ERRORS.parser_failed)
                : latest && ['ready', 'confirmed'].includes(latest.status) && !intact
                  ? EXTRACTION_ERRORS.source_changed
                  : null,
            }
          : null,
        history: runs.map((r) => ({
          id: r.id,
          attempt: r.attempt,
          status: r.status,
          version: r.version,
        })),
      };
    });
  }
  async review(
    token: string,
    csrf: string,
    client: string,
    enrolment: string,
    runId: string,
    input: unknown,
    version: number,
    onboardingVersion: number,
    confirm: boolean,
  ) {
    z.number().int().positive().parse(version);
    z.number().int().min(0).parse(onboardingVersion);
    return this.onboarding.locked(token, csrf, client, enrolment, async (sql, actor, e) => {
      const ref = (
        await sql.query<ReviewedExtraction>(
          'SELECT * FROM document_extractions WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND enrolment_id=$4',
          [runId, client, e.environment, e.id],
        )
      ).rows[0];
      requireCondition(ref, 404, 'extraction_unavailable', 'This extraction is unavailable.');
      const file = await this.file(sql, actor, e, ref.evidence_file_id, true);
      const current = (
        await sql.query<ReviewedExtraction>(
          'SELECT * FROM document_extractions WHERE id=$1 FOR UPDATE',
          [runId],
        )
      ).rows[0];
      requireCondition(
        !current.assessment_attempt_id,
        409,
        'assessment_review_required',
        'Confirm initial assessment evidence in its review screen.',
      );
      requireCondition(
        current.status === 'ready' && current.version === version,
        409,
        'extraction_conflict',
        'This extraction changed or was already confirmed. Copy your edits before reloading.',
      );
      requireCondition(
        await this.extractions.intact(current, file),
        409,
        'source_changed',
        'Source file changed or is no longer clean.',
      );
      const supplied = z.record(z.string(), z.unknown()).parse(input);
      const data = onboardingSchema('assessment', confirm).parse({
        ...supplied,
        source: `Document ${file.original_name}; extraction ${current.id}; SHA-256 ${current.source_hash}`,
      }) as Record<string, unknown>;
      let confirmedId: string | null = null;
      if (confirm) {
        const draft = await this.onboarding.latest(sql, e);
        requireCondition(
          (draft?.version ?? 0) === onboardingVersion,
          409,
          'onboarding_conflict',
          'Onboarding changed. Copy your review and reload the latest inputs before confirming.',
        );
        const snapshot = this.onboarding.data(draft);
        snapshot.assessment = {
          ...data,
          confirmed_by: actor.id,
          confirmed_at: new Date().toISOString(),
          extraction_id: current.id,
          source_sha256: current.source_hash,
          extraction_version: version + 1,
        };
        confirmedId = (
          await this.onboarding.append(sql, actor, e, 'assessment', snapshot, onboardingVersion + 1)
        ).id;
      }
      await sql.query(
        'UPDATE document_extractions SET review_data=$1,version=version+1,status=$2,confirmed_onboarding_id=$3,updated_at=now() WHERE id=$4',
        [
          encrypt(JSON.stringify(data), this.onboarding.key),
          confirm ? 'confirmed' : 'ready',
          confirmedId,
          runId,
        ],
      );
      await this.onboarding.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        confirm ? 'extraction.confirmed' : 'extraction.review_saved',
        runId,
        `Reviewed extraction version ${version + 1}`,
      );
      return {
        id: runId,
        version: version + 1,
        status: confirm ? 'confirmed' : 'ready',
        onboardingVersion: confirm ? onboardingVersion + 1 : onboardingVersion,
        confirmedOnboardingId: confirmedId,
      };
    });
  }
}
