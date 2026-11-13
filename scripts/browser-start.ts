delete process.env.CLAMSCAN_PATH;
delete process.env.CLAMSCAN_DATABASE;
process.env.TRACKER_EPHEMERAL_TEST_DB = '1';
import path from 'node:path';
process.env.PRIVATE_STORAGE_PATH = path.resolve(
  '.runtime/browser',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
process.env.WEB_PORT = '3110';
process.env.API_PORT = '3111';
process.env.PGLITE_PORT = '55432';
process.env.APP_ORIGIN = 'http://127.0.0.1:3110';
delete process.env.DATABASE_URL;
delete process.env.MIGRATION_DATABASE_URL;
await import('./dev.js');
