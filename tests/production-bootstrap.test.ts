import { beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Accounts } from '../packages/domain/src/accounts.js';
import { OperatorBootstrap } from '../packages/domain/src/operator-bootstrap.js';
let fixture: Awaited<ReturnType<typeof testDatabase>>, auth: Auth, service: OperatorBootstrap;
const reason = 'Explicit empty production bootstrap rehearsal';
beforeAll(async () => {
  fixture = await testDatabase();
  auth = new Auth(fixture.db, randomBytes(32));
  service = new OperatorBootstrap(auth);
});
afterAll(async () => {
  await fixture?.close();
});
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('TRAINING_ENVIRONMENT', 'production');
  vi.stubEnv('TRAINING_AUTH_MODE', 'local_password');
  vi.stubEnv('TRAINING_INSTALL_MODE', 'hosted');
  vi.stubEnv('APP_ORIGIN', 'https://bootstrap.example.invalid');
  vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:55439/postgres');
});
afterEach(() => vi.unstubAllEnvs());
it('refuses production initialization without the explicit deployment profile', async () => {
  vi.stubEnv('APP_ORIGIN', 'http://bootstrap.example.invalid');
  await expect(
    service.initializeProduction('hosted', 'Owner', 'owner@example.invalid', 'operator', reason),
  ).rejects.toMatchObject({ code: 'production_bootstrap_profile' });
  vi.stubEnv('APP_ORIGIN', 'http://localhost:3100');
  vi.stubEnv('TRAINING_LOCAL_PRODUCTION', 'true');
  vi.stubEnv('TRAINING_LOCAL_PRODUCTION_DATABASE', 'different_database');
  await expect(
    service.initializeProduction('local', 'Owner', 'owner@example.invalid', 'operator', reason),
  ).rejects.toMatchObject({ code: 'production_bootstrap_profile' });
  expect((await fixture.db.pool.query('SELECT id FROM users')).rowCount).toBe(0);
});
it('refuses an occupied database without creating a bootstrap grant or link', async () => {
  const existing = randomUUID();
  await fixture.db.pool.query(
    "INSERT INTO users(id,email,name,password_hash,password_enabled,environment,is_synthetic,origin,sync_policy) VALUES($1,'existing@example.invalid','Existing account','unusable',false,'production',false,'manual','local_only')",
    [existing],
  );
  try {
    await expect(
      service.initializeProduction('hosted', 'Owner', 'owner@example.invalid', 'operator', reason),
    ).rejects.toMatchObject({ code: 'production_database_not_empty' });
    expect((await fixture.db.pool.query('SELECT id FROM users')).rows).toEqual([{ id: existing }]);
    expect((await fixture.db.pool.query('SELECT id FROM role_assignments')).rowCount).toBe(0);
    expect((await fixture.db.pool.query('SELECT id FROM local_account_links')).rowCount).toBe(0);
    expect((await fixture.db.pool.query('SELECT singleton FROM installation')).rowCount).toBe(0);
  } finally {
    await fixture.db.pool.query('DELETE FROM users WHERE id=$1', [existing]);
  }
});
it('initializes one real pending administrator and permits only exact pending reissue', async () => {
  const first = await service.initializeProduction(
    'hosted',
    'Owner',
    'owner@example.invalid',
    'operator',
    reason,
  );
  const second = await service.initializeProduction(
    'hosted',
    'Owner',
    'owner@example.invalid',
    'operator',
    reason,
  );
  await expect(
    service.initializeProduction('hosted', 'Other', 'owner@example.invalid', 'operator', reason),
  ).rejects.toMatchObject({ code: 'production_setup_closed' });
  await expect(
    service.initializeProduction('hosted', 'Owner', 'other@example.invalid', 'operator', reason),
  ).rejects.toMatchObject({ code: 'production_setup_closed' });
  expect(
    (await fixture.db.pool.query('SELECT is_synthetic,password_enabled,environment FROM users'))
      .rows,
  ).toEqual([{ is_synthetic: false, password_enabled: false, environment: 'production' }]);
  expect((await fixture.db.pool.query('SELECT id FROM role_assignments')).rowCount).toBe(1);
  expect((await fixture.db.pool.query('SELECT id FROM organisations')).rowCount).toBe(0);
  expect(
    (
      await fixture.db.pool.query(
        "SELECT id FROM platform_audit_events WHERE action='local.production.initialized'",
      )
    ).rowCount,
  ).toBe(1);
  expect((await auth.context()).installed).toBe(true);
  const accounts = new Accounts(auth),
    guest = await auth.context();
  await expect(
    accounts.inspect(guest.token!, guest.csrf, first.token, 'setup'),
  ).rejects.toMatchObject({ code: 'link_unavailable' });
  await fixture.db.pool.query(
    "UPDATE local_account_links SET expires_at=now()-interval '1 second' WHERE id=$1",
    [second.id],
  );
  await expect(
    accounts.inspect(guest.token!, guest.csrf, second.token, 'setup'),
  ).rejects.toMatchObject({ code: 'link_unavailable' });
});
it('cannot recover a revoked first administrator through initializer reissue', async () => {
  await fixture.db.pool.query(
    "UPDATE role_assignments SET ends_at=now() WHERE scope_type='platform'",
  );
  await expect(
    service.initializeProduction('hosted', 'Owner', 'owner@example.invalid', 'operator', reason),
  ).rejects.toMatchObject({ code: 'production_setup_closed' });
  expect(
    (await fixture.db.pool.query('SELECT id FROM role_assignments WHERE ends_at IS NULL')).rowCount,
  ).toBe(0);
  await fixture.db.pool.query(
    "UPDATE role_assignments SET ends_at=NULL WHERE scope_type='platform'",
  );
});
it('activates the pending account once and permanently closes first-admin setup', async () => {
  const link = await service.initializeProduction(
    'hosted',
    'Owner',
    'owner@example.invalid',
    'operator',
    reason,
  );
  const accounts = new Accounts(auth),
    guest = await auth.context();
  await accounts.redeem(
    guest.token!,
    guest.csrf,
    link.token,
    'setup',
    'Private initial production password',
    'Private initial production password',
  );
  await expect(
    service.initializeProduction('hosted', 'Owner', 'owner@example.invalid', 'operator', reason),
  ).rejects.toMatchObject({ code: 'production_setup_closed' });
  const fresh = await auth.context();
  const session = await auth.login(
    fresh.token!,
    fresh.csrf,
    'owner@example.invalid',
    'Private initial production password',
  );
  expect((await auth.context(session.token)).user?.global_admin).toBe(true);
  expect((await fixture.db.pool.query('SELECT id FROM client_memberships')).rowCount).toBe(0);
  expect(
    JSON.stringify((await fixture.db.pool.query('SELECT * FROM platform_audit_events')).rows),
  ).not.toContain(link.token);
});
