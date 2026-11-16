# Validated workflow safeguards — backend implementation handoff

## Status and exact candidate

**Implementation stage complete; release existing independent QA child `t_a93de53c`. Not merged, deployed, independently accepted or owner accepted.** Parent consumed: `79f8cee43fea1c5c160a0c94bc202931e8ae031b` and its QA-prerequisites-handoff.md. Branch `feature/assessment-workflow-improvements`, isolated `tat-assessment-workflow` only; sibling D05 commit preserved. Tested code commit: `71d9a0bf06d979930a996eced387f9559a71ccb4`. The following handoff-only commit adds this report and latest integrated screenshot; use the final Kanban commit for checkout.

## Acceptance / D01–D08 disposition

| Item | Implemented or explicitly deferred | Evidence |
|---|---|---|
| D01 | Shared page-memory dirty/pending/uncertain guard for author, learner and reviewer work. Context/logout asks before POST; Stay sends zero mutation. Literal links, Chromium history, real Next sidebar, reload/unload; clean and accepted-leave controls. Unknown/stale reviewer writes stop and retained values survive readback. Confirmed file/review receipts clear only confirmed baselines. | D01 RED/GREEN logs, D01-final-followup.md; FINAL-browser.log and FINAL-next.log. |
| D02 | **Policy-deferred, not fixed.** Teamless open-appeal dead-end remains reproduced by real domain test. No invented roles/team, admin override or permission broadening. | QA-prerequisites-handoff.md D02; final 40-test domain run still includes reproduction. |
| D03 | Unknown publication no longer claims definitive failure. Exact-ID/client readback distinguishes published/draft/denied/unavailable; no blind publication retry. 409 stops draft writes; private local structured content retained with explicit authorized comparison. Unknown save replays same operation before newer typing. | D03-handoff.md; RED and GREEN logs; four readback states, conflict and replay browser assertions. |
| D04 | Persistent non-recording preview scope, saved revision versus current unsaved content, common section/question references from full pinned question order. No keys or private rubric released. | D04-handoff.md; initial RED/GREEN and final reordered-current versus historical-pinned renderer check. |
| D05 | Preserved upstream approved/pending/earlier-approved-new-current copy and permissions; no new feature. | All three desktop/375px component checks pass again; implementation-screenshots/D05-*. |
| D06 | **New queue deferred.** Existing exact-ID Assign assessment handoff verified; no evidence warrants new queue/authority/counts. | D06 browser assertion and existing assignment domain regressions. |
| D07 | Distinct explicitly member-safe rejection guidance, separately encrypted/immutable/current-attempt-bound. Member sees changes requested without private rationale, history or released grade; revised draft retains guidance, new immutable attempt removes old guidance. | D07-handoff.md; domain/browser RED/GREEN and full final suites. |
| D08 | New copies persist immutable direct source definition ID/publication revision; builder shows new draft ID/revision versus edit version, source and unchanged assignment/team pins, including reload. No inferred legacy parent. | D08-handoff.md; domain/browser RED/GREEN, copy-save replay and 375px layout regression. |

### D02 decision required from orchestrator/owner

Specify eligible teamless alternates and exact case-scoped live/revocable authority record, grantor, distinct sensitive-access requirements, expiry/revocation/closure semantics and explicit recovery/rerouting of already-open cases. Must exclude learner/prior reviewer/router, bind exact case/attempt/evidence, deny unrelated training/files, and prevent grant revival. Preserve learner edit pause during appeal. This was expressly deferred in the approved prerequisite handoff; do not block independent testing of the implemented work or treat D02 as solved.

## Local implementation commits

- `3a019092d575935878322643089d74672c420822` — D01 navigation/context/reviewer safeguards.
- `a0d6e0c7b301be517623be639d22e5ffc6123be4` — D03 exact publication reconciliation/conflict stop.
- `b447bb27ff8061cd096e81f6cc64e14c0b312ada` — D04 preview/reference clarity.
- `ce514c7a53c2db5c78ebc5a19d8e514e1e7f39f4` — D07 distinct member-safe return guidance.
- `93158a63774c342cd04bf7f14a58d0d78526ca55` — D08 immutable direct copy provenance.
- `71d9a0bf06d979930a996eced387f9559a71ccb4` — D01 learner integration/confirmed clean-state recovery and consolidated regressions.

Each bounded production behavior has genuine failing desired-contract evidence before its implementation. Initial harness startup/env-detection/timing failures remain in logs but are not counted as product RED evidence. D01 follow-up REDs separately establish confirmed-receipt dirty-state and learner context ordering defects. Additional post-implementation reorder/replay/layout checks are regression coverage, not represented as new RED cycles.

## Files and contracts

Production:
- `apps/web/app/components/{work-guard.ts,use-work-guard.ts,app-shell.tsx}`.
- `apps/web/app/components/assessment-builder/{builder.js,builder.d.ts}`.
- `apps/web/app/components/{assessment-review.tsx,assessment-response.tsx,response-questions.tsx,question-reference.ts}`.
- `apps/api/src/main.ts` (optional return-feedback parsing/pass-through; unrelated diff hunks are formatter-only).
- `packages/domain/src/{assessment-reviews.ts,assessment-definitions.ts}`.
- `packages/database/migrations/0032_assessment_return_feedback.sql` and `0033_assessment_copy_source.sql`.

Tests/runtime:
- `tests/assessment-{definitions,reviews}.test.ts` plus unchanged content/scoring/assignments/responses suites.
- `tests/workflow-qa-browser/{workflow.spec.ts,learner-guard.spec.ts,d05.spec.ts,next-server.cjs}`.
- `tests/workflow-next-browser/navigation.spec.ts`, `playwright.workflow-next.config.ts`.

