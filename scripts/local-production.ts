import 'dotenv/config';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { productionBootstrapProfile } from '../packages/domain/src/production-profile.js';
import { port } from '../packages/database/src/config.js';
import { encryptionKey } from '../packages/domain/src/crypto.js';
const origin = new URL(productionBootstrapProfile('local'));
if (origin.protocol !== 'http:')
  throw new Error(
    'This loopback launcher serves HTTP. Use a separately qualified local TLS proxy for an HTTPS profile.',
  );
await encryptionKey();
const webPort = Number(origin.port || 80),
  apiPort = port('API_PORT', 3101);
if (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65535 || webPort === apiPort)
  throw new Error('Configure distinct web/API ports from 1024 to 65535.');
const apiOrigin = 'http://127.0.0.1:' + apiPort;
const manifest = JSON.parse(await readFile('apps/web/.next/routes-manifest.json', 'utf8'));
const rewrites = Array.isArray(manifest.rewrites)
  ? manifest.rewrites
  : [
      ...(manifest.rewrites?.beforeFiles ?? []),
      ...(manifest.rewrites?.afterFiles ?? []),
      ...(manifest.rewrites?.fallback ?? []),
    ];
if (
  !rewrites.some(
    (route: { source: string; destination: string }) =>
      route.source === '/api/:path*' && route.destination === apiOrigin + '/:path*',
  )
)
  throw new Error(
    'Build the web app with API_INTERNAL_ORIGIN matching the configured loopback API port before starting.',
  );
const children: ChildProcess[] = [];
let closing = false;
async function stop(code = 0) {
  if (closing) return;
  closing = true;
  await Promise.all(
    children.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) return resolve();
          child.once('exit', () => resolve());
          child.kill('SIGTERM');
          setTimeout(() => {
            child.kill('SIGKILL');
            resolve();
          }, 5000).unref();
        }),
    ),
  );
  process.exitCode = code;
}
function start(args: string[]) {
  const child = spawn(process.execPath, args, {
    windowsHide: true,
    stdio: 'inherit',
    env: { ...process.env, API_HOST: '127.0.0.1', API_INTERNAL_ORIGIN: apiOrigin },
  });
  children.push(child);
  child.once('error', () => void stop(1));
  child.once('exit', (code) => {
    if (!closing) void stop(code ?? 1);
  });
}
process.on('message', (message) => {
  if (message === 'shutdown') void stop().finally(() => process.disconnect?.());
});
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
start(['dist/apps/api/src/main.js']);
start(['dist/apps/worker/src/main.js']);
start([
  path.resolve('node_modules/next/dist/bin/next'),
  'start',
  'apps/web',
  '--hostname',
  '127.0.0.1',
  '--port',
  String(webPort),
]);
console.log(
  'Local production workspace starting at ' +
    origin.origin +
    '. No accounts or demo data are seeded on startup.',
);
