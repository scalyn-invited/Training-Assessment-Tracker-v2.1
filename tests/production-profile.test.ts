import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  productionBootstrapProfile,
  localProductionRequest,
} from '../packages/domain/src/production-profile.js';
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('TRAINING_ENVIRONMENT', 'production');
  vi.stubEnv('TRAINING_AUTH_MODE', 'local_password');
  vi.stubEnv('TRAINING_INSTALL_MODE', 'hosted');
  vi.stubEnv('APP_ORIGIN', 'http://127.0.0.1:3100');
  vi.stubEnv('DATABASE_URL', 'postgresql://operator:private@127.0.0.1:5432/designated');
  vi.stubEnv('TRAINING_LOCAL_PRODUCTION', 'true');
  vi.stubEnv('TRAINING_LOCAL_PRODUCTION_DATABASE', 'designated');
  vi.stubEnv('MOCK_IDENTITY_ENABLED', 'false');
});
afterEach(() => vi.unstubAllEnvs());
it('permits only an explicit local production database and password profile', () => {
  expect(productionBootstrapProfile('local')).toBe('http://127.0.0.1:3100');
  for (const [key, value] of [
    ['NODE_ENV', 'development'],
    ['TRAINING_ENVIRONMENT', 'test'],
    ['TRAINING_AUTH_MODE', 'mock'],
    ['TRAINING_LOCAL_PRODUCTION', 'false'],
    ['TRAINING_LOCAL_PRODUCTION_DATABASE', 'another'],
    ['MOCK_IDENTITY_ENABLED', 'true'],
    ['APP_ORIGIN', 'http://remote.example.test:3100'],
    ['APP_ORIGIN', 'http://localhost:3100/path'],
    ['APP_ORIGIN', 'http://user:pass@localhost:3100'],
    ['DATABASE_URL', 'postgresql://operator:private@remote.example.test/designated'],
    ['DATABASE_URL', 'postgresql://operator:private@localhost/designated?host=remote.example.test'],
    ['DATABASE_URL', 'postgresql://operator:private@localhost/another'],
  ] as const) {
    const original = process.env[key];
    vi.stubEnv(key, value);
    expect(() => productionBootstrapProfile('local'), key).toThrow();
    vi.stubEnv(key, original);
  }
});
it('does not use the local flag to relax the hosted HTTPS requirement', () => {
  expect(() => productionBootstrapProfile('hosted')).toThrow();
  vi.stubEnv('APP_ORIGIN', 'https://hosted.example.test');
  expect(() => productionBootstrapProfile('hosted')).toThrow();
  vi.stubEnv('TRAINING_LOCAL_PRODUCTION', 'false');
  expect(productionBootstrapProfile('hosted')).toBe('https://hosted.example.test');
  vi.stubEnv('TRAINING_INSTALL_MODE', 'local');
  expect(() => productionBootstrapProfile('hosted')).toThrow();
});
it('requires loopback transport and refuses rebinding and forged forwarding chains', () => {
  const valid = {
    address: '127.0.0.1',
    host: '127.0.0.1:3101',
    forwardedHost: 'localhost:3100',
    forwardedFor: '::1, ::ffff:127.0.0.1',
  };
  expect(localProductionRequest(valid)).toBe(true);
  for (const invalid of [
    { address: '192.0.2.5' },
    { address: undefined },
    { host: 'outside.example.test' },
    { host: 'localhost:3100@outside.example.test' },
    { host: 'localhost:3100/path' },
    { host: 'localhost, outside.example.test' },
    { host: undefined },
    { forwardedHost: 'outside.example.test' },
    { forwardedFor: '192.0.2.5' },
    { forwardedFor: '127.0.0.1,192.0.2.5' },
    { forwardedFor: '' },
  ])
    expect(localProductionRequest({ ...valid, ...invalid }), JSON.stringify(invalid)).toBe(false);
});
