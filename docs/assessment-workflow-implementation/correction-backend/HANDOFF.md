# Backend bounded regression correction — t_1fb2b181

**Implementation stage ready for independent QA; not candidate acceptance.**

Production correction: `7cfe30212491f92c14255b0b288299acbf584695` on `feature/assessment-workflow-improvements`. Parent consumed without reset: frontend correction `35f760d44667e06e3ede9d1dd94cd61ea2ed7c61`, handoff `3b6a53e000ef715856e5d2192ac6e71e5ef9126c`. Original candidate c86aa43 remains unaccepted. Evidence-only commit follows this correction (identify with git log).

## Diagnosis, evidence and bounded fix

Read AGENTS, full FEATURE_CHECKLIST, original independent QA handoff and runner. Actual retained original log is `docs/assessment-workflow-implementation/independent-qa/domain.log`, not a nested logs directory. Original exit15 run has only completed-file summaries158pass/16fail/2skip; no full-suite result. Its four affected files contain27 tests, of which16 previously failed.

Ranked hypotheses tested: (1) excessive repeated database round trips consume the30s test budget; (2) timeout leaves shared fixture work/IDs incomplete, causing subsequent failures; (3) concurrent workload or local transport latency; (4) a domain contract regression. Serialized unchanged fresh baselines falsify a deterministic functional regression in three files: support8/8, generation9/9, KPIs4/4 pass. Plans reproduces `invalidates pending review on edit and blocks a second overlapping approval` at30034ms, exit1, with the other5 passing. Two instrumented unchanged plans reruns pass6/6, so this is timing-sensitive, not proof of a broken capacity rule.

The query-only diagnostic (no bound parameters recorded) establishes excessive SQL work: **23,286 SELECTs** in the plans file on both unchanged diagnostic runs. In diagnostic-queries, active-user checks execute4,697 times and consume20,778.56ms; available-client checks4,684 times/17,444.81ms; membership-row reads4,408 times/16,880.03ms. Existing nested authority operations repeatedly invoke the three-statement membership gate. This is measured application query overhead, not a claim that Windows or PGlite alone is defective.

Correction is deliberately small: `Access.membership` combines its existing user/identity freshness, client availability and membership predicates into **one parameterized SELECT**, returning only `cm.*`. Every invocation reads current state; **no cache, removed authorization call, changed lock, timeout increase, schema/API change or test assertion relaxation**. Existing separate active/available operations remain intact. Inner joins preserve the same gates, including production-synthetic denial, active identity, imported permission freshness, current membership dates/environment and client suspension. Historical allocation/team, primary/sensitive, approval, immutable-record, scan-state, spending and N+2 logic are untouched.

Real TDD: `membership-red` fails expected3-vs1 query count, while gate-preservation case passes; after correction both tests pass, including same-transaction revocation/recovery (no stale memoized result). Boundary test exercises inactive user, disabled identities, stale imported permission, inactive/suspended client, ended/future membership, environment mismatch, and exact five-minute freshness boundary. Existing authority regression supplements it.

Post-change diagnostic plans executes **14,470 SELECTs**, with identical existing assertions. This proves reduced work, independent of variable wall time. All27 target cases pass in two fresh complete serialized batches, unchanged30s test deadlines. Current passing requalification supersedes the failed executions for this candidate, but **does not establish the exact cause of every original shorter failure**. Original stopped run omitted final stack summaries; timeout fallout remains a hypothesis. TimeoutOverflowWarning was not reproduced in any completed focused run with `--trace-warnings`; no warning root cause or fix is claimed. Do not label all16 original failures solely infrastructure or universally cured by this optimization.

## Exact execution

Run from this worktree only. Prefix below: `node docs/assessment-workflow-implementation/correction-backend/run.cjs`. Every invocation uses a new tag/temp root; never reuse a tag. The runner rejects inherited .env files, allowlists environment, disables live AI/SMTP/account-email adapters, verifies port55439 free, and requires explicit existing test files. tests/helpers.ts creates fresh **in-memory PGlite**, with no environment-selected database or copied storage. No server/browser/worker/install was run by this stage.

