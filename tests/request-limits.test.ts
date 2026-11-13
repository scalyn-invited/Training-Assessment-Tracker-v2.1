import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth, type AuthUser } from '../packages/domain/src/auth.js';
import { RequestLimits, requestLimit } from '../packages/domain/src/request-limits.js';
let fixture: Awaited<ReturnType<typeof testDatabase>>, auth: Auth, limits: RequestLimits;
let first: string, second: string, other: string, userId: string;
beforeAll(async () => {
  fixture = await testDatabase({ port: 55448 });
  auth = new Auth(fixture.db, randomBytes(32));
  limits = new RequestLimits(auth);
  const sessions: string[] = [];
  for (let i = 0; i < 2; i++) {
    const id = randomUUID(),
      identity = randomUUID();
    if (i === 0) userId = id;
    await fixture.db.pool.query(
      "INSERT INTO users(id,email,name,password_hash,password_enabled,environment) VALUES($1,$2,'Limit fixture','unusable',true,'test')",
      [id, id + '@example.invalid'],
    );
    await fixture.db.pool.query(
      "INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2::uuid,'urn:training:local',$2::text)",
      [identity, id],
    );
    const user = (await fixture.db.pool.query<AuthUser>('SELECT * FROM users WHERE id=$1', [id]))
      .rows[0];
    for (let n = 0; n < (i === 0 ? 2 : 1); n++)
      sessions.push((await fixture.db.transaction((sql) => auth.newSession(sql, user))).token);
  }
  [first, second, other] = sessions;
});
afterAll(async () => {
  await fixture?.close();
});
beforeEach(async () => {
  await fixture.db.pool.query('DELETE FROM auth_attempts');
});
it('shares a user budget across browser sessions, record IDs and unprefixed source actions', async () => {
  for (let i = 0; i < 20; i++)
    await limits.enforce(
      i % 2 ? first : second,
      'POST',
      '/assessments/media/' + randomUUID() + '/retry',
    );
  await expect(
    limits.enforce(second, 'POST', '/enrolments/' + randomUUID() + '/files'),
  ).rejects.toMatchObject({ status: 429 });
  await expect(
    limits.enforce(first, 'POST', '/enrolments/' + randomUUID() + '/plan/generation'),
  ).rejects.toMatchObject({ status: 429 });
  expect((await fixture.db.pool.query('SELECT count FROM auth_attempts')).rows).toEqual([
    { count: 20 },
  ]);
  // V2 does not charge rejected requests, so a higher-threshold shared action remains available.
  await expect(
    limits.enforce(first, 'POST', '/assessments/reviews/another'),
  ).resolves.toBeUndefined();
  await expect(limits.enforce(other, 'POST', '/assessments/media')).resolves.toBeUndefined();
  await expect(limits.enforce(first, 'POST', '/platform/clients')).resolves.toBeUndefined();
  await expect(
    limits.enforce(first, 'POST', '/branding', { clientId: null }),
  ).resolves.toBeUndefined();
});
it('uses exact source thresholds and resets only when the shared window expires', async () => {
  for (let i = 0; i < 10; i++) await limits.enforce(first, 'POST', '/enrolments/a/documents/b');
  await expect(
    limits.enforce(second, 'POST', '/enrolments/c/plan/generation'),
  ).rejects.toMatchObject({ status: 429 });
  await fixture.db.pool.query("UPDATE auth_attempts SET reset_at=now()-interval '1 second'");
  await expect(
    limits.enforce(second, 'POST', '/enrolments/c/plan/generation'),
  ).resolves.toBeUndefined();
  expect((await fixture.db.pool.query('SELECT count FROM auth_attempts')).rows).toEqual([
    { count: 1 },
  ]);
});
it('rechecks identity before admitting a protected request and ignores unthrottled reads', async () => {
  await expect(limits.enforce('invalid', 'POST', '/assessments/media')).rejects.toMatchObject({
    status: 401,
  });
  await fixture.db.pool.query('UPDATE identities SET active=false WHERE user_id=$1', [userId]);
  try {
    await expect(limits.enforce(first, 'POST', '/assessments/media')).rejects.toMatchObject({
      status: 401,
    });
  } finally {
    await fixture.db.pool.query('UPDATE identities SET active=true WHERE user_id=$1', [userId]);
  }
  expect((await fixture.db.pool.query('SELECT * FROM auth_attempts')).rowCount).toBe(0);
  expect(requestLimit('GET', '/assessments/media/a')).toBeNull();
  expect(requestLimit('POST', '/assessments/builder')).toBeNull();
  expect(requestLimit('POST', '/branding', { clientId: 'a' })).toEqual({
    bucket: 'default',
    maximum: 20,
  });
  expect(requestLimit('POST', '/branding/preference')).toEqual({
    bucket: 'theme-preferences',
    maximum: 60,
  });
  expect(requestLimit('POST', '/assessments/reviews/:id')).toEqual({
    bucket: 'default',
    maximum: 60,
  });
});

it('atomically admits only the available budget under concurrent browser requests', async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 25 }, (_, index) =>
      limits.enforce(index % 2 ? first : second, 'POST', '/assessments/media'),
    ),
  );
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(20);
  const rejected = results.filter((result) => result.status === 'rejected');
  expect(rejected).toHaveLength(5);
  for (const result of rejected)
    if (result.status === 'rejected') expect(result.reason).toMatchObject({ status: 429 });
  expect((await fixture.db.pool.query('SELECT count FROM auth_attempts')).rows).toEqual([
    { count: 20 },
  ]);
});
