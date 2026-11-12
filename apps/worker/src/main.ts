import 'dotenv/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { Database } from '../../../packages/database/src/database.js';
import { claim, finish } from '../../../packages/domain/src/outbox.js';
const db = new Database();
let stopped = false;
process.once('SIGINT', () => {
  stopped = true;
});
process.once('SIGTERM', () => {
  stopped = true;
});
console.log('Worker started; unregistered job kinds fail closed.');
try {
  while (!stopped) {
    await db.pool.query(
      "INSERT INTO worker_heartbeats(id) VALUES('default') ON CONFLICT(id) DO UPDATE SET last_seen_at=now()",
    );
    const job = await claim(db);
    if (job) {
      // Domain handlers are registered only with their own permission/revocation tests.
      await finish(db, job, 'failed', 'unregistered_job_kind');
    } else await sleep(1000);
  }
} finally {
  await db.close();
}
