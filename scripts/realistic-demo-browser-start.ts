import path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const root = path.resolve(process.env.TRACKER_REALISTIC_DEMO_ROOT ?? '');
if (!root.startsWith(path.resolve('.runtime/realistic-demo-browser') + path.sep))
  throw new Error('An isolated fictional demo workspace is required.');
await mkdir(path.join(root, 'private'), { recursive: true });
Object.assign(process.env, {
  DOTENV_CONFIG_PATH: path.join(root, '.env'),
  SETUP_APP_ROOT: root,
  PRIVATE_STORAGE_PATH: path.join(root, 'private'),
  TRAINING_DEMO_ROOT: root,
  TRAINING_DEMO_DATABASE: path.join(root, 'private/pglite'),
  NODE_ENV: 'development',
  TRAINING_ENVIRONMENT: 'test',
  TRAINING_AUTH_MODE: 'mock',
  MOCK_IDENTITY_ENABLED: 'true',
  TRAINING_DEMO_ENABLED: 'true',
  DATABASE_URL: '',
  MIGRATION_DATABASE_URL: '',
  APP_ENCRYPTION_KEY: '',
  AI_LIVE_ENABLED: 'false',
  AI_ANTHROPIC_ENABLED: 'false',
  AI_GEMINI_ENABLED: 'false',
  SMTP_ENABLED: 'false',
  ACCOUNT_MAIL_ENABLED: 'false',
  RETENTION_APPROVED: 'false',
  WEB_PORT: '3150',
  API_PORT: '3151',
  PGLITE_PORT: '55445',
  APP_ORIGIN: 'http://127.0.0.1:3150',
});
delete process.env.TRACKER_EPHEMERAL_TEST_DB;
await writeFile(path.join(root, '.env'), '# Isolated fictional demo browser qualification\n', {
  flag: 'wx',
});
async function command(action: string, check = false) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/realistic-demo.ts',
        action,
        '--database',
        process.env.TRAINING_DEMO_DATABASE!,
        ...(check ? ['--check'] : []),
      ],
      { env: process.env, stdio: 'inherit' },
    );
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Demo command failed: ' + action)),
    );
  });
}
await command('seed');
const manifest = await readFile(path.join(root, 'manifest.json'), 'utf8');
await command('seed');
if ((await readFile(path.join(root, 'manifest.json'), 'utf8')) !== manifest)
  throw new Error('Identical CLI replay changed the manifest.');
await command('global-admin', true);
await command('global-admin');
await command('global-admin');
if ((await readFile(path.join(root, 'manifest.json'), 'utf8')) !== manifest)
  throw new Error('Extension changed the original base manifest.');
await import('./dev.js');
