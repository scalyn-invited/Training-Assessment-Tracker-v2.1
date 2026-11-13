import 'dotenv/config';
import { Database } from '../packages/database/src/database.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Enrolments } from '../packages/domain/src/enrolments.js';
import { EvidenceFiles } from '../packages/domain/src/evidence-files.js';
import { Operations } from '../packages/domain/src/operations.js';
import { encryptionKey } from '../packages/domain/src/crypto.js';
const [command, option, ...extra] = process.argv.slice(2);
const db = new Database();
try {
  const operations = new Operations(
    new EvidenceFiles(new Enrolments(new Auth(db, await encryptionKey()))),
  );
  if (extra.length) throw new Error('Unexpected operations arguments.');
  if (command === 'health' && !option) {
    const report = await operations.report();
    console.log(JSON.stringify(report, null, 2));
    if (report.stale_components.length || report.failed_jobs) process.exitCode = 1;
  } else if (command === 'heartbeat' && !option) {
    await operations.heartbeat('scheduler');
    console.log('Scheduler heartbeat recorded.');
  } else if (command === 'retention' && (!option || option === '--apply'))
    console.log(JSON.stringify(await operations.retain(option === '--apply')));
  else if (command === 'reapply-deletions' && !option)
    console.log('Private objects removed: ' + (await operations.reapplyDeletions()));
  else if (command === 'ai-prune' && !option)
    console.log('Terminal AI traces pruned: ' + (await operations.pruneAi()));
  else
    throw new Error(
      'Usage: npm run operations -- health | heartbeat | retention [--apply] | reapply-deletions | ai-prune',
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Operations command failed.');
  process.exitCode = 1;
} finally {
  await db.close();
}
