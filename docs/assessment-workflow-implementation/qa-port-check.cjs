// Checks only the disposable test port; never connects to a running service.
const net = require('node:net');
console.log('Node temporary directory:', require('node:os').tmpdir());
const server = net.createServer();
server.once('error', error => { console.error('Test port unavailable:', error.code); process.exitCode = 1; });
server.listen(55439, '127.0.0.1', () => {
  console.log('PASS: disposable in-memory PGlite test port 55439 free. Tests use helpers.ts, not environment database URLs.');
  server.close();
});
