import { requireCondition } from './errors.js';
export function loopbackHost(value: string) {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(value.toLowerCase());
}
export function productionBootstrapProfile(profile: 'hosted' | 'local') {
  let origin: URL | undefined, database: URL | undefined;
  try {
    origin = new URL(process.env.APP_ORIGIN ?? '');
    database = new URL(process.env.DATABASE_URL ?? '');
  } catch {}
  requireCondition(
    ['hosted', 'local'].includes(profile) &&
      process.env.NODE_ENV === 'production' &&
      process.env.TRAINING_ENVIRONMENT === 'production' &&
      process.env.TRAINING_AUTH_MODE === 'local_password' &&
      origin &&
      database &&
      ['postgres:', 'postgresql:'].includes(database.protocol) &&
      Boolean(database.hostname && database.pathname.length > 1) &&
      !database.hash &&
      !origin.username &&
      !origin.password &&
      origin.pathname === '/' &&
      !origin.search &&
      !origin.hash &&
      process.env.MOCK_IDENTITY_ENABLED !== 'true',
    403,
    'production_bootstrap_profile',
    'Production bootstrap requires an explicit production password profile and PostgreSQL connection.',
  );
  if (profile === 'hosted')
    requireCondition(
      process.env.TRAINING_INSTALL_MODE === 'hosted' &&
        process.env.TRAINING_LOCAL_PRODUCTION !== 'true' &&
        origin.protocol === 'https:',
      403,
      'production_bootstrap_profile',
      'Hosted password setup must be explicitly configured with HTTPS.',
    );
  else
    requireCondition(
      process.env.TRAINING_LOCAL_PRODUCTION === 'true' &&
        loopbackHost(origin.hostname) &&
        ['http:', 'https:'].includes(origin.protocol) &&
        loopbackHost(database.hostname) &&
        !database.search &&
        process.env.TRAINING_LOCAL_PRODUCTION_DATABASE ===
          decodeURIComponent(database.pathname.slice(1)) &&
        Boolean(process.env.TRAINING_LOCAL_PRODUCTION_DATABASE),
      403,
      'production_bootstrap_profile',
      'Local production bootstrap requires the explicitly designated loopback PostgreSQL database.',
    );
  return origin.origin;
}

/** Strict loopback checks for the explicitly enabled local production HTTP profile. */
export function localProductionRequest(input: {
  address?: string;
  host?: string;
  forwardedHost?: string;
  forwardedFor?: string;
}) {
  const address = (value: string) =>
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(value.trim().toLowerCase());
  const host = (value: string | undefined) => {
    if (!value || /[\s,]/.test(value)) return false;
    try {
      const parsed = new URL('http://' + value);
      return (
        loopbackHost(parsed.hostname) &&
        !parsed.username &&
        !parsed.password &&
        parsed.pathname === '/' &&
        !parsed.search &&
        !parsed.hash
      );
    } catch {
      return false;
    }
  };
  return Boolean(
    input.address &&
    address(input.address) &&
    host(input.host) &&
    (input.forwardedHost === undefined || host(input.forwardedHost)) &&
    (input.forwardedFor === undefined || input.forwardedFor.split(',').every(address)),
  );
}
