import { isIP } from 'node:net';
import { requireCondition } from './errors.js';
export type SetupTransport = {
  encrypted: boolean;
  remoteAddress: string;
  host: string;
  forwardedHost?: string;
  forwardedProto?: string;
  origin?: string;
  method: string;
};
export function verifySetupTransport(
  request: SetupTransport,
  applicationOrigin: string,
  trustedProxy?: string,
  mode: 'hosted' | 'local' = 'hosted',
) {
  const expected = new URL(applicationOrigin);
  requireCondition(
    mode === 'local'
      ? ['http:', 'https:'].includes(expected.protocol) &&
          ['localhost', '127.0.0.1', '[::1]'].includes(expected.hostname)
      : expected.protocol === 'https:',
    503,
    'https_required',
    'Hosted setup requires HTTPS.',
  );
  const address = request.remoteAddress.replace(/^::ffff:/, ''),
    proxy = trustedProxy?.replace(/^::ffff:/, '');
  requireCondition(
    !proxy || Boolean(isIP(proxy)),
    503,
    'proxy_configuration',
    'Configure one explicit trusted setup proxy IP address.',
  );
  const forwarded = Boolean(proxy && address === proxy);
  if (mode === 'local')
    requireCondition(
      ['127.0.0.1', '::1'].includes(address),
      403,
      'localhost_required',
      'Local setup is available only on this computer.',
    );
  requireCondition(
    (mode === 'local' && expected.protocol === 'http:') ||
      request.encrypted ||
      (forwarded && request.forwardedProto === 'https'),
    403,
    'https_required',
    'Open setup through the configured HTTPS application origin.',
  );
  const host = forwarded && !request.encrypted ? request.forwardedHost : request.host;
  requireCondition(
    host?.toLowerCase() === expected.host.toLowerCase(),
    403,
    'setup_host',
    'Open setup at the configured application origin.',
  );
  if (!['GET', 'HEAD'].includes(request.method))
    requireCondition(
      request.origin === expected.origin,
      403,
      'setup_origin',
      'Open setup at the configured application origin.',
    );
}