| Tag / files | Actual result | Exit |
|---|---|---|
| `support-red tests/learning-support.test.ts` |8 pass; tag was chosen before execution and is NOT a RED claim|0|
| `plans-baseline tests/learning-plans.test.ts` |5 pass/1 timeout|1|
| `generation-baseline tests/programme-generation.test.ts` |9 pass|0|
| `kpis-baseline tests/learning-kpis.test.ts` |4 pass|0|
| `diagnostic-plans tests/learning-plans.test.ts` |6 pass; aggregate query timing|0|
| `diagnostic-queries tests/learning-plans.test.ts` |6 pass; static-query-template timing|0|
| `membership-red tests/access-membership.test.ts` |1 pass/1 expected query-count failure|1|
| `membership-green tests/access-membership.test.ts` |2 pass|0|
| `four-green tests/learning-support.test.ts tests/learning-plans.test.ts tests/programme-generation.test.ts tests/learning-kpis.test.ts` |27 pass;267.75s|0|
| `diagnostic-plans-green tests/learning-plans.test.ts` |6 pass; SELECT count14,470|0|
| `authority-green tests/access-membership.test.ts tests/tenancy.test.ts tests/historical-authority.test.ts tests/enrolments.test.ts tests/administration-version.test.ts tests/sandbox-identity.test.ts tests/approved-feed.test.ts` |24 pass in6 actual files; see caveat below|0|
| `assessment-green tests/assessment-reviews.test.ts tests/assessment-definitions.test.ts tests/assessment-content.test.ts tests/assessment-scoring.test.ts tests/assessment-assignments.test.ts tests/assessment-responses.test.ts` |40 pass in6 files|0|
| `learning-affected tests/onboarding.test.ts tests/delivery.test.ts tests/learning-grading.test.ts tests/learning-lifecycle.test.ts tests/mock-identity.test.ts` |27 pass in5 files|0|
| `four-confirm tests/learning-support.test.ts tests/learning-plans.test.ts tests/programme-generation.test.ts tests/learning-kpis.test.ts` |27 pass, second fresh complete batch|0|
| `membership-final tests/access-membership.test.ts` |2 pass after test formatting|0|

Each tag has actual `.log`, `.json` with every test name/duration/status, and `-isolation.log`. `results.cjs` aggregates retained JSON into `results-summary.json`, including per-test evidence and measured query totals. Counts are per execution, not a sum of unique whole-suite tests.

Caveat: `sandbox-identity.test.ts` does not exist and Vitest silently ignored that initial authority filter. Reported24/6 reflects actual discovery, not7 files. Runner now rejects nonexistent files; the actual `mock-identity.test.ts` was then included and passed in learning-affected. No missing test is represented as passed.

The first `initial-four` attempt ran the four explicit files but the outer foreground tool terminated at420s before the buffered runner emitted a result. Process inspection afterward found no owned test process. Only its successful isolation check remains; **no exit code or test totals are claimed**. Runner now streams output directly to retained files and the completed runs above are the evidence. No competing test tree was launched. A blocked inline Python diagnostic did not execute; file-based Node/retained read-only process probes supplied evidence instead.

Other commands actually executed:
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.server.json` — exit0, repeated after formatting; final empty diagnostic log `typecheck-server.log`.
- `node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json` — exit0, repeated; `typecheck-web.log`.
- `node node_modules/prettier/bin/prettier.cjs --write tests/access-membership.test.ts` — exit0; no unrelated formatting.
- `git diff --check` and staged diff check — exit0.
- `git diff 3b6a53e000ef715856e5d2192ac6e71e5ef9126c -- docs/assessment-workflow-implementation/independent-qa apps/web` — empty, exit0.
- Final `node docs/assessment-workflow-implementation/qa-port-check.cjs` — exit0/free55439. This final read-only bind probe inherited default TEMP but wrote no fixture; all actual test isolation logs show worktree-local temp roots.

## Review / QA handoff and limits

Changed production file: `packages/domain/src/access.ts` only. New regression: `tests/access-membership.test.ts`. Supporting diagnostic/harness/log/report files under this directory only. Parameterized SQL, unchanged projection/locks and no credentials/provider data added; fixture identities are fictional example.invalid accounts. Self-review is not independent review. No frontend collision: frontend and original QA evidence diff remain empty; pre-existing untracked diagnostics/archives retained.

Release pre-created independent QA child **t_98f7918e**, then existing reviewer **t_5bf8231e**. QA must freeze exact HEAD and independently rerun target files, authority boundaries and its full specified component/Next/build gates. This shared access change should receive particular authorization-predicate review; PostgreSQL RLS/concurrency is **not qualified by PGlite** and remains an explicit limitation. No production build or new browser qualification performed in this backend stage; inherited frontend evidence is not relabeled as ours.

No full-suite pass, real API/browser/database journey, real PostgreSQL concurrency, production migration, deployment, live AI/email/scanner, remote push, merge or human acceptance claim. Main3100/preview3150 were not contacted or modified. V2, main and rich-editor unchanged. D02 policy deferral and D06 queue deferral untouched. Learner initial autosave race remains the earlier unchanged passing observation, not data loss. Downstream stages must not waive a new failure or infer acceptance from this stage completion.
