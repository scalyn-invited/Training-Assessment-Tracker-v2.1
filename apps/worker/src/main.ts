import { DomainError } from '../../../packages/domain/src/errors.js';
import { FoundationChecks } from '../../../packages/domain/src/foundation-checks.js';
import { Operations } from '../../../packages/domain/src/operations.js';
import { Promotions } from '../../../packages/domain/src/promotions.js';
import { LearningNotices } from '../../../packages/domain/src/learning-notices.js';
import { LearningSupport } from '../../../packages/domain/src/learning-support.js';
import { LearningGrading } from '../../../packages/domain/src/learning-grading.js';
import { Delivery } from '../../../packages/domain/src/delivery.js';
import { ProgrammeGeneration } from '../../../packages/domain/src/programme-generation.js';
import { LearningPlans } from '../../../packages/domain/src/learning-plans.js';
import { Onboarding } from '../../../packages/domain/src/onboarding.js';
import { DocumentExtractions } from '../../../packages/domain/src/document-extractions.js';
import 'dotenv/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { Database } from '../../../packages/database/src/database.js';
import { claim, finish } from '../../../packages/domain/src/outbox.js';
import { Auth } from '../../../packages/domain/src/auth.js';
import { encryptionKey } from '../../../packages/domain/src/crypto.js';
import { AssessmentDefinitions } from '../../../packages/domain/src/assessment-definitions.js';
import { AssessmentAssignments } from '../../../packages/domain/src/assessment-assignments.js';
import { EvidenceFiles } from '../../../packages/domain/src/evidence-files.js';
import { AiRegistry } from '../../../packages/domain/src/ai-registry.js';
import { AiGateway } from '../../../packages/domain/src/ai-gateway.js';
import { AssessmentAnalysis } from '../../../packages/domain/src/assessment-analysis.js';
import { AssessmentResponses } from '../../../packages/domain/src/assessment-responses.js';
import { AssessmentReviews } from '../../../packages/domain/src/assessment-reviews.js';
import { AssessmentMedia } from '../../../packages/domain/src/assessment-media.js';
const db = new Database();
const key = await encryptionKey();
const media = new AssessmentMedia(new AssessmentDefinitions(new Auth(db, key), key));
const assignments = new AssessmentAssignments(media.definitions);
const foundationChecks = new FoundationChecks(assignments.enrolments);
const promotions = new Promotions(media.definitions.auth, key);
const evidence = new EvidenceFiles(assignments.enrolments);
const operations = new Operations(evidence);
const notices = new LearningNotices(assignments.enrolments);
const aiGateway = new AiGateway(new AiRegistry(assignments.enrolments), key);
const reviews = new AssessmentReviews(new AssessmentResponses(assignments));
new AssessmentAnalysis(reviews, aiGateway);
const learningPlans = new LearningPlans(new Onboarding(assignments.enrolments, key));
new ProgrammeGeneration(learningPlans, aiGateway);
new LearningGrading(new Delivery(learningPlans), aiGateway);
new LearningSupport(new Delivery(learningPlans), aiGateway);
const extractions = new DocumentExtractions(reviews);
let nextRules = 0;
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
    if (Date.now() >= nextRules) {
      await foundationChecks.recover();
      await notices.recover();
      await promotions.recover();
      await extractions.recover();
      await aiGateway.recover();
      await assignments.recover();
      await evidence.recover();
      nextRules = Date.now() + 60000;
    }
    await db.pool.query(
      "INSERT INTO worker_heartbeats(id) VALUES('default') ON CONFLICT(id) DO UPDATE SET last_seen_at=now()",
    );
    await operations.heartbeat('worker');
    const job = await claim(db);
    if (job) {
      try {
        if (job.kind === 'foundation.check') {
          await foundationChecks.process(job);
        } else if (job.kind === 'person.promote') {
          await promotions.process(job);
          await finish(db, job, 'done');
        } else if (job.kind === 'learning.notice') {
          await notices.process(job);
          await finish(db, job, 'done');
        } else if (job.kind === 'document.extract') {
          await extractions.process(job);
          await finish(db, job, 'done');
        } else if (job.kind === 'ai.task') {
          await aiGateway.process(job);
          await finish(db, job, 'done');
        } else if (job.kind === 'assessment.image.scan') {
          await media.process(job);
          await finish(db, job, 'done');
        } else if (job.kind === 'evidence.scan') {
          await evidence.process(job);
          await finish(db, job, 'done');
        } else await finish(db, job, 'failed', 'unregistered_job_kind');
      } catch (error) {
        const code =
          error instanceof DomainError
            ? error.code
            : error &&
                typeof error === 'object' &&
                'code' in error &&
                typeof error.code === 'string' &&
                /^[0-9A-Z]{5}$/.test(error.code)
              ? error.code
              : 'handler_failed';
        if (job.kind === 'foundation.check') await foundationChecks.retry(job).catch(() => {});
        else await finish(db, job, 'failed', code).catch(() => {});
      }
    } else await sleep(1000);
  }
} finally {
  await db.close();
}
