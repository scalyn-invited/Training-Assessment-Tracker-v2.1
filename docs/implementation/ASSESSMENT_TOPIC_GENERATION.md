# Topic proposal generation — bounded synthetic fallback

## Missing-route admission recovery — 24 November 2026

The owner's `Cannot POST /assessments/proposals/topic` was an old running API, not an absent source route. The controller also misclassified this definite first missing-route response as uncertain admission, locking fields and offering an unhelpful same-key retry. Only a 404 with the exact route-not-found message now clears a previously unambiguous admission and gives API unavailable/current-version restart guidance. Generic 404s remain conservative. A prior lost response remains uncertain even after a later missing-route 404 or 503: the original key and options stay locked for explicit recovery. No automatic retry, budget/permission change or provider integration.

TDD and current-modal verification (isolated 3110/3111, disposable storage):
- RED: `npx playwright test --config playwright.assessment-topic.config.ts --output output/topic-route-red` failed at the missing-route guidance assertion, showing the original raw `Cannot POST` message. `.runtime/topic-route-red.log`.
- GREEN: first-request regression plus existing real synthetic generation journey passed; `.runtime/topic-route-green.log`.
- Final expanded journey: `npx playwright test --config playwright.assessment-topic.config.ts --output output/topic-route-final` — **1 passed (2.0m)**; `.runtime/topic-route-final.log`. Checks editable first-404 fields, no same-key retry, modal close/reopen and clear with no extra admission; real admission/worker completion followed by deliberately dropped response; injected later 404 then 503 with identical retained payloads; explicit successful receipt replay and Refresh. Existing permission/Origin/CSRF checks, separate rubric confirmation, real Save/readback/reload, private-answer exclusion, modal keyboard/focus/responsive and axe checks pass. Failure responses are browser interceptions; successful generation, persistence and permission checks use the real isolated API.
- `npm run typecheck` — server and web pass; `.runtime/topic-route-types.log`.
- `npx vitest run tests/assessment-topic.test.ts tests/assessment-topic-contract.test.ts tests/assessment-proposals.test.ts tests/assessment-definitions.test.ts` — **40 passed**, four files, 28.55s; `.runtime/topic-route-domain.log`.
- `git diff --check` passes with pre-existing CRLF warnings. Startup readiness connection refusals were transient; the test completed.

Focused source changes: `topic-generation.js`, `tests/assessment-topic-browser/topic.spec.ts`, and this record. Existing Designer/Frontend modal implementation and other dirty work preserved. No new schema or provider work, commit, push or human acceptance.

Separate owner-runtime evidence reported and verified by the parent agent (not performed by this isolated-test subagent): user continuation authorized the previously explicit restart/migration and local simulated cap request. Parent added only `AI_AUTHORING_LIMIT_MICRO_USD=1000000` and `AI_AUTHORING_CALL_LIMIT=20` to ignored `.env` (previously absent), stopped the identified stale runtime and restarted `npm run dev`. Live readiness returned 200; the identical empty-body POST through 3100 now returns **422 validation**, replacing the original **404 Cannot POST**. Exact `schema_migrations` metadata contains `0034_assessment_authoring.sql`. This establishes current route/migration availability, not a successful owner generation or real AI capability. No manual customer-record edit or real provider enablement was reported. The local synthetic settings do not select production allowance/reset policy.

## Modal UI follow-up — frontend only

The owner-requested Questions screen now opens **Generate questions** in the shared React Dialog through the same adapter/pattern as JSON import. Designer/Frontend agreed to keep-on-close before implementation. Persistent imperative controller state is unchanged by closing: no network call/cancellation, no discard and no automatic reopening when responses arrive. Footer explicitly explains server work is not cancelled. The shared guard includes retained inputs/requests/reviews. Explicit cancellation/clear confirms first; completed proposals use **Clear generation preview**, not a server-cancellation claim. Ambiguous cancellation accounting remains governed by the existing controller/API, not a new UI policy.

Source copy prominently says **Synthetic test only — not AI generation**, fixed Cedar workshop safety, five mixed English questions and difficulty recorded but not simulated. Paid API/Codex and document generation remain unavailable. Action-specific pending labels and truthful error/recovery status replace generic Working; complete receipt without proposals explicitly instructs Refresh and leaves that action available. No count selector, API payload, auto-poll/retry, model call or budget-rule change was introduced.

