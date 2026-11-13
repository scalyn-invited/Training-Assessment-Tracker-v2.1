import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { AssessmentAssignments } from './assessment-assignments.js';
import { AssessmentDefinitions } from './assessment-definitions.js';
import { requireCondition } from './errors.js';
import { digest } from './crypto.js';
import { privatePath } from '../../database/src/config.js';
import { enqueue, type Job } from './outbox.js';
import { scanFile, type Scanner } from './file-scanner.js';
import type { Sql } from '../../database/src/database.js';
type Media = {
  id: string;
  organisation_id: string;
  environment: 'test' | 'production';
  actor_id: string;
  path: string;
  source_hash: string;
  status: string;
  version: number;
};
export class AssessmentMedia {
  constructor(
    readonly definitions: AssessmentDefinitions,
    readonly scanner: Scanner = scanFile,
    readonly directory = path.join(privatePath(), 'assessment-media'),
  ) {}
  private file(key: string) {
    requireCondition(
      /^[a-f0-9-]{36}(?:\.png)?$/.test(key),
      404,
      'image_unavailable',
      'Image is unavailable.',
    );
    return path.join(this.directory, key);
  }
  async upload(token: string, csrf: string, client: string, bytes: Buffer, filename: string) {
    await this.definitions.auth.db.transaction((sql) =>
      this.definitions.author(sql, token, client, csrf),
    );
    requireCondition(
      bytes.length > 0 && bytes.length <= 2 * 1024 * 1024 && /\.(png|jpe?g|webp)$/i.test(filename),
      422,
      'invalid_image',
      'Choose a PNG, JPEG or WebP image no larger than 2 MiB.',
    );
    const metadata = await sharp(bytes, { limitInputPixels: 4096 * 4096 })
      .metadata()
      .catch(() => null);
    requireCondition(
      metadata &&
        ['png', 'jpeg', 'webp'].includes(metadata.format) &&
        metadata.width <= 4096 &&
        metadata.height <= 4096 &&
        (metadata.pages ?? 1) === 1,
      422,
      'invalid_image',
      'Choose a valid static image at most 4096 pixels wide and high.',
    );
    const id = randomUUID(),
      key = randomUUID();
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.file(key), bytes, { flag: 'wx', mode: 0o600 });
    try {
      return await this.definitions.auth.db.transaction(async (sql) => {
        await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
        const actor = await this.definitions.author(sql, token, client, csrf);
        await sql.query(
          "INSERT INTO assessment_media(id,organisation_id,environment,actor_id,path,source_hash,status) VALUES($1,$2,$3,$4,$5,$6,'quarantined')",
          [id, client, actor.environment, actor.id, key, digest(bytes)],
        );
        await enqueue(
          sql,
          { actorId: actor.id, organisationId: client, environment: actor.environment },
          'assessment.image.scan',
          'image:' + id + ':1',
          { id, version: 1 },
        );
        await this.definitions.audit(sql, actor, client, 'assessment.image_uploaded', id);
        return { id, status: 'quarantined' };
      });
    } catch (error) {
      await unlink(this.file(key)).catch(() => {});
      throw error;
    }
  }
  private async context(sql: Sql, token: string, id: string, csrf?: string) {
    const { session } = await this.definitions.auth.verified(sql, token, csrf);
    const client = session.organisation_id;
    requireCondition(client, 403, 'client_required', 'Select a client first.');
    const actor = await this.definitions.author(sql, token, client, csrf);
    const row = (
      await sql.query<Media>(
        'SELECT * FROM assessment_media WHERE id=$1 AND organisation_id=$2 AND environment=$3 FOR UPDATE',
        [id, client, actor.environment],
      )
    ).rows[0];
    requireCondition(row, 404, 'image_unavailable', 'Image is unavailable.');
    return { row, actor, client };
  }
  async status(token: string, id: string) {
    return this.definitions.auth.db.transaction(async (sql) => {
      const { row } = await this.context(sql, token, id);
      const recovered = await sql.query(
        "UPDATE assessment_media SET status='unavailable',scan_token=NULL,updated_at=now() WHERE id=$1 AND status='scanning' AND updated_at<now()-interval '3 minutes' RETURNING id",
        [id],
      );
      return {
        id,
        status: recovered.rowCount ? 'unavailable' : row.status,
        url: '/assessments/media/' + id,
      };
    });
  }
  async retry(token: string, csrf: string, id: string) {
    return this.definitions.auth.db.transaction(async (sql) => {
      const { row, actor, client } = await this.context(sql, token, id, csrf);
      requireCondition(
        row.status === 'unavailable',
        409,
        'scan_not_retryable',
        'Only an unavailable scan can be retried.',
      );
      await sql.query(
        "UPDATE assessment_media SET status='quarantined',version=version+1,scan_token=NULL,updated_at=now() WHERE id=$1",
        [id],
      );
      await enqueue(
        sql,
        { actorId: actor.id, organisationId: client, environment: actor.environment },
        'assessment.image.scan',
        'image:' + id + ':' + (row.version + 1),
        { id, version: row.version + 1 },
      );
      return { id, status: 'quarantined' };
    });
  }
  private async eligible(sql: Sql, row: Media) {
    const membership = await this.definitions.access.membership(
      sql,
      row.actor_id,
      row.organisation_id,
      row.environment,
    );
    if (!membership) return false;
    return Boolean(
      (
        await sql.query(
          "SELECT id FROM role_assignments r WHERE client_membership_id=$1 AND organisation_id=$2 AND environment=$3 AND role='coordinator' AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now()) AND (scope_type='client' OR EXISTS(SELECT 1 FROM groups g WHERE g.id=r.group_id AND g.organisation_id=r.organisation_id AND g.environment=r.environment AND g.active AND g.kind='team'))",
          [membership.id, row.organisation_id, row.environment],
        )
      ).rowCount,
    );
  }
  async process(job: Job) {
    requireCondition(
      job.environment === (process.env.NODE_ENV === 'production' ? 'production' : 'test'),
      403,
      'environment_mismatch',
      'The worker cannot process another environment.',
    );
    const db = this.definitions.auth.db;
    const row = await db.transaction(async (sql) => {
      const candidate = (
        await sql.query<Media>(
          "SELECT * FROM assessment_media WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND status='quarantined' AND version=$4 FOR UPDATE",
          [job.payload.id, job.organisation_id, job.environment, job.payload.version],
        )
      ).rows[0];
      if (!candidate) return null;
      candidate.actor_id = job.actor_id;
      if (!(await this.eligible(sql, candidate))) {
        await sql.query(
          "UPDATE assessment_media SET status='unavailable',updated_at=now() WHERE id=$1",
          [candidate.id],
        );
        return null;
      }
      await sql.query(
        "UPDATE assessment_media SET status='scanning',scan_token=$2,updated_at=now() WHERE id=$1",
        [candidate.id, job.lease_token],
      );
      return candidate;
    });
    if (!row) return;
    let status = 'unavailable',
      output: Buffer | undefined,
      outputKey: string | undefined;
    try {
      const original = await readFile(this.file(row.path));
      if (digest(original) !== row.source_hash) status = 'rejected';
      else {
        const scanned = await this.scanner(this.file(row.path));
        const checked = await readFile(this.file(row.path));
        if (digest(checked) !== row.source_hash) status = 'rejected';
        else if (scanned === 'rejected') status = 'rejected';
        else if (scanned === 'clean') {
          output = await sharp(checked, { limitInputPixels: 4096 * 4096 })
            .rotate()
            .png()
            .toBuffer();
          outputKey = randomUUID() + '.png';
          await writeFile(this.file(outputKey), output, { flag: 'wx', mode: 0o600 });
          status = 'ready';
        }
      }
    } catch {
      status = 'unavailable';
    }
    let committed = false;
    try {
      committed = await db.transaction(async (sql) => {
        await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [
          row.organisation_id,
        ]);
        const allowed = await this.eligible(sql, row);
        const result = await sql.query(
          "UPDATE assessment_media SET status=$1,path=$2,source_hash=$3,scan_token=NULL,updated_at=now() WHERE id=$4 AND status='scanning' AND scan_token=$5 AND version=$6 AND EXISTS(SELECT 1 FROM outbox_events WHERE id=$7 AND status='processing' AND lease_token=$5 AND lease_until>now()) RETURNING id",
          [
            allowed ? status : 'unavailable',
            allowed && status === 'ready' ? outputKey : row.path,
            allowed && status === 'ready' ? digest(output!) : row.source_hash,
            row.id,
            job.lease_token,
            row.version,
            job.id,
          ],
        );
        return Boolean(result.rowCount && allowed && status === 'ready');
      });
    } finally {
      if (outputKey && !committed) await unlink(this.file(outputKey)).catch(() => {});
      if (committed) await unlink(this.file(row.path)).catch(() => {});
    }
  }
  async download(token: string, id: string) {
    const assignments = new AssessmentAssignments(this.definitions);
    const row = await this.definitions.auth.db.transaction(async (sql) => {
      const { user, session } = await this.definitions.auth.verified(sql, token);
      const client = session.organisation_id;
      requireCondition(
        client && (await this.definitions.access.available(sql, client, user!.environment)),
        404,
        'image_unavailable',
        'Image is unavailable.',
      );
      const media = (
        await sql.query<Media>(
          'SELECT * FROM assessment_media WHERE id=$1 AND organisation_id=$2 AND environment=$3',
          [id, client, user!.environment],
        )
      ).rows[0];
      requireCondition(
        media &&
          ((await assignments.isAuthor(sql, user!, client)) ||
            (await assignments.canReadMedia(sql, user!, client, id))),
        404,
        'image_unavailable',
        'Image is unavailable.',
      );
      return media;
    });
    requireCondition(row.status === 'ready', 404, 'image_unavailable', 'Image is unavailable.');
    const bytes = await readFile(this.file(row.path)).catch(() => null);
    requireCondition(
      bytes && digest(bytes) === row.source_hash,
      404,
      'image_unavailable',
      'Image is unavailable.',
    );
    return bytes;
  }
}
