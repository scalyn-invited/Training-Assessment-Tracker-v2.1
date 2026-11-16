import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Access } from '../packages/domain/src/access.js';
import type { Sql } from '../packages/database/src/database.js';
let instance: Awaited<ReturnType<typeof testDatabase>>;
let user: string, client: string, membership: string;
const access = new Access();
beforeAll(async () => {
  instance = await testDatabase();
  const auth = new Auth(instance.db, randomBytes(32));
  const guest = await auth.context();
  await auth.setup(guest.token!, guest.csrf, {
    name: 'Admin',
    email: 'admin@example.invalid',
    password: 'Unique administrator passphrase',
    demoPassword: 'Separate demonstration password',
  });
  const row = (
    await instance.db.pool.query(
      "SELECT u.id,cm.id membership,cm.organisation_id FROM users u JOIN client_memberships cm ON cm.user_id=u.id WHERE u.email='demo.1.3@example.invalid'",
    )
  ).rows[0];
  user = row.id;
  client = row.organisation_id;
  membership = row.membership;
});
afterAll(async () => {
  await instance?.close();
});
it('bounds each fresh membership decision to one database round trip', async () => {
  await instance.db.transaction(async (sql) => {
    let queries = 0;
    const counted: Sql = {
      query: (text, values) => {
        queries++;
        return sql.query(text, values);
      },
    };
    expect((await access.membership(counted, user, client, 'test'))?.id).toBe(membership);
    expect(queries).toBe(1);
    await sql.query('UPDATE users SET active=false WHERE id=$1', [user]);
    expect(await access.membership(counted, user, client, 'test')).toBeUndefined();
    expect(queries).toBe(2);
    await sql.query('UPDATE users SET active=true WHERE id=$1', [user]);
  });
});
it('preserves every current identity, client, environment and membership gate without caching', async () => {
  await instance.db.transaction(async (sql) => {
    const read = () => access.membership(sql, user, client, 'test');
    expect((await read())?.id).toBe(membership);
    expect(await access.membership(sql, user, client, 'production')).toBeUndefined();
    const mutations: [string, unknown[]][] = [
      ['UPDATE users SET active=false WHERE id=$1', [user]],
      ['UPDATE identities SET active=false WHERE user_id=$1', [user]],
      [
        "UPDATE users SET origin='primary_import',permissions_synced_at=now()-interval '6 minutes' WHERE id=$1",
        [user],
      ],
      ['UPDATE organisations SET active=false WHERE id=$1', [client]],
      [
        "UPDATE platform_client_states SET suspended=true WHERE organisation_id=$1 AND environment='test'",
        [client],
      ],
      ["UPDATE client_memberships SET status='ended' WHERE id=$1", [membership]],
      ["UPDATE client_memberships SET joined_at=now()+interval '1 day' WHERE id=$1", [membership]],
      ['UPDATE client_memberships SET ended_at=now() WHERE id=$1', [membership]],
    ];
    for (const [query, values] of mutations) {
      await sql.query('SAVEPOINT membership_gate');
      await sql.query(query, values);
      expect(await read()).toBeUndefined();
      await sql.query('ROLLBACK TO SAVEPOINT membership_gate');
      expect((await read())?.id).toBe(membership);
    }
    await sql.query(
      "UPDATE users SET origin='primary_import',permissions_synced_at=now()-interval '5 minutes' WHERE id=$1",
      [user],
    );
    expect((await read())?.id).toBe(membership);
    await sql.query("UPDATE users SET origin='local',permissions_synced_at=NULL WHERE id=$1", [
      user,
    ]);
  });
});