Final `npx playwright test --config playwright.assessment-topic.config.ts --output output/assessment-modal-topic`: **1 passed (1.9m)**. Preserves the real delayed/lost admission receipt case and identical-key explicit retry, receipt-only complete result, zero automatic status requests, explicit Refresh retrieving proposals, private keys/open-answer exclusion, separate rubric confirmation and save/reload. Adds Close/Escape/focus return, backdrop retention, input/selection/applied tracking across reopening, complete response while hidden, confirmed clear without undoing applied assessment changes, separate persistent source previews, 1440/390/320px modal bounds/internal scrolling and axe. Parent inspected generated screenshots; no human acceptance is claimed.

Import/builder/component/type/build/domain commands, screenshot paths, changed files and execution limitations are recorded in the modal follow-up at the top of `ASSESSMENT_JSON_IMPORT.md`. No backend, gateway or migration changes in this UI task. All earlier uncommitted topic/import implementation is retained. Status: locally verified, submitted for review; no commit/push/deployment or overall feature acceptance.

Status: implemented local deterministic qualification slice on `feat/ai-import-assessment-generation`; actual AI topic generation remains disabled. Independent review and human acceptance are not claimed. Existing JSON-import work and owner Next metadata were preserved. No commit, push, deployment, owner 3100/3101 restart, owner environment/database access or paid/provider call.

## Resolved owner policy

The owner approved BOTH decisions: one shared assessment-authoring allowance per client/workspace and environment, distinct from learner programme budgets, and a separately configured cap under the existing organisation cap. Unsaved drafts never manufacture enrolments or reset an allowance. Numeric production caps remain unapproved/unconfigured; both authoring configuration defaults are zero.

- `AI_AUTHORING_LIMIT_MICRO_USD`: separately configured authoring ledger ceiling, default 0; the existing organisation ceiling still applies. For the only enabled deterministic mock, this is simulated accounting at the existing synthetic-ledger-v1 rates, not actual dollars.
- `AI_AUTHORING_CALL_LIMIT`: default 0. Its current lifetime admission counting per client/environment, including cancelled/failed runs consuming a slot, is a conservative **QA-only configuration detail**, NOT an owner-approved production/product policy. The owner approved the separate shared authoring allowance, not this lifetime/reset/cancellation/failure accounting policy. No production policy is selected or redesigned here. The local browser fixture explicitly sets 1,000,000 simulated micro-USD and 20 admissions in an isolated database; these are QA settings, not production authorization. Production remains disabled pending explicit policy/provider decisions.
- Existing enrolment programme limits, reservations and task retry policies are unchanged. Authoring pins one call, no repairs and no fallback. One queued/running/ambiguous authoring request per client/environment is enforced under the organisation lock and by a partial unique index. The existing all-task one-running-provider-call index and provider locks remain.

## Implemented boundary

Migration `0034_assessment_authoring.sql` adds the explicit `assessment_authoring` scope, retains all existing enrolment/actor foreign keys and RLS, adds direct organisation/environment foreign keys, and requires exactly an enrolment scope with non-null enrolment or the dedicated authoring task with null enrolment/programme/result identities. Existing rows default to enrolment scope.

`AssessmentTopicGeneration` registers with the existing durable gateway/outbox. Admission, worker dispatch, receipt and result reads recheck active actor, client availability and coordinator membership; a current permission-version-matching selected-client session must exist. Reads are requesting-actor-only. Input and validated block output remain encrypted. Task/schema/prompt versions are pinned. The service never writes an assessment definition.

Strict request: topic 3–500 plain-text characters, count 2–30 (default 5), difficulty easy/medium/hard (default medium), English and mixed MCQ/open response only. Unknown fields are rejected. The enabled mock accepts ONLY the exact fixed `Cedar workshop safety` fixture; caller-supplied synthetic flags or arbitrary real topic text cannot enable it. Difficulty is stored but mock content does not simulate difficulty; the UI says so.

Output must satisfy `assessment-proposals-v1`, exact count, both types, a valid key for every MCQ, preview-only guidance for every open response and a non-null assessment-wide rubric. Invalid results fail without repair/retry. Queued cancellation is durable; cancellation after dispatch becomes ambiguous, retains reservations and blocks a new authoring request until reconciliation. Late completion cannot restore a cancelled/ambiguous result.

API routes (web `/api` prefix):
- POST `/assessments/proposals/topic`: strict `{csrf,clientId,idempotency,options}`.
- POST `/assessments/proposals/topic/status`: strict `{csrf,clientId,id}`.
- POST `/assessments/proposals/topic/cancel`: strict `{csrf,clientId,id}`.

