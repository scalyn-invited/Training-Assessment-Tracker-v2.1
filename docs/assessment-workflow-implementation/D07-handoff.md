# D07 member-safe return guidance

## Contract and implementation
`POST /api/assessments/reviews/:id` accepts optional `return_feedback` (trimmed string, 8–4000 UTF-16 code units); valid only for rejection. The web rejection path requires it with inline validation before any POST. Omission remains supported for existing API/domain callers and historic decisions, preserving existing contracts. No private rationale or rubric criterion feedback is reused as return feedback.

Migration0032 adds nullable encrypted `assessment_reviews.return_feedback`, restricted to rejected decisions. Existing immutable-review trigger/RLS remain. No historical backfill. `read` adds `returned:{attemptId,decisionId,returnedAt,feedback}|null`, bound to latest decision on current attempt and only member/current reviewer authority. It survives revision of the draft but disappears when a new immutable attempt exists. No grade/result/private history is released. UI presents guidance and explains resubmission versus open-appeal pause; missing evidence/zero/null scoring rules unchanged.

## Real evidence
- Domain RED: two intended failures (missing returned projection, accepted invalid explicit feedback); legacy omission test passed.
- Domain GREEN: full assessment-reviews suite passes, including encrypted storage, immutable feedback, returned draft/new attempt, private rationale exclusion and existing team/teamless appeal, exact grant closure/no revival, authority/stale checks.
- Browser RED: missing required feedback validation and missing learner guidance. GREEN full component suite, plus server/web typecheck, exit0.
- Commands: `node node_modules/vitest/vitest.mjs run tests/assessment-reviews.test.ts --hookTimeout=180000` (RED `-t D07`); `node node_modules/playwright/cli.js test -c playwright.workflow-qa.config.ts` (RED `-g D07`); `npm run typecheck`.
- Logs D07-domain-red, D07-domain-green, D07-domain-contained, D07-browser-red/green and D07-typecheck.

## Isolation disclosure
RED and final full domain run explicitly exported TEMP/TMP/TMPDIR to worktree `.runtime/qa-temp` and checked actual Node temp directory/free55439 before writes. The intermediate GREEN command incorrectly assumed the prior terminal export persisted: actual preflight printed Windows user Temp, and the synthetic review-file fixture ran there and cleaned its own directory in afterAll. This was detected and the entire suite rerun with explicit exports (`D07-domain-contained.log`), not concealed or called contained. No existing/private files accessed. Future calls must set all three variables in the same invocation. Migration exercised only fresh disposable PGlite; PostgreSQL upgrade/RLS qualification and authenticated HTTP integration remain downstream QA. No live email/AI/scanner or protected service used.
