import path from 'node:path';

// Never load the operator's saved .env or use their database/storage for UI QA.
const root = path.resolve(
  '.runtime/overview-browser',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
Object.assign(process.env, {
  NEXT_DIST_DIR: '.next-overview',
  DOTENV_CONFIG_PATH: path.join(root, 'unused.env'),
  TRACKER_EPHEMERAL_TEST_DB: '1',
  PRIVATE_STORAGE_PATH: path.join(root, 'private'),
  NODE_ENV: 'test',
  TRAINING_ENVIRONMENT: 'test',
  TRAINING_AUTH_MODE: 'local_password',
  MOCK_IDENTITY_ENABLED: 'false',
  SMTP_ENABLED: 'false',
  ACCOUNT_MAIL_ENABLED: 'false',
  AI_LIVE_ENABLED: 'false',
  WEB_PORT: '3110',
  API_PORT: '3111',
  PGLITE_PORT: '55432',
  APP_ORIGIN: 'http://127.0.0.1:3110',
});
for (const key of [
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'APP_ENCRYPTION_KEY',
  'CLAMSCAN_PATH',
  'CLAMSCAN_DATABASE',
])
  delete process.env[key];
await import('./dev.js');
