const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const palette = (scheme) => ({
  scheme,
  background: scheme === 'dark' ? '#112233' : '#eef4fa',
  card: scheme === 'dark' ? '#223344' : '#ffffff',
  raised: '#223344',
  text: scheme === 'dark' ? '#ffffff' : '#112233',
  muted: '#8899aa',
  primary: '#88bbff',
  'on-primary': '#112233',
  focus: '#88bbff',
  hover: '#334455',
  soft: '#334455',
  line: '#8899aa',
  decorative: '#445566',
});
// Synthetic transport fixtures only. No database, authentication or permission qualification.
const api = http.createServer((req, res) => {
  const cookie = req.headers.cookie || '';
  const client = cookie.includes('tracker_session=client');
  const signedIn = client || cookie.includes('tracker_session=shared');
  res.setHeader('Content-Type', 'application/json');
  if (req.url.startsWith('/auth/context'))
    return res.end(
      JSON.stringify({
        user: signedIn
          ? {
              id: client ? 'client-user' : 'shared-user',
              environment: 'test',
              name: 'Synthetic viewer',
              global_admin: true,
            }
          : null,
        client: client ? { id: 'fixture-client', name: 'Fixture client' } : null,
        csrf: 'synthetic-only',
        installed: true,
      }),
    );
  if (req.url.startsWith('/branding/current')) {
    if (cookie.includes('brand-failure=1')) {
      res.statusCode = 503;
      return res.end('{}');
    }
    const scoped = client && !req.url.includes('shared=1');
    return res.end(
      JSON.stringify({
        displayName: scoped ? 'Fixture client' : 'Scalyn',
        appName: 'Assessment Training Tracker',
        mode: 'white-label',
        selectedTheme: scoped
          ? 'client-dark'
          : cookie.includes('default-dark=1')
            ? 'platform-dark'
            : 'light',
        logo: '/images/scalyn-opc-logo.png',
        palettes: { light: palette('light'), dark: palette('dark') },
        platformPalettes: { light: palette('light'), dark: palette('dark') },
      }),
    );
  }
  if (req.url.startsWith('/auth/sign-in-options'))
    return res.end(JSON.stringify({ mode: 'local_password' }));
  if (req.url.startsWith('/clients'))
    return res.end(JSON.stringify([{ id: 'fixture-client', name: 'Fixture client' }]));
  // Dashboard contracts: successful empty results are not an empty object.
  if (req.url.startsWith('/enrolments?'))
    return res.end(JSON.stringify({ total: 0, page: 1, records: [] }));
  if (req.url.startsWith('/jobs?')) return res.end('[]');
  res.end('{}');
});
api.listen(3281, '127.0.0.1', () => {
  const child = spawn(
    process.execPath,
    [
      path.resolve('node_modules/next/dist/bin/next'),
      process.env.FIRST_PAINT_BUILT ? 'start' : 'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3280',
    ],
    {
      cwd: path.resolve('apps/web'),
      env: {
        ...process.env,
        API_INTERNAL_ORIGIN: 'http://127.0.0.1:3281',
        NEXT_DIST_DIR: '.next-first-paint',
      },
      stdio: 'inherit',
    },
  );
  const stop = () => {
    child.kill();
    api.close();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  child.on('exit', (code) => {
    api.close();
    process.exit(code || 0);
  });
});
