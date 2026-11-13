import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { access } from 'node:fs/promises';
import path from 'node:path';
await access(path.resolve('apps/web/.next/BUILD_ID'));
const origin = 'http://127.0.0.1:3180';
for (const mode of ['local_password', 'mock']) {
  const child = spawn(process.execPath, [path.resolve('node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3180'], {
    cwd: path.resolve('apps/web'), env: { ...process.env, NODE_ENV: 'production', TRAINING_AUTH_MODE: mode, NEXT_TELEMETRY_DISABLED: '1' }, stdio: 'ignore', windowsHide: true,
  });
  let failed = false; child.once('error', () => { failed = true; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (failed || child.exitCode !== null) throw new Error('Isolated web header server exited before readiness.');
      try { const r = await fetch(origin + '/login', { signal: AbortSignal.timeout(1000) }); if (r.ok) { ready = true; break; } } catch {}
      await sleep(250);
    }
    assert(ready, 'Production web server must become ready');
    const ids = new Set<string>();
    for (const route of ['/login', '/account/link', '/account/security', '/accounts', '/setup', '/setup/local', '/setup/hosted', '/platform', '/platform/clients', '/administration', '/clients', '/missing-header-page']) {
      const response = await fetch(origin + route, { headers: { 'X-Request-ID': 'untrusted-browser-value' } });
      assert.equal(response.status, route === '/missing-header-page' ? 404 : 200, route);
      const cache = response.headers.get('cache-control') ?? '';
      assert(cache.includes('no-store') && cache.includes('private') && !cache.includes('s-maxage'), route + ' private cache policy');
      assert.equal(response.headers.get('x-frame-options'), 'DENY', route);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff', route);
      const privateRoute = ['/login', '/account/link', '/account/security', '/accounts', '/setup', '/setup/local', '/setup/hosted'].includes(route) || (mode === 'local_password' && ['/platform', '/platform/clients', '/administration'].includes(route));
      assert.equal(response.headers.get('referrer-policy'), privateRoute ? 'no-referrer' : 'same-origin', route);
      const id = response.headers.get('x-request-id') ?? '';
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      assert(!ids.has(id), 'Each response needs a fresh request ID'); ids.add(id);
      if (route === '/login') {
        const html = await response.text();
        const resource = html.match(/src="([^\"]*\/_next\/static\/[^\"]+)"/);
        assert(resource, 'Built application script must exist');
        const asset = await fetch(new URL(resource[1].replaceAll('&amp;', '&'), origin));
        assert.equal(asset.status, 200);
        assert((asset.headers.get('cache-control') ?? '').includes('immutable'), 'Public hashed assets retain immutable caching');
      }
    }
    console.log(mode + ': 12 production page/error responses passed; public hashed asset caching retained.');
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>(resolve => child.once('exit', () => resolve())); child.kill('SIGTERM'); await exited;
    }
  }
}
