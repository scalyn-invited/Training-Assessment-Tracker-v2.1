import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { OperatorBootstrap } from '../packages/domain/src/operator-bootstrap.js';
let fixture: Awaited<ReturnType<typeof testDatabase>>, bootstrap: OperatorBootstrap;
const first = randomUUID(),
  second = randomUUID(),
  reason = 'Explicit isolated bootstrap rehearsal';
beforeAll(async () => {
  fixture = await testDatabase();
  bootstrap = new OperatorBootstrap(new Auth(fixture.db, randomBytes(32)));
  for (const id of [first, second]) {
    await fixture.db.pool.query(
      "INSERT INTO users(id,email,name,password_hash,environment) VALUES($1,$2,'Fictional operator target','disabled','test')",
      [id, id + '@example.invalid'],
    );
    await fixture.db.pool.query(
      "INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2::uuid,'urn:training:local',$2::text)",
      [randomUUID(), id],
    );
  }
});
afterAll(async () => {
  await fixture?.close();
});
it('requires explicit matching environment and bounded operator attribution', async () => {
  await expect(bootstrap.appoint(first, 'production', 'operator', reason)).rejects.toMatchObject({
    code: 'bootstrap_environment',
  });
  await expect(bootstrap.appoint(first, 'test', '', reason)).rejects.toThrow();
  await expect(bootstrap.appoint(first, 'test', 'operator', 'short')).rejects.toMatchObject({
    code: 'reason_required',
  });
  expect((await fixture.db.pool.query('SELECT id FROM role_assignments')).rowCount).toBe(0);
});
it('records the first grant and operator audit once and invalidates earlier authority', async () => {
  const result = await bootstrap.appoint(first, 'test', 'test-operator', reason);
  expect(result.created).toBe(true);
  expect((await bootstrap.auth.context()).installed).toBe(true);
  expect(await bootstrap.appoint(first, 'test', 'test-operator', reason)).toEqual({
    ...result,
    created: false,
  });
  const audit = (
    await fixture.db.pool.query(
      "SELECT actor_id,operator_reference,target_id,reason,changes FROM platform_audit_events WHERE action='platform.admin.appointed'",
    )
  ).rows;
  expect(audit).toEqual([
    {
      actor_id: null,
      operator_reference: 'test-operator',
      target_id: first,
      reason,
      changes: { grant_id: result.id },
    },
  ]);
  expect(
    (await fixture.db.pool.query('SELECT permission_version FROM users WHERE id=$1', [first]))
      .rows[0].permission_version,
  ).toBe(2);
});
it('does not let an operator appoint another administrator after bootstrap', async () => {
  await expect(bootstrap.appoint(second, 'test', 'operator', reason)).rejects.toMatchObject({
    code: 'bootstrap_admin_exists',
  });
  expect((await fixture.db.pool.query('SELECT id FROM role_assignments')).rowCount).toBe(1);
});
it('rechecks active identity even for an already appointed administrator', async () => {
  await fixture.db.pool.query('UPDATE identities SET active=false WHERE user_id=$1', [first]);
  await expect(bootstrap.appoint(first, 'test', 'operator', reason)).rejects.toMatchObject({
    code: 'account_unavailable',
  });
  await expect(bootstrap.appoint(second, 'test', 'operator', reason)).rejects.toMatchObject({
    code: 'bootstrap_admin_exists',
  });
});

it('issues and reissues one-hour synthetic setup without adding privileges or membership', async () => {
  await fixture.db.pool.query('UPDATE identities SET active=true WHERE user_id=$1', [first]);
  await fixture.db.pool.query('UPDATE users SET password_enabled=false WHERE id=$1', [first]);
  const a = await bootstrap.syntheticSetup(first, 'test-operator', reason);
  const b = await bootstrap.syntheticSetup(first, 'test-operator', reason);
  const links = (
    await fixture.db.pool.query(
      'SELECT id,bootstrap,organisation_id,revoked_at,expires_at-created_at AS duration FROM local_account_links ORDER BY created_at',
    )
  ).rows;
  expect(links).toHaveLength(2);
  expect(links[0].revoked_at).not.toBeNull();
  expect(links[1]).toMatchObject({
    id: b.id,
    bootstrap: true,
    organisation_id: null,
    revoked_at: null,
    duration: { hours: 1 },
  });
  expect((await fixture.db.pool.query('SELECT id FROM role_assignments')).rowCount).toBe(1);
  expect((await fixture.db.pool.query('SELECT id FROM client_memberships')).rowCount).toBe(0);
  const { Accounts } = await import('../packages/domain/src/accounts.js');
  const accounts = new Accounts(bootstrap.auth),
    guest = await bootstrap.auth.context();
  await expect(
    accounts.redeem(
      guest.token!,
      guest.csrf,
      a.token,
      'setup',
      'Initial private setup password',
      'Initial private setup password',
    ),
  ).rejects.toMatchObject({ code: 'link_unavailable' });
  await accounts.redeem(
    guest.token!,
    guest.csrf,
    b.token,
    'setup',
    'Initial private setup password',
    'Initial private setup password',
  );
  expect(
    (await fixture.db.pool.query('SELECT password_enabled FROM users WHERE id=$1', [first])).rows[0]
      .password_enabled,
  ).toBe(true);
  expect((await fixture.db.pool.query('SELECT id FROM client_memberships')).rowCount).toBe(0);
  await expect(bootstrap.syntheticSetup(first, 'test-operator', reason)).rejects.toMatchObject({
    code: 'bootstrap_setup_unavailable',
  });
  const fresh = await bootstrap.auth.context();
  await expect(
    accounts.redeem(
      fresh.token!,
      fresh.csrf,
      b.token,
      'setup',
      'Initial private setup password',
      'Initial private setup password',
    ),
  ).rejects.toMatchObject({ code: 'link_unavailable' });
  const audit = JSON.stringify(
    (await fixture.db.pool.query('SELECT * FROM platform_audit_events')).rows,
  );
  expect(audit).not.toContain(a.token);
  expect(audit).not.toContain(b.token);
});
it('does not create setup links for a non-administrator or an external identity', async () => {
  await fixture.db.pool.query('UPDATE users SET password_enabled=false WHERE id=$1', [second]);
  await expect(bootstrap.syntheticSetup(second, 'operator', reason)).rejects.toMatchObject({
    code: 'bootstrap_setup_unavailable',
  });
  await fixture.db.pool.query(
    "UPDATE users SET password_enabled=false,origin='primary_import',sync_policy='primary',permissions_synced_at=now() WHERE id=$1",
    [first],
  );
  await expect(bootstrap.syntheticSetup(first, 'operator', reason)).rejects.toMatchObject({
    code: 'identity_review',
  });
});
