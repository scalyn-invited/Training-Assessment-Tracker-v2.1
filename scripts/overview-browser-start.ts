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
  TRAINING_AUTH_MODE: process.env.CLIENTS_QA_SUITE === 'accounts-mock' ? 'mock' : 'local_password',
  MOCK_IDENTITY_ENABLED: process.env.CLIENTS_QA_SUITE === 'accounts-mock' ? 'true' : 'false',
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
// Native image qualification is opt-in and still uses isolated test storage/DB.
if (process.env.PROMPT_NATIVE_SCAN === '1') {
  if (!process.env.QA_CLAMSCAN_PATH || !process.env.QA_CLAMSCAN_DATABASE)
    throw new Error('Native scan QA requires explicit scanner and signature paths.');
  process.env.CLAMSCAN_PATH = process.env.QA_CLAMSCAN_PATH;
  process.env.CLAMSCAN_DATABASE = process.env.QA_CLAMSCAN_DATABASE;
}
await import('./dev.js');