All use existing Origin/session/CSRF enforcement. Public responses never expose encrypted inputs, configuration or credentials. The status response explicitly identifies deterministic mock/simulated accounting.

Builder Questions contains a semantic optional panel with topic/difficulty and explicit Generate, Refresh status, Cancel/clear controls. Refresh never dispatches a new call. Lost admission responses retain the same key/options for explicit replay; definite first-request 4xx rejection unlocks correction. No automatic network retries or timers. Shared work guards include admission, preview and in-flight requests. Shared `renderProposalPreview` and application callbacks preserve fresh IDs, section-at-apply semantics, initial blank question, capacity, independent confirmed rubric replacement, preview-only suggested answers and explicit Save/Publish.

## Codex qualification outcome — NOT enabled

Executed installed CLI `--version` (0.171.0), `login status` (ChatGPT), `exec --help`, and `features list`. The attempted `features list --ignore-user-config` was rejected; plain `features list` succeeded and printed capability flags only. No auth file/token was read/copied and no model call was made in this slice.

Official references inspected:
- https://developers.openai.com/codex/auth
- https://developers.openai.com/codex/noninteractive
- https://developers.openai.com/codex/config-reference

CLI read-only/ephemeral/ignore-user-config/strict-config flags are not a verified no-tools boundary. Current installed catalog includes enabled shell, unified exec, browser/computer use, connectors, plugins, images, skills, memories and unbounded connection retries. Reference documentation says user opt-outs for unified execution are ignored and managed requirements can disable resumable processes while leaving one-shot execution. Turning off a few candidate flags is not proof that every read/command/connector capability is absent. We did not alter host-managed policy, intercept authentication or expose a partially qualified adapter. Therefore the explicitly authorized fallback was used: deterministic mock only, no Codex application provider and no real five-question subscription qualification claimed. The earlier parent's standalone successful probe remains separate evidence, not evidence of safe application integration. Subscription monetary cost is unknown/subscription-based, never zero or the mock price.

## Executed evidence

TDD: contract RED missing function → GREEN; incomplete-output test RED accepting a truncated result → GREEN; real service RED missing class → GREEN; queued cancellation RED missing method → GREEN. API browser RED 404 instead of author denial → route implemented; UI RED absent topic controls → GREEN. A test guessed a Questions button instead of the existing data-section control; fixed the test, not the UI. Self-review reproduced rejected-topic fields remaining locked (RED) and corrected definite rejection versus uncertain replay handling. Database review reproduced orphan authoring insertion (RED); direct organisation/environment foreign keys fixed it.

Executed checks:
```
npx vitest run tests/assessment-topic.test.ts tests/assessment-topic-contract.test.ts tests/programme-generation.test.ts tests/programme-generation-contract.test.ts tests/assessment-proposals.test.ts tests/assessment-definitions.test.ts tests/learning-grading-ai.test.ts tests/ai-live-providers.test.ts
npx tsx scripts/postgres-local.ts tests/assessment-topic.test.ts
npx playwright test --config playwright.assessment-topic.config.ts
npx playwright test --config playwright.assessment-import.config.ts
npx tsc --noEmit -p tsconfig.server.json
npm run typecheck --workspace=@tracker/web
npx tsc -p tsconfig.server.json --outDir .runtime/topic-server-build
```

Eight-file regression checkpoint: 90 tests passed, 72.50s (before the final additional selected-client-loss test). PostgreSQL checkpoint: 8 tests passed with isolated real PostgreSQL, including concurrent admission, tenant RLS, scope check, orphan-client denial, distinct caps, idempotency, invalid-output no retry and ambiguous reservation. Final selected-client-loss regression is recorded below after rerun. Its first test fixture incorrectly assumed the coordinator belonged to two clients; the fixture now clears selected-client context in the isolated test DB and restores it through the real tenancy API.

Final expanded topic browser: 1 passed, 54.1s overall. Covers admin-only denial, coordinator request, Origin/CSRF rejection, arbitrary-topic rejection/correction, hard difficulty, durable status and five proposals, no definition writes before Save, append preserving initial blank, separate rubric dismiss/confirm, saved MCQ keys, exclusion of suggested answers and reload. 1440/390/320px horizontal overflow and axe A/AA pass. Screenshot `output/playwright/assessment-topic-mobile.png` inspected full/cropped: controls wrap; inherited sticky builder heading overlays part of the long full-page capture (not a new layout). JSON-import regression: 1 passed, 43.5s overall. Browser uses existing isolated PGlite/storage on 3110/3111, not owner runtime; expected readiness connection refusals occur during startup.

