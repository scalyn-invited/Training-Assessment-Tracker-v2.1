import { digest } from './crypto.js';
import { requireCondition } from './errors.js';
import type { Auth } from './auth.js';

export type RequestLimit = { bucket: string; maximum: number };
/** V2 routes/web.php uses one user signature for unprefixed throttles. */
export function requestLimit(method: string, route: string, body?: unknown): RequestLimit | null {
  if (method !== 'POST') return null;
  const pathname = route.replace(/\/$/, '');
  if (/^\/platform\/(clients|client-accounts|admins\/(appoint|revoke))$/.test(pathname))
    return { bucket: 'platform', maximum: 30 };
  if (pathname === '/branding/preference') return { bucket: 'theme-preferences', maximum: 60 };
  if (pathname === '/branding') {
    const client =
      body && typeof body === 'object' && 'clientId' in body ? body.clientId : undefined;
    return { bucket: client === null ? 'platform-branding' : 'default', maximum: 20 };
  }
  if (
    /^\/assessments\/media(?:\/[^/]+\/retry)?$/.test(pathname) ||
    /^\/enrolments\/[^/]+\/files$/.test(pathname)
  )
    return { bucket: 'default', maximum: 20 };
  if (/^\/assessments\/(responses|reviews)\/[^/]+$/.test(pathname))
    return { bucket: 'default', maximum: 60 };
  if (
    /^\/enrolments\/[^/]+\/(documents\/[^/]+|plan\/generation)$/.test(pathname) ||
    pathname === '/auth/password' ||
    /^\/accounts\/(create|recover|cancel)$/.test(pathname)
  )
    return { bucket: 'default', maximum: 10 };
  return null;
}

export class RequestLimits {
  constructor(readonly auth: Auth) {}
  async enforce(token: string, method: string, route: string, body?: unknown) {
    const policy = requestLimit(method, route, body);
    if (!policy) return;
    const user = await this.auth.db.transaction(async (sql) => {
      return (await this.auth.verified(sql, token)).user!;
    });
    const admitted = await this.auth.db.transaction(async (sql) => {
      const result = await sql.query(
        `INSERT INTO auth_attempts(key_hash,count,reset_at) VALUES($1,1,now()+interval '1 minute')
         ON CONFLICT(key_hash) DO UPDATE SET
           count=CASE WHEN auth_attempts.reset_at<now() THEN 1 ELSE auth_attempts.count+1 END,
           reset_at=CASE WHEN auth_attempts.reset_at<now() THEN now()+interval '1 minute' ELSE auth_attempts.reset_at END
         WHERE auth_attempts.reset_at<now() OR auth_attempts.count<$2 RETURNING count`,
        [digest('http:' + policy.bucket + ':' + user.environment + ':' + user.id), policy.maximum],
      );
      return Boolean(result.rowCount);
    });
    requireCondition(admitted, 429, 'rate_limited', 'Wait one minute before trying again.');
  }
}
