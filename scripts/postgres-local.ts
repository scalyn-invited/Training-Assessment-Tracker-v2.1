import EmbeddedPostgres from 'embedded-postgres';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const folder = path.resolve(
  '.runtime/postgres-tests',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
await mkdir(folder, { recursive: true });
const password = randomBytes(24).toString('hex');
const postgres = new EmbeddedPostgres({
  databaseDir: folder,
  user: 'postgres',
  password,
  port: 55440,
  persistent: true,
  createPostgresUser: false,
  autoRehydrateSymlinks: true,
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: () => {},
});
const suites = ['tests/postgres.test.ts','tests/demo-postgres.test.ts','tests/foundation-checks-postgres.test.ts','tests/operator-bootstrap-postgres.test.ts','tests/client-services-postgres.test.ts'];
const requested = process.argv.slice(2);
if(requested.some(file=>!suites.includes(file)))throw new Error('Choose a configured PostgreSQL qualification suite.');
let started = false;
try {
  await postgres.initialise();
  await postgres.start();
  started = true;
  await postgres.createDatabase('training_v21_test');
  console.log('Isolated PostgreSQL ready; credentials are not logged.');
  const child = spawn(
    process.execPath,
    [
      path.resolve('node_modules/vitest/vitest.mjs'),
      'run',
      ...(requested.length ? requested : suites),
      '--reporter=default',
      '--reporter=json',
      '--outputFile=.runtime/postgres-qualification.json',
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST_POSTGRES_URL:
          'postgresql://postgres:' + password + '@127.0.0.1:55440/training_v21_test',
      },
    },
  );
  process.exitCode = await new Promise<number>((resolve) => {
    child.once('error', () => resolve(1));
    child.once('exit', (code) => resolve(code ?? 1));
  });
} finally {
  if (started) {
    if (process.platform === 'win32')
      await promisify(execFile)(
        path.resolve('node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe'),
        ['-D', folder, '-m', 'fast', '-w', '-t', '60', 'stop'],
        { windowsHide: true, timeout: 70000 },
      );
    else await postgres.stop();
  }
}
