import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
let instance: Awaited<ReturnType<typeof testDatabase>>, auth: Auth, tenancy: Tenancy;
let client: string, admin: { token: string; csrf: string }, ordinary: { token: string; csrf: string };
const data = { name: 'Local person', email: 'new.person@example.invalid', role: 'member' as const, synthetic: true, reason: 'Create approved local training person' };
beforeAll(async () => {
  instance = await testDatabase(); auth = new Auth(instance.db, randomBytes(32)); tenancy = new Tenancy(auth);
  const guest = await auth.context();
  await auth.setup(guest.token!, guest.csrf, { name: 'Administrator', email: 'owner@example.invalid', password: 'Unique administrator passphrase', demoPassword: 'Separate demonstration password' });
  vi.stubEnv('TRAINING_AUTH_MODE', 'mock'); vi.stubEnv('MOCK_IDENTITY_ENABLED', 'true'); vi.stubEnv('TRAINING_ENVIRONMENT', 'test');
  async function login(email: string) {
    const row = (await instance.db.pool.query('SELECT i.id,cm.organisation_id FROM identities i JOIN users u ON u.id=i.user_id JOIN client_memberships cm ON cm.user_id=u.id WHERE u.email=$1', [email])).rows[0];
    client = row.organisation_id;
    const visitor = await auth.context(); const session = await auth.mockLogin(visitor.token!, visitor.csrf, row.id);
    await tenancy.select(session.token, session.csrf, client); return session;
  }
  admin = await login('demo.1.0@example.invalid'); ordinary = await login('demo.1.3@example.invalid');
});
afterAll(async () => { vi.unstubAllEnvs(); await instance?.close(); });
it('creates a scoped synthetic person who can sign in without a password', async () => {
  const result = await tenancy.createPerson(admin.token, admin.csrf, client, data);
  const row = (await instance.db.pool.query('SELECT u.*,i.id identity_id,r.role,r.scope_type FROM users u JOIN identities i ON i.user_id=u.id JOIN role_assignments r ON r.user_id=u.id WHERE u.id=$1', [result.id])).rows[0];
  expect(row).toMatchObject({ password_enabled: false, origin: 'manual', sync_policy: 'local_only', permission_version: 3, role: 'member', scope_type: 'client' });
  expect(row.password_hash).toMatch(/^scrypt:/);
  const visitor = await auth.context(); const session = await auth.mockLogin(visitor.token!, visitor.csrf, row.identity_id);
  expect((await tenancy.choices(session.token)).map(c => c.id)).toEqual([client]);
  expect((await instance.db.pool.query("SELECT metadata FROM audit_events WHERE action='person.created' AND target_id=$1", [result.id])).rows[0].metadata).toEqual({reason:data.reason,synthetic:true});
});
it('creates a real local-only coordinator without inventing a sign-in identity', async () => {
  const result = await tenancy.createPerson(admin.token, admin.csrf, client, {...data,email:'local.person@example.org',synthetic:false,role:'coordinator'});
  expect((await instance.db.pool.query('SELECT id FROM identities WHERE user_id=$1',[result.id])).rowCount).toBe(0);
  expect((await instance.db.pool.query('SELECT role,scope_type FROM role_assignments WHERE user_id=$1',[result.id])).rows).toEqual([{role:'coordinator',scope_type:'client'}]);
});
it('rejects duplicates, invalid classification, unauthorized actors and password mode without partial writes', async () => {
  const before = (await instance.db.pool.query('SELECT (SELECT count(*) FROM users)::int users,(SELECT count(*) FROM audit_events)::int audits')).rows[0];
  await expect(tenancy.createPerson(admin.token,admin.csrf,client,data)).rejects.toMatchObject({status:409});
  await expect(tenancy.createPerson(admin.token,admin.csrf,client,{...data,email:'synthetic@example.org'})).rejects.toMatchObject({status:422});
  await expect(tenancy.createPerson(ordinary.token,ordinary.csrf,client,{...data,email:'denied@example.invalid'})).rejects.toMatchObject({status:403});
  vi.stubEnv('TRAINING_AUTH_MODE','local_password');
  await expect(tenancy.createPerson(admin.token,admin.csrf,client,{...data,email:'password@example.invalid'})).rejects.toMatchObject({status:409});
  vi.stubEnv('TRAINING_AUTH_MODE','mock');
  expect((await instance.db.pool.query('SELECT (SELECT count(*) FROM users)::int users,(SELECT count(*) FROM audit_events)::int audits')).rows[0]).toEqual(before);
});

it('rolls back the person and identity when a later audit write fails', async () => {
  const original = tenancy.audit.bind(tenancy);
  const spy = vi.spyOn(tenancy, 'audit').mockImplementation(async (...args) => {
    await original(...args);
    if (args[3] === 'client.role.granted') throw new Error('Injected transaction failure');
  });
  try {
    await expect(tenancy.createPerson(admin.token,admin.csrf,client,{...data,email:'rollback@example.invalid'})).rejects.toThrow('Injected transaction failure');
    expect((await instance.db.pool.query("SELECT id FROM users WHERE email='rollback@example.invalid'")).rowCount).toBe(0);
    expect((await instance.db.pool.query('SELECT i.id FROM identities i LEFT JOIN users u ON u.id=i.user_id WHERE u.id IS NULL')).rowCount).toBe(0);
  } finally { spy.mockRestore(); }
});
