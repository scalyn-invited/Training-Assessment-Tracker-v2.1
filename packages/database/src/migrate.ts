import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Database } from './database.js';
export async function migrate(
  db: Database,
  directory = path.resolve('packages/database/migrations'),
) {
  await db.transaction(async (sql) => {
    await sql.query('SELECT pg_advisory_xact_lock(21001)');
    await sql.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    await sql.query(
      "ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS tenant_role text NOT NULL DEFAULT 'tracker_tenant'",
    );
    const applied = await sql.query<{ name: string; sha256: string; tenant_role: string }>(
      'SELECT name,sha256,tenant_role FROM schema_migrations ORDER BY name',
    );
    const names = (await readdir(directory))
      .filter((n) => /^\d{4}_[a-z0-9_]+\.sql$/.test(n))
      .sort();
    for (const row of applied.rows)
      if (!names.includes(row.name)) throw new Error('Applied migration missing: ' + row.name);
    if (applied.rows.some((row) => row.tenant_role !== db.tenantRole))
      throw new Error('The configured tenant role differs from the database migration receipts.');
    for (const name of names) {
      const content = await readFile(path.join(directory, name), 'utf8');
      const hash = createHash('sha256').update(content).digest('hex');
      const previous = applied.rows.find((r) => r.name === name);
      if (previous) {
        if (previous.sha256 !== hash) throw new Error('Applied migration changed: ' + name);
        continue;
      }
      await sql.query(content.replace(/\btracker_tenant\b/g, db.tenantRole));
      await sql.query('INSERT INTO schema_migrations(name,sha256,tenant_role) VALUES($1,$2,$3)', [
        name,
        hash,
        db.tenantRole,
      ]);
    }
  });
}