Server typecheck/isolated compilation and web typecheck passed. Production Next build passed (28 pages) at `.next-topic-build`; scratch wrapper captured/restored exact `next-env.d.ts` and `tsconfig.json` bytes, preservation verified True. No artifacts were copied into owner runtime. PGlite/browser tests do not substitute for the separately executed PostgreSQL qualification.

Final rerun after all fixes: eight regression files, **91 tests passed** (70.78s); isolated real PostgreSQL **9 tests passed** (3.30s overall), adding selected-client-loss rejection before dispatch/read with zero provider calls. Topic browser **1 passed** (53.6s), JSON import **1 passed** (46.8s), unchanged builder/publication/recovery **1 passed** (1.5 minutes). Simultaneous topic+JSON previews exposed a duplicate fixed heading ID; RED reproduced and the unused ID was removed, preserving focus and both previews. Server/web typechecks and diff check pass; only existing CRLF normalization warnings remain. New domain/UI modules were scanned for eval/exec, shell spawning, direct fetch, debug logs, innerHTML and automatic timers; no matches. Self-review is not independent review.

Changed in this follow-on: gateway/registry/mock provider, programme receiver's explicit enrolment assertion, API/worker wiring, builder shared callbacks and proposal heading, PostgreSQL suite allowlist, DESIGN/checklist/import policy history. Added: migration 0034, assessment-topic contract/service, topic UI, contract/domain/browser tests and Playwright config, and this record. Prior JSON files/Next metadata remain uncommitted and preserved.

## Independent-review blocker correction — receipt-only completion

Root cause: admission/replay returns only `{id,status}`, including after worker completion; the UI previously disabled Refresh for every complete receipt, leaving no way to retrieve the proposal after a lost admission response. Refresh now remains enabled for complete receipts without a proposal. It still disables while pending, for cancelled/failed/ambiguous states, and after completed proposal retrieval. No automatic retry, polling, model request or policy redesign was added.

Exact real-API regression extends `tests/assessment-topic-browser/topic.spec.ts`: forward admission to the isolated API, hold its response while the real synthetic worker completes (test-side API status polling), then abort browser delivery. Explicit Retry sends the identical payload/key and receives the actual `{id,status:'complete'}` receipt without a proposal. Assert zero browser status requests before explicit Refresh; that one click retrieves the five proposals, disables Refresh, and leaves admission count at two. Existing explicit append/rubric/save/readback/reload/privacy, responsive and axe checks continue in the same journey.

Executed evidence for this correction:
- RED: `npx playwright test --config playwright.assessment-topic.config.ts` failed exactly at Refresh `toBeEnabled`: received disabled after complete receipt replay. Log: `.runtime/topic-review-red.log`.
- GREEN: same command, **1 passed (55.3s)**. Log: `.runtime/topic-review-green.log`.
- Targeted eight-file domain command listed above: **91 passed (74.71s)**. Log: `.runtime/topic-review-domain.log`.
- JSON-import browser command listed above: **1 passed (45.9s)**. Log: `.runtime/topic-review-import.log`.
- `npm run typecheck`: server and web passed. Log: `.runtime/topic-review-types.log`.
- `git diff --check` passed (existing CRLF normalization warnings only); `npm run verify:baseline`: all **366** captured source hashes unchanged.

Branch remains `feat/ai-import-assessment-generation`. Task-baseline SHA-256 comparison found only the four intended repository files changed: topic UI, topic browser test, this record and FEATURE_CHECKLIST. Prior JSON/topic work and exact Next metadata bytes were preserved. Browser startup readiness connection refusals were transient; both runs completed. No owner `.env` or 3100/3101 changes, commits, pushes, provider calls or document-source implementation. No new PostgreSQL/build qualification or feature-complete/human-acceptance claim. Production and automatic Codex remain disabled pending policy/provider decisions.

## Handoff

Independent review is required before calling this slice complete. The app is deliberately NOT a general AI generator: fixed local mock is the only enabled provider. Numeric production caps and a fully qualified model/process isolation boundary are still required for actual AI. No unknown subscription dollars are booked in the micro-USD ledger.

Next document slice: bounded PDF/DOCX/TXT scan-clean/hash-verified extraction, source classification and encrypted provenance, with explicit extraction review before any external submission. Do not read customer files, enable live providers, bypass scanning or persist open-response suggested answers. Reuse the shared proposal contract/review; private open-answer storage is a separate design decision.
