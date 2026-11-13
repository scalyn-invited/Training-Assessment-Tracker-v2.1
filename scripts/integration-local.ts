import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { Database } from '../packages/database/src/database.js';
import { MockIdentity } from '../packages/domain/src/mock-identity.js';
import { SandboxDirectory } from '../packages/domain/src/sandbox-directory.js';
import { encryptionKey } from '../packages/domain/src/crypto.js';
import { requireCondition } from '../packages/domain/src/errors.js';
import type { AuthUser } from '../packages/domain/src/auth.js';
const [operation, first, second] = process.argv.slice(2);
const db = new Database();
try {
  const mock = new MockIdentity(await encryptionKey());
  mock.assertEnabled();
  if (operation === 'directory-import' && first && second) {
    const bytes = await readFile(first);
    requireCondition(
      bytes.length <= 1024 * 1024,
      422,
      'event_too_large',
      'Use a directory event file no larger than 1 MiB.',
    );
    const result = await new SandboxDirectory(db, mock).apply(
      second,
      JSON.parse(bytes.toString('utf8')),
    );
    console.log(result);
  } else if (operation === 'mock-token' && first && !second) {
    const user = (
      await db.pool.query<AuthUser>('SELECT * FROM users WHERE lower(email)=lower($1)', [first])
    ).rows[0];
    requireCondition(user, 404, 'user_unknown', 'Unknown local fixture account.');
    console.log(await mock.issue(db.pool, user));
  } else
    throw new Error(
      'Usage: npm run integration:local -- directory-import <event.json> <client-id> | mock-token <fixture-email>',
    );
} finally {
  await db.close();
}
