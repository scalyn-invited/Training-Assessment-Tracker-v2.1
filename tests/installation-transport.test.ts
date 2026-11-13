import { expect, it } from 'vitest';
import { verifySetupTransport } from '../packages/domain/src/installation-transport.js';
const request = {
  encrypted: true,
  remoteAddress: '127.0.0.1',
  host: 'setup.example.test',
  origin: 'https://setup.example.test',
  method: 'POST',
};
it('requires HTTPS and exact host/origin without implicit forwarded-header trust', () => {
  expect(() => verifySetupTransport(request, 'https://setup.example.test')).not.toThrow();
  for (const change of [
    { encrypted: false },
    { host: 'other.example.test' },
    { origin: 'https://other.example.test' },
  ])
    expect(() =>
      verifySetupTransport({ ...request, ...change }, 'https://setup.example.test'),
    ).toThrow();
  expect(() =>
    verifySetupTransport(
      { ...request, encrypted: false, forwardedProto: 'https', forwardedHost: request.host },
      'https://setup.example.test',
    ),
  ).toThrow();
});
it('trusts only an explicitly configured proxy and rejects ambiguous forwarded headers', () => {
  const proxied = {
    ...request,
    encrypted: false,
    host: '127.0.0.1:3101',
    forwardedProto: 'https',
    forwardedHost: request.host,
  };
  expect(() =>
    verifySetupTransport(proxied, 'https://setup.example.test', '127.0.0.1'),
  ).not.toThrow();
  for (const change of [
    { remoteAddress: '127.0.0.2' },
    { forwardedProto: 'https,http' },
    { forwardedHost: 'setup.example.test,other.example.test' },
    { origin: 'null' },
  ])
    expect(() =>
      verifySetupTransport({ ...proxied, ...change }, 'https://setup.example.test', '127.0.0.1'),
    ).toThrow();
  expect(() =>
    verifySetupTransport(proxied, 'https://setup.example.test', 'trust-everyone'),
  ).toThrow();
});

it('keeps HTTP local setup loopback-only and checks exact origin behind its explicit local proxy', () => {
  const local = {
    encrypted: false,
    remoteAddress: '127.0.0.1',
    host: '127.0.0.1:3130',
    origin: 'http://127.0.0.1:3130',
    method: 'POST',
  };
  expect(() => verifySetupTransport(local, local.origin, undefined, 'local')).not.toThrow();
  for (const change of [
    { remoteAddress: '192.0.2.1' },
    { host: 'attacker.test:3130' },
    { origin: 'http://attacker.test' },
  ])
    expect(() =>
      verifySetupTransport({ ...local, ...change }, local.origin, undefined, 'local'),
    ).toThrow();
  expect(() =>
    verifySetupTransport(
      { ...local, host: '127.0.0.1:3131', forwardedHost: local.host },
      local.origin,
      '127.0.0.1',
      'local',
    ),
  ).not.toThrow();
  expect(() =>
    verifySetupTransport(local, 'http://remote.example.test', undefined, 'local'),
  ).toThrow();
  expect(() => verifySetupTransport(local, local.origin)).toThrow();
});
