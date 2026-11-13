import type { Auth, AuthUser } from './auth.js';
import { assertFixtureMode, type DemoMode } from './demo-client.js';
import { requireCondition } from './errors.js';
/** Internal fixture sessions retain the same authentication-mode checks as ordinary requests. */
export async function fixtureSession(
  auth: Auth,
  user: AuthUser,
  mode: DemoMode = 'local_password',
) {
  assertFixtureMode(mode);
  if (mode === 'local_password') return auth.newSession(auth.db.pool, user);
  const identity = (
    await auth.db.pool.query<{ id: string }>(
      'SELECT id FROM identities WHERE user_id=$1 AND issuer=$2 AND active',
      [user.id, process.env.MOCK_IDENTITY_ISSUER ?? 'https://identity.example.invalid/mock'],
    )
  ).rows[0];
  requireCondition(identity, 409, 'demo_identity', 'The fictional mock identity is missing.');
  return auth.newSession(auth.db.pool, user, identity.id);
}
