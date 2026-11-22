import net from 'node:net';
import path from 'node:path';
const root = path.resolve('.');
if (!root.replaceAll('\\', '/').endsWith('/.worktrees/loading-animation'))
  throw new Error('Run only in isolated loading-animation worktree');
for (const port of process.argv.slice(2).map(Number)) {
  if (!Number.isInteger(port) || [3100, 3101].includes(port))
    throw new Error('Invalid or protected app port');
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  console.log(`Verified free isolated port ${port}`);
}
console.log('Isolated storage root: ' + path.join(root, '.runtime/expanded-real-api'));