Additive API/domain contracts:
- Review decision accepts optional `return_feedback`, trimmed 8–4000 UTF-16 code units; rejection-only. Web rejection requires it, but existing API callers omitting it remain compatible. Never fall back to private `reason`. Domain projection adds `returned: {attemptId,decisionId,returnedAt,feedback} | null`.
- Definition save/exact replay adds `revision`, `source_definition_id`, `source_revision`; existing fields unchanged. Definition GET remains author-authorized. No new source-read endpoint or expanded grants.
- Migration0032 adds nullable encrypted rejection guidance with rejection-only check, retaining existing immutable/RLS protections. No private historical data backfill.
- Migration0033 adds paired nullable direct-source fields, same-tenant/environment/source-revision FK, no-self check and immutable provenance trigger. Existing records stay null; no inferred lineage, historical edit or pin migration. Run migrations only through normal approved deployment workflow; this task applied them solely to disposable synthetic PGlite.

## Actual final execution

All from isolated workspace with installed lockfile dependencies. No installation or approval bypass in this implementation stage. Domain invocation first exported `TEMP="$HERMES_KANBAN_WORKSPACE/.runtime/qa-temp"`, `TMP` and `TMPDIR` to that same absolute path. The explicit Node temp/free-port check ran before database fixtures.

1. `node docs/assessment-workflow-implementation/qa-port-check.cjs` — exit0, worktree Node temp and free55439 verified (`FINAL-isolation.log`).
2. `node node_modules/vitest/vitest.mjs run tests/assessment-reviews.test.ts tests/assessment-definitions.test.ts tests/assessment-content.test.ts tests/assessment-scoring.test.ts tests/assessment-assignments.test.ts tests/assessment-responses.test.ts --hookTimeout=180000` — **6 files, 40 passed**, 97.02s, exit0 (`FINAL-domain.log`). Real domain/auth/tenancy/services and SQL migrations, fresh PGlite. Includes authority, private-result separation, immutable submission/copy/source, save-token replay, pinned assignments/team rules and D02 reproduction.
3. `node node_modules/playwright/cli.js test -c playwright.workflow-qa.config.ts` — **22 passed**, 34.2s, exit0 (`FINAL-browser.log`). Actual components, headless Chromium, intercepted synthetic transport. Context-order tests replace Next hook seams explicitly; they do not authenticate to a real API.
4. `node node_modules/playwright/cli.js test -c playwright.workflow-next.config.ts` — **1 passed**, 1.5m, exit0 (`FINAL-next.log`). Actual isolated Next renderer on127.0.0.1:3275, real sidebar/history lifecycle, synthetic API transport. Allowlisted environment, no copied runtime, AI/email disabled, API origin127.0.0.1:9, no API/worker/database process. Initial .env.example false-positive and hydration timing issues were corrected before the passing runs.
5. `npm run typecheck` — server plus web exit0 (`FINAL-typecheck.log`).
6. Prettier on changed TS/TSX tests/components; `git diff --cached --check -- . ':!*.log'` passed before implementation commits. Logs retain original output, hence excluded from whitespace checks.

No protected3100/3150 connection/browser interaction, live email, paid AI, real credentials, main/preview DB, native desktop, push, merge or deployment. Final tests use only synthetic fixtures and isolated storage. The parent documents its earlier Windows temp-location deviation; final contained evidence supersedes prior qualification logs. Upstream untracked tooling diagnostics/QA archive/screenshots were left intact, not staged. D05 parent screenshots were restored after reruns and subsequent output redirected to implementation-screenshots.

## Screenshots and inspection

`implementation-screenshots/` contains canceled context/reviewer work, reconciliation states, private conflict comparison, preview/references, preserved D05 states, member return guidance, and desktop/narrow copy provenance. `D01-next-canceled.png` records real Next retained author edits. Visually inspected integrated Next, member-safe guidance, copy provenance desktop and cropped375px provenance: text wraps without clipping/overlap in these samples. Not every screenshot received separate visual review. Browser assertions additionally check no375px page overflow for D05 and D08.

## Limitations / independent QA handoff

- PGlite is **not PostgreSQL RLS/concurrency/migration-lock qualification**. Fresh migrations pass; populated real-PostgreSQL deployment remains untested/unapproved.
- No full repository suite, production build, scanner/worker qualification, real authenticated browser-to-API-to-DB lifecycle, screen-reader audit, physical-device or human comprehension/owner acceptance is claimed.
- Navigation history interception uses Chromium Navigation API with native beforeunload fallback; other browser engines/version support and back-forward-cache behavior remain independent compatibility qualification, not a claimed universal guarantee.
- D04 historical/reorder coverage is renderer-level plus real domain pin regressions, not a full persisted browser reorder-to-history journey.
- Work stays in page memory. Forced tab termination/browser refusal to show a leave prompt cannot guarantee persistence. No private localStorage/sessionStorage introduced. No claim that unrelated application forms/uploads are now universally guarded.
- `ux-engine` and `playwright` skills unavailable; reported rather than pretended loaded. Actual Playwright package executed. TDD, systematic-debugging and dogfood loaded.
- D01-checkpoint.md and D04-handoff.md were intermediate records; the final logs and this disposition supersede their pending implementation checks. Broader compatibility/accessibility qualification remains explicitly bounded above.

**Next:** existing QA child independently checks final exact commit, D05 and implemented changes, desktop/narrow states, and build/full-suite where isolated support permits. Report failures to orchestrator for the existing correction loop; do not merge or infer acceptance. D02 decision belongs to orchestrator/owner; D06 remains evidence-deferred. No duplicate task or same-card review needed.
