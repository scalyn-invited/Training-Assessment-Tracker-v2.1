import { afterAll, beforeAll, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { testDatabase, fixture, actor } from './helpers.js';
import { migrate } from '../packages/database/src/migrate.js';
let instance: Awaited<ReturnType<typeof testDatabase>>, directory: string;
beforeAll(async () => {
  instance = await testDatabase({ port: 55449 });
  await fixture(instance.db);
  directory = await mkdtemp(path.join(tmpdir(), 'tracker-migration-integrity-'));
  await cp(path.resolve('packages/database/migrations'), directory, { recursive: true });
});
afterAll(async () => {
  await instance?.close();
  if (directory && path.dirname(directory) === path.resolve(tmpdir()) && path.basename(directory).startsWith('tracker-migration-integrity-')) await rm(directory, { recursive: true, force: true });
});
it('rejects altered or missing migration receipts and rolls back failed upgrades without changing existing rows', async () => {
  const snapshot = async () => ({
    users: (await instance.db.pool.query('SELECT * FROM users ORDER BY id')).rows,
    memberships: (await instance.db.pool.query('SELECT * FROM client_memberships ORDER BY id')).rows,
    receipts: (await instance.db.pool.query('SELECT * FROM schema_migrations ORDER BY name')).rows,
  });
  const before = await snapshot();
  const first = path.join(directory, before.receipts[0].name);
  const original = await readFile(first, 'utf8');
  await writeFile(first, original + '\n-- changed applied migration\n');
  await expect(migrate(instance.db, directory)).rejects.toThrow('Applied migration changed:');
  expect(await snapshot()).toEqual(before);
  await unlink(first);
  await expect(migrate(instance.db, directory)).rejects.toThrow('Applied migration missing:');
  expect(await snapshot()).toEqual(before);
  await writeFile(first, original);
  const next = path.join(directory, '9999_integrity_probe.sql');
  await writeFile(next, `UPDATE users SET name='must roll back' WHERE id='${actor}'; CREATE TABLE migration_integrity_probe(id integer); SELECT * FROM deliberately_absent_migration_relation;`);
  await expect(migrate(instance.db, directory)).rejects.toThrow();
  expect(await snapshot()).toEqual(before);
  expect((await instance.db.pool.query("SELECT to_regclass('public.migration_integrity_probe') AS relation")).rows[0].relation).toBeNull();
  await writeFile(next, 'CREATE TABLE migration_integrity_probe(id integer);');
  await migrate(instance.db, directory);
  const after = await snapshot();
  expect(after.users).toEqual(before.users);
  expect(after.memberships).toEqual(before.memberships);
  expect(after.receipts.slice(0, -1)).toEqual(before.receipts);
  expect(after.receipts.at(-1).name).toBe('9999_integrity_probe.sql');
  await migrate(instance.db, directory);
  expect(await snapshot()).toEqual(after);
});
