import { z } from 'zod';
import { Database, type Sql } from '../../database/src/database.js';
import { requireCondition, DomainError } from './errors.js';
import type { InstallationStateData } from './installation-state.js';
export const installationDatabaseInput = z.object({
  engine: z.enum(['postgresql', 'pglite']).optional(),
  host: z
    .string()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9_.:-]+$/),
  port: z.number().int().min(1).max(65535),
  database: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/),
  username: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[^\r\n\x00]+$/),
  password: z
    .string()
    .max(1024)
    .regex(/^[^\r\n\x00]*$/),
});
export type InstallationDatabaseInput = z.infer<typeof installationDatabaseInput>;
export function installationRole(state: InstallationStateData) {
  return 'tracker_tenant_' + state.id.replaceAll('-', '').slice(0, 12);
}
export function installationDatabaseUrl(input: InstallationDatabaseInput) {
  const value = installationDatabaseInput.parse(input),
    host = value.host.includes(':') ? '[' + value.host + ']' : value.host;
  return (
    'postgresql://' +
    encodeURIComponent(value.username) +
    ':' +
    encodeURIComponent(value.password) +
    '@' +
    host +
    ':' +
    value.port +
    '/' +
    encodeURIComponent(value.database)
  );
}
export class InstallationDatabase {
  connect(input: InstallationDatabaseInput, state: InstallationStateData) {
    return new Database(installationDatabaseUrl(input), installationRole(state));
  }
  async inspectSql(sql: Sql, state: InstallationStateData) {
    const version = (
      await sql.query<{ version: string }>("SELECT current_setting('server_version_num') version")
    ).rows[0].version;
    requireCondition(
      Number(version) >= 140000,
      422,
      'database_version',
      'Use PostgreSQL 14 or newer; qualify the selected server before production use.',
    );
    const tables = (
      await sql.query<{ name: string }>(
        "SELECT c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_' AND c.relkind IN ('r','p','v','m','S','f') ORDER BY c.relname",
      )
    ).rows.map((r) => r.name);
    if (tables.length) {
      requireCondition(
        tables.includes('training_installations'),
        409,
        'database_not_empty',
        'Choose a separate empty database. Existing records were preserved.',
      );
      const receipts = (
        await sql.query<{ installation_id: string; stage: string }>(
          'SELECT installation_id,stage FROM training_installations',
        )
      ).rows;
      requireCondition(
        receipts.length === 1 &&
          receipts[0].installation_id === state.id &&
          (receipts[0].stage !== 'complete' || state.status === 'installing'),
        409,
        'database_owned',
        'This database belongs to another or completed installation. It will not be changed.',
      );
    }
    return { engine: 'postgresql', version, empty: !tables.length };
  }
  async inspect(input: InstallationDatabaseInput, state: InstallationStateData) {
    const db = this.connect(input, state);
    try {
      return await this.inspectSql(db.pool, state);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        503,
        'database_unavailable',
        'Cannot inspect the database. Check the server, existing database, credentials and privileges.',
      );
    } finally {
      await db.close();
    }
  }
  async claim(db: Database, state: InstallationStateData) {
    return db.transaction(async (sql) => {
      await sql.query('SELECT pg_advisory_xact_lock(21004)');
      const details = await this.inspectSql(sql, state);
      if (details.empty) {
        await sql.query(
          "CREATE TABLE training_installations(installation_id uuid PRIMARY KEY,stage text NOT NULL CHECK(stage IN ('claimed','migrated','seeded','administrator','complete')),fixture_version text,fixture_state jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())",
        );
        await sql.query(
          "INSERT INTO training_installations(installation_id,stage) VALUES($1,'claimed')",
          [state.id],
        );
      }
      return (
        await sql.query<{ stage: string }>(
          'SELECT stage FROM training_installations WHERE installation_id=$1',
          [state.id],
        )
      ).rows[0].stage;
    });
  }
}
