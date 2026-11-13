import { beforeAll, afterAll, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import path from 'node:path';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Accounts } from '../packages/domain/src/accounts.js';
let fixture: Awaited<ReturnType<typeof testDatabase>>;
const key = randomBytes(32),
  first = randomUUID(),
  second = randomUUID();
function command(args: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'scripts/operator-bootstrap.ts', ...args],
      {
        windowsHide: true,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          TRAINING_ENVIRONMENT: 'test',
          TRAINING_AUTH_MODE: 'local_password',
          APP_ORIGIN: 'http://127.0.0.1:3100',
          APP_ENCRYPTION_KEY: key.toString('hex'),
          PGLITE_PORT: '55439',
          DATABASE_URL: '',
          MIGRATION_DATABASE_URL: '',
          DOTENV_CONFIG_PATH: path.resolve('.runtime/no-operator-cli-environment'),
        },
      },
    );
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    child.once('error', () => reject(new Error('Operator test process failed to start.')));
    child.once('exit', (code) => resolve({ code, stdout, stderr }));
  });
}
beforeAll(async () => {
  fixture = await testDatabase();
  for (const id of [first, second]) {
    await fixture.db.pool.query(
      "INSERT INTO users(id,email,name,password_hash,password_enabled,environment) VALUES($1,$2,'Fictional CLI target','disabled',false,'test')",
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
it('rejects missing/duplicate flags and mismatched environment without creating grants', async () => {
  for (const args of [
    ['global-admin', first, '--environment', 'test'],
    [
      'global-admin',
      first,
      '--environment',
      'test',
      '--operator',
      'tester',
      '--operator',
      'again',
      '--reason',
      'CLI failure rehearsal',
    ],
    [
      'global-admin',
      first,
      '--environment',
      'production',
      '--operator',
      'tester',
      '--reason',
      'CLI environment rehearsal',
    ],
  ])
    expect((await command(args)).code).toBe(1);
  expect((await fixture.db.pool.query('SELECT id FROM role_assignments')).rowCount).toBe(0);
});
it('executes first-admin and synthetic setup commands and returns the link only on stdout', async () => {
  const appointment = [
    'global-admin',
    first,
    '--environment',
    'test',
    '--operator',
    'cli-tester',
    '--reason',
    'CLI first administrator rehearsal',
  ];
  expect((await command(appointment)).code).toBe(0);
  expect((await command(appointment)).code).toBe(0);
  const denied = await command([
    'global-admin',
    second,
    '--environment',
    'test',
    '--operator',
    'cli-tester',
    '--reason',
    'Additional administrator must use UI',
  ]);
  expect(denied.code).toBe(1);
  const issued = await command([
    'local-setup',
    first,
    '--operator',
    'cli-tester',
    '--reason',
    'CLI initial password setup rehearsal',
  ]);
  expect(issued.code).toBe(0);
  let link: URL;
  try {
    link = new URL(issued.stdout.trim());
  } catch {
    throw new Error('The private CLI link output was not a single valid URL.');
  }
  const params = new URLSearchParams(link.hash.slice(1)),
    token = params.get('token')!;
  expect(link.origin).toBe('http://127.0.0.1:3100');
  expect(link.pathname).toBe('/account/link');
  expect(/^[a-f0-9]{64}$/.test(token)).toBe(true);
  expect(issued.stderr.includes(token)).toBe(false);
  const auth = new Auth(fixture.db, key),
    accounts = new Accounts(auth),
    guest = await auth.context();
  await accounts.redeem(
    guest.token!,
    guest.csrf,
    token,
    'setup',
    'Private CLI initial password',
    'Private CLI initial password',
  );
  expect((await fixture.db.pool.query('SELECT id FROM role_assignments')).rowCount).toBe(1);
  expect((await fixture.db.pool.query('SELECT id FROM client_memberships')).rowCount).toBe(0);
  const audit = JSON.stringify(
    (await fixture.db.pool.query('SELECT * FROM platform_audit_events')).rows,
  );
  expect(audit.includes(token)).toBe(false);
});
