// Isolated renderer only. No API, database, worker, .env or external adapters.
const net = require('node:net');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
for (const dir of ['.', 'apps/web']) {
  if (
    fs
      .readdirSync(dir)
      .some((name) => /^\.env(?:\.(?:local|development|production|test)(?:\.local)?)?$/.test(name))
  )
    throw Error('Refusing Next fixture with environment files');
}
const port = 3275;
const probe = net.createServer();
probe.on('error', () => {
  console.error('Isolated renderer port unavailable');
  process.exit(1);
});
probe.listen(port, '127.0.0.1', () =>
  probe.close(() => {
    const env = {};
    for (const key of [
      'PATH',
      'Path',
      'SYSTEMROOT',
      'SystemRoot',
      'COMSPEC',
      'ComSpec',
      'USERPROFILE',
      'LOCALAPPDATA',
    ])
      if (process.env[key]) env[key] = process.env[key];
    Object.assign(env, {
      TEMP: path.resolve('.runtime/qa-temp'),
      TMP: path.resolve('.runtime/qa-temp'),
      TMPDIR: path.resolve('.runtime/qa-temp'),
      NEXT_TELEMETRY_DISABLED: '1',
      API_INTERNAL_ORIGIN: 'http://127.0.0.1:9',
      AI_LIVE_ENABLED: 'false',
      SMTP_ENABLED: 'false',
    });
    const child = spawn(
      process.execPath,
      [
        require.resolve('next/dist/bin/next'),
        'dev',
        'apps/web',
        '--webpack',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(port),
      ],
      { env, stdio: 'inherit' },
    );
    child.on('exit', (code) => process.exit(code ?? 1));
    process.on('SIGTERM', () => child.kill());
    process.on('SIGINT', () => child.kill());
  }),
);
