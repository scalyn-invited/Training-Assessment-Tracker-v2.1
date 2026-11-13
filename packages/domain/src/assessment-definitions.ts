import { randomUUID } from 'node:crypto';
import { Auth, type AuthUser } from './auth.js';
import { Access } from './access.js';
import { encrypt, decrypt, digest } from './crypto.js';
import { requireCondition } from './errors.js';
import { draft, readiness, mediaIds, type AssessmentDraft } from './assessment-content.js';
import type { Sql } from '../../database/src/database.js';
type DefinitionRow = Omit<AssessmentDraft, 'answer_key'> & {
  id: string;
  family_id: string;
  revision: number;
  version: number;
  status: 'draft' | 'published';
  answer_key: string;
  organisation_id: string;
  environment: string;
};
export class AssessmentDefinitions {
  readonly access = new Access();
  constructor(
    readonly auth: Auth,
    readonly key: Buffer,
  ) {}
  async author(sql: Sql, token: string, client: string, csrf?: string) {
    const { user, session } = await this.auth.verified(sql, token, csrf);
    const membership = await this.access.membership(sql, user!.id, client, user!.environment);
    requireCondition(
      session.organisation_id === client && membership,
      403,
      'author_required',
      'Select a client with current coordinator membership.',
    );
    const roles = await sql.query(
      "SELECT r.id FROM role_assignments r WHERE r.client_membership_id=$1 AND r.organisation_id=$2 AND r.environment=$3 AND r.role='coordinator' AND r.starts_at<=now() AND (r.ends_at IS NULL OR r.ends_at>now()) AND (r.scope_type='client' OR EXISTS(SELECT 1 FROM groups g WHERE g.id=r.group_id AND g.organisation_id=r.organisation_id AND g.environment=r.environment AND g.active AND g.kind='team'))",
      [membership.id, client, user!.environment],
    );
    requireCondition(
      roles.rowCount,
      403,
      'author_required',
      'Assessment authoring requires coordinator authority.',
    );
    return user!;
  }
  async audit(sql: Sql, user: AuthUser, client: string, action: string, id: string) {
    await sql.query(
      'INSERT INTO audit_events(id,organisation_id,environment,actor_id,action,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [randomUUID(), client, user.environment, user.id, action, id, {}],
    );
  }
  async list(token: string, client: string, page = 1) {
    requireCondition(
      Number.isInteger(page) && page >= 1 && page <= 100000,
      422,
      'invalid_page',
      'Choose a valid page.',
    );
    return this.auth.db.transaction(async (sql) => {
      const user = await this.author(sql, token, client);
      const definitions = (
        await sql.query(
          'SELECT id,family_id,revision,version,title,status,published_at,created_at FROM assessment_definitions WHERE organisation_id=$1 AND environment=$2 ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $3',
          [client, user.environment, (page - 1) * 20],
        )
      ).rows;
      const total = (
        await sql.query(
          'SELECT count(*)::int total FROM assessment_definitions WHERE organisation_id=$1 AND environment=$2',
          [client, user.environment],
        )
      ).rows[0].total;
      return { definitions, total, page };
    });
  }
  async get(token: string, client: string, id: string) {
    return this.auth.db.transaction(async (sql) => {
      const user = await this.author(sql, token, client);
      const row = (
        await sql.query<DefinitionRow>(
          'SELECT * FROM assessment_definitions WHERE id=$1 AND organisation_id=$2 AND environment=$3',
          [id, client, user.environment],
        )
      ).rows[0];
      requireCondition(row, 404, 'definition_unavailable', 'Assessment revision is unavailable.');
      return { ...row, answer_key: JSON.parse(decrypt(row.answer_key, this.key)) };
    });
  }
  async save(
    token: string,
    csrf: string,
    client: string,
    input: unknown,
    source: string | null,
    expected: number,
    saveToken: string,
  ) {
    requireCondition(
      Number.isInteger(expected) && expected >= 0 && /^[0-9a-f-]{36}$/i.test(saveToken),
      422,
      'invalid_revision',
      'Supply the current version and a save reference.',
    );
    const data = draft(input),
      hash = digest(JSON.stringify([source, expected, data]));
    return this.auth.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
      const user = await this.author(sql, token, client, csrf);
      const saved = (
        await sql.query(
          'SELECT payload_hash,definition_id,version FROM assessment_definition_saves WHERE organisation_id=$1 AND environment=$2 AND token=$3',
          [client, user.environment, saveToken],
        )
      ).rows[0];
      if (saved) {
        requireCondition(
          saved.payload_hash === hash,
          409,
          'save_token_used',
          'This save reference was already used for different content.',
        );
        return { id: saved.definition_id, version: saved.version };
      }
      const ids = mediaIds(data.questions);
      if (ids.length) {
        const found = await sql.query(
          'SELECT id FROM assessment_media WHERE organisation_id=$1 AND environment=$2 AND id=ANY($3::uuid[])',
          [client, user.environment, ids],
        );
        requireCondition(
          found.rowCount === ids.length,
          422,
          'foreign_media',
          'Use images uploaded in this client workspace.',
        );
      }
      let old: any;
      if (source) {
        old = (
          await sql.query<DefinitionRow>(
            'SELECT * FROM assessment_definitions WHERE id=$1 AND organisation_id=$2 AND environment=$3 FOR UPDATE',
            [source, client, user.environment],
          )
        ).rows[0];
        requireCondition(old, 404, 'definition_unavailable', 'Assessment revision is unavailable.');
        requireCondition(
          old.version === expected,
          409,
          'definition_changed',
          'Definition changed. Copy your edits and reload.',
        );
      } else
        requireCondition(
          expected === 0,
          409,
          'definition_changed',
          'New assessments start at version zero.',
        );
      let id: string, version: number;
      const encrypted = encrypt(JSON.stringify(data.answer_key), this.key);
      if (old?.status === 'draft') {
        id = old.id;
        version = expected + 1;
        await sql.query(
          'UPDATE assessment_definitions SET title=$1,questions=$2,sections=$3,rubric=$4,answer_key=$5,version=$6 WHERE id=$7',
          [
            data.title,
            JSON.stringify(data.questions),
            data.sections ? JSON.stringify(data.sections) : null,
            data.rubric,
            encrypted,
            version,
            id,
          ],
        );
      } else {
        id = randomUUID();
        version = 1;
        const family = old?.family_id ?? randomUUID();
        const revision = (
          await sql.query(
            'SELECT COALESCE(max(revision),0)::int+1 revision FROM assessment_definitions WHERE family_id=$1',
            [family],
          )
        ).rows[0].revision;
        await sql.query(
          "INSERT INTO assessment_definitions(id,organisation_id,environment,family_id,revision,actor_id,title,status,questions,sections,rubric,answer_key) VALUES($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,$11)",
          [
            id,
            client,
            user.environment,
            family,
            revision,
            user.id,
            data.title,
            JSON.stringify(data.questions),
            data.sections ? JSON.stringify(data.sections) : null,
            data.rubric,
            encrypted,
          ],
        );
      }
      await sql.query(
        'INSERT INTO assessment_definition_saves(organisation_id,environment,token,payload_hash,definition_id,version) VALUES($1,$2,$3,$4,$5,$6)',
        [client, user.environment, saveToken, hash, id, version],
      );
      await this.audit(
        sql,
        user,
        client,
        old?.status === 'draft' ? 'assessment.definition_saved' : 'assessment.definition_created',
        id,
      );
      return { id, version };
    });
  }
  async publish(token: string, csrf: string, client: string, id: string, expected: number) {
    return this.auth.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
      const user = await this.author(sql, token, client, csrf);
      const row = (
        await sql.query<DefinitionRow>(
          'SELECT * FROM assessment_definitions WHERE id=$1 AND organisation_id=$2 AND environment=$3 FOR UPDATE',
          [id, client, user.environment],
        )
      ).rows[0];
      requireCondition(row, 404, 'definition_unavailable', 'Assessment revision is unavailable.');
      requireCondition(
        row.status === 'draft' && row.version === expected,
        409,
        'definition_changed',
        'Reload the current draft before publishing.',
      );
      const data = {
        ...row,
        answer_key: JSON.parse(decrypt(row.answer_key, this.key)),
      } as AssessmentDraft;
      const errors = readiness(data);
      requireCondition(
        !Object.keys(errors).length,
        422,
        'assessment_not_ready',
        Object.values(errors).join(' '),
      );
      const ids = mediaIds(data.questions);
      if (ids.length) {
        const ready = await sql.query(
          "SELECT id FROM assessment_media WHERE organisation_id=$1 AND environment=$2 AND id=ANY($3::uuid[]) AND status='ready'",
          [client, user.environment, ids],
        );
        requireCondition(
          ready.rowCount === ids.length,
          422,
          'media_not_ready',
          'Wait for image scanning or replace the failed image.',
        );
      }
      await sql.query(
        "UPDATE assessment_definitions SET status='published',published_at=now(),version=version+1 WHERE id=$1",
        [id],
      );
      await this.audit(sql, user, client, 'assessment.definition_published', id);
      return { version: expected + 1 };
    });
  }
}
