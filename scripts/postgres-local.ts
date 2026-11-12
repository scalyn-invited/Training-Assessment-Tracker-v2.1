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
let started = false;
try {
  await postgres.initialise();
  await postgres.start();
  started = true;
  await postgres.createDatabase('training_v21_test');
  console.log('Isolated PostgreSQL ready; credentials are not logged.');
  const child = spawn(
    process.execPath,
    [path.resolve('node_modules/vitest/vitest.mjs'), 'run', 'tests/postgres.test.ts'],
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
        ['-D', folder, '-m', 'fast', '-w', '-t', '20', 'stop'],
        { windowsHide: true, timeout: 30000 },
      );
    else await postgres.stop();
  }
}
