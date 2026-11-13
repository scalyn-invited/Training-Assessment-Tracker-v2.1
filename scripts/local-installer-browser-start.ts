import path from 'node:path';
import { mkdir } from 'node:fs/promises';
const root = path.resolve(process.env.TRACKER_LOCAL_INSTALLER_ROOT ?? '');
if (!root.startsWith(path.resolve('.runtime/local-installer-browser') + path.sep))
  throw new Error('An isolated local installation directory is required.');
await mkdir(root, { recursive: true });
process.env.SETUP_APP_ROOT = root;
process.env.DOTENV_CONFIG_PATH = path.join(root, '.env');
process.env.WEB_PORT = '3130';
process.env.API_PORT = '3131';
process.env.PGLITE_PORT = '55442';
process.env.APP_ORIGIN = 'http://127.0.0.1:3130';
// The private path changes to the owned installation path at completion.
// This harness-only parent value must not become a protected process override.
delete process.env.PRIVATE_STORAGE_PATH;
delete process.env.DATABASE_URL;
delete process.env.MIGRATION_DATABASE_URL;
delete process.env.APP_ENCRYPTION_KEY;
await import('./dev.js');
