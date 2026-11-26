# Assessment JSON import — first bounded AI/import slice

## Modal UI follow-up — local verification, review pending

Owner scope: frontend-only modal improvement on `feat/ai-import-assessment-generation`; retain the existing uncommitted JSON/topic baseline. A read-only Designer collaborator inspected shared Dialog/usages, design records and installed UX Engine guidance, then delivered the keep-on-close handoff. Frontend explicitly agreed before changing overlapping application files. No backend/API/schema/provider edits were made in this follow-up.

Implemented two equal entry buttons in Questions. `proposal-dialogs.tsx` is a small React island reusing `ui/dialog.tsx`, not a second dialog implementation. React owns titles/chrome/visibility and empty content slots; existing controllers own persistent hosts, validation, proposals, selected/applied tracking and the existing append/rubric callbacks. Close/Escape never clear/dispose/retry/cancel; inputs, selections and job receipts survive reopening. Actual builder data disposal invalidates late work; transient authority-host detachment closes the island without reopening it later. The existing shared work guard continues observing hidden work, including changed generation inputs.

Import retains file/preview on failure. Clear, changing a selected file, and revalidating a current preview require confirmation; declining file replacement restores its original FileList. Revalidation failures retain the existing selections. Preview focus and clear-focus are conditional on visible connected elements, so closed-dialog responses do not steal focus. Separate rubric confirmation, fresh IDs, limits, keys and explicit saving are unchanged.

### Verification and evidence

Collaborator design review inspected code, supplied screenshots/crops and both 320px captures: no blocking UX/a11y deviations found (not human acceptance or independent browser execution). Follow-up polish reproduced RED for Close wrapping onto two lines and stale disabled retry wording after completion. Nonshrinking/nowrap Close and a truthful completed-request label fix both; final component suite **4 passed (34.5s)** and topic journey **1 passed (2.0m)**. The review's stale loading-status observation had already been fixed with its own RED/GREEN. Source actions now wrap in shared action rows; density remains intentionally compact. SHA-256 comparison against the captured task baseline verified all **14** pre-existing backend/domain/migration/script and Next metadata files unchanged. Overall acceptance remains pending; implementation is ready for reviewer handoff.

- RED `npx playwright test --config playwright.assessment-import.config.ts --output output/assessment-modals-red`: existing inline JSON input remained visible before opening.
- Component RED/GREEN commands use `npx playwright test --config playwright.prompt-rendering.config.ts --grep 'proposal dialogs'`. REDs reproduced unconfirmed Clear, unconfirmed file replacement and generation clear. A later RED reproduced stale “Submitting request…” after a network failure; the status now distinguishes last-known state, uncertain receipt recovery and definite rejection.
- Final focused component test passes: Close/Escape/title/return focus, retained selections, declined clear/replacement/revalidation, preserved review after validation outage, closed-dialog late completion, detach closure, disposal ignoring a late response and generation receipt recovery. This isolated component fixture stubs requests and is not API qualification.
- `npx playwright test --config playwright.assessment-import.config.ts --output output/assessment-modal-import`: **1 passed**, final 3.5m overall. All prior permission, Origin/CSRF, malformed JSON, 30-question capacity, current-section-at-apply, save-in-flight rejection, fresh-ID/key mapping, preview-only answer exclusion, save/readback/reload and separate rubric assertions retained. Added native discard accept/dismiss, no backdrop dismissal, keyboard/title/focus return, work guards while closed, delayed validation discard and keep-on-close cases, modal geometry/internal scrolling and axe at 1440/390/320px.
- `npx playwright test --config playwright.assessment-topic.config.ts --output output/assessment-modal-topic`: **1 passed**, final standalone 1.9m; exact lost-response/completed-receipt recovery retained. See topic record below.
- `npx playwright test --config playwright.assessment-builder-ui.config.ts --output output/assessment-modal-builder`: **1 passed**, 2.5m overall; existing editor/publication/recovery regression unchanged.
- `npx playwright test --config playwright.prompt-rendering.config.ts --output output/assessment-modal-components`: **4 passed** at full-suite checkpoint. Later focused modal recheck also passed after status/error and disposal coverage.
- `npx vitest run tests/assessment-proposals.test.ts tests/assessment-topic-contract.test.ts tests/assessment-definitions.test.ts tests/assessment-content.test.ts tests/assessment-rich-text.test.ts`: **44 passed**, five files.
- `npm run typecheck` passed. `NEXT_DIST_DIR=.next-modals-build npm run build` passed (38.1s compilation; all routes emitted), executed through a finally-protected wrapper restoring exact pre-build Next metadata bytes; preservation verified True. Prettier and diff checks passed at checkpoint.

Screenshots: `output/playwright/assessment-import-dialog-{1440,390,320}.png`, `assessment-topic-dialog-{1440,390,320}.png`, plus existing mobile screenshot paths. Parent inspected import mobile and generation desktop screenshots: contained dialog, visible header/footer, readable copy and one body scroll area. Full-page screenshots also show inert background page below the viewport; that is capture geometry, not modal expansion.

Harness corrections/limits: a new test replaced an invalid selected file without accepting the new discard confirmation; browser correctly retained that invalid file, so the expected preview did not appear. Test now explicitly accepts replacement, retaining decline coverage in the component test. Completed generation clear uses local-discard wording, not misleading server-cancellation wording. A combined sequential import+topic tool invocation exceeded its 300s shell limit after import passed; standalone topic rerun passed. Transient isolated startup ECONNREFUSED and existing esbuild cross-module composition warnings remain. No Firefox/WebKit, manual screen-reader, production-provider or new PostgreSQL qualification claimed. No live owner runtime restart, database/env changes, commit, push or deployment. Human review/overall acceptance remain pending.

Changed for this UI follow-up: `apps/web/app/components/assessment-builder.tsx`; `assessment-builder/builder.js`, `proposal-preview.js`, `topic-generation.js`; `ui/assessment-builder.module.css`; new `assessment-builder/proposal-dialogs.tsx` and `.module.css`; `tests/assessment-import-browser/import.spec.ts`, `tests/assessment-topic-browser/topic.spec.ts`; new `tests/prompt-rendering-browser/proposal-dialogs.spec.ts`; DESIGN, checklist and existing import/topic records. All backend/domain/migration/config work predates this follow-up and is preserved.

Status: JSON import locally implemented and automatically verified on `feat/ai-import-assessment-generation`. Overall AI/import feature remains partial. Independent review and deferred human technical/UX/owner acceptance are not claimed. No commit, push, deployment, owner-server restart, AI call, document extraction or migration was performed.

## Scope and new contract

The user approved AI generation and JSON/document import with reviewed questions, proposed answers and an independently reviewed assessment-level rubric. This slice implements JSON only. The following is the concrete new interchange/API contract for that approved slice, not an existing V2 contract.

Synthetic working example: [samples/assessment-proposals-v1.json](samples/assessment-proposals-v1.json).

Top-level JSON object (all three fields required; unknown fields rejected):

- `format`: exactly `assessment-proposals-v1`.
- `questions`: 1–30 questions, unique `reference` values.
- `rubric`: `null` (leave existing rubric alone), or the rubric object below. Null never clears an existing rubric.

All references match `^[A-Za-z][A-Za-z0-9_-]{0,59}$`. They are local interchange references, not database IDs. Question references are unique per file, choice references per question, criterion references per rubric. Same choice reference in different questions is valid.

Question fields:

| Field | Contract |
| --- | --- |
| `reference` | Required local reference |
| `type` | `multiple_choice` or `open_response` only |
| `prompt` | Required nonblank plain text, maximum 4,000 UTF-16 code units |
| `choices` | Required array; MCQ: 2–30 `{reference,text}` objects, nonblank text up to 1,000 code units; open response: empty array |
| `correct_choice_reference` | Optional, MCQ only, must match a choice in this question; when absent the author must choose a key before publication |
| `suggested_answer` | Optional, open response only, nonblank plain text up to 4,000 code units; explicitly preview-only, never saved or inserted into learner prompts/choices |

Rubric fields (all required): `threshold` is null or a finite number 0–100; `criteria` is 1–30 objects with `reference`, `category` (nonblank, max 120), `label` (max 180), `guidance` (max 4,000), and numeric `weight` >0 and <=1. Fractional weights total 1 with the existing readiness tolerance (absolute difference <0.000001), not 100. All nested objects reject unknown fields. Plain text conservatively excludes `<`, `>` and C0 controls except tab/newline/carriage return. HTML, images, imported IDs, matrix questions, sections and arbitrary metadata are not accepted. No silent truncation or coercion.

File limit is 256 KiB of UTF-8 bytes, checked before browser reading and again server-side before JSON parsing. Browser decoding rejects malformed UTF-8. Individual shape limits also apply, so the full combination of every maximum need not fit in a file.

### Validation-only API

`POST /api/assessments/proposals/validate` (web proxy; API route `/assessments/proposals/validate`):

```json
{"csrf":"current session CSRF", "clientId":"selected client UUID", "source":"raw JSON file text"}
```

The body is strict. Existing Origin/session/CSRF policy applies. `AssessmentDefinitions.author` rechecks current selected-client coordinator membership before file parsing; Global Admin or Client Admin alone is insufficient. Success returns the validated interchange object, without persistence, generated IDs, a save receipt, or provider calls. Domain failures return content-free 422 messages; unauthorized requests retain existing authentication/permission errors. Request size is bounded at the route and UTF-8 service levels. The ordinary builder save/publish API remains the final authority for persistence and immutable publication.

## Review and state behavior

- Optional panel in Questions uses the existing imperative builder architecture/presentation adapter and semantic CSS. `renderProposalPreview` is source-independent for later validated generators.
- Preview does not change assessment state. Questions are selected explicitly (initially all selected); append is all-or-nothing against current capacity and current section. The initial blank question remains. Applied items are disabled within that preview to prevent double-click duplicates; deliberately reimporting a file creates fresh UUIDs.
- Question and choice UUIDs are regenerated and proposed MCQ references remapped into the existing private `answer_key`. Criterion UUIDs are generated only when applying the rubric. No reference or suggested answer is copied into the persistence payload.
- Rubric replacement is a separate action with an assessment-wide overwrite warning and explicit native confirmation. Cancelling preserves all rubric values. Question append never changes rubric/threshold; rubric replacement never appends questions.
- No autosave or publication. Normal dirty generation/readiness and shared work guards cover local edits, chosen files, preview and pending validation. Application is rejected during save, publication, unresolved retry/conflict or image upload. Existing save idempotency, undo, publication and private-image paths are unchanged.
- Cancel/clear forgets source/preview, ignores late validation responses and does not undo already applied edits. Error paths preserve the chosen file for explicit retry; correction/reselection resets the old preview. Pending request timeout remains 30 seconds. Partial/offline modes are not introduced.

## Executed evidence

RED/GREEN:

- `npx vitest run tests/assessment-proposals.test.ts`: initial missing module, then real RED (`parseAssessmentProposals is not a function`); first acceptance GREEN 1 test. Strict-invalid-input RED 13 failures / 1 pass; implementation GREEN 14 tests. Final expanded boundary suite is included below.
- `npx vitest run tests/assessment-definitions.test.ts -t 'validates proposals'`: RED, missing `validateProposals`. `npx vitest run tests/assessment-definitions.test.ts tests/assessment-proposals.test.ts`: GREEN, 20 tests at that checkpoint.
- `npx playwright test --config playwright.assessment-import.config.ts`: real API RED 404 instead of author denial; after route implementation, UI RED missing JSON file control. First integrated run reached save/readback but failed because the test guessed the wrong GET URL; corrected to the existing query-parameter contract. Subsequent complete run passed; expanded final run passed 1 test, 43.6 seconds overall.

Final checks executed:

```sh
npx vitest run tests/assessment-proposals.test.ts tests/assessment-definitions.test.ts tests/assessment-content.test.ts tests/assessment-rich-text.test.ts tests/assessment-responses.test.ts tests/assessment-scoring.test.ts
npx playwright test --config playwright.assessment-import.config.ts
npx playwright test --config playwright.assessment-builder-ui.config.ts
npx tsc --noEmit -p tsconfig.server.json
npm run typecheck --workspace=@tracker/web
npx tsc -p tsconfig.server.json --outDir .runtime/import-server-build
git diff --check
git branch --show-current
```

Results: 54 domain tests across six files passed (12.89 seconds final run); import journey 1 passed; unchanged builder workflow 1 passed (1.4 minutes overall); both typechecks and isolated server compilation passed; diff check passed (pre-existing tsconfig CRLF normalization warning); branch remains exactly `feat/ai-import-assessment-generation`.

Import browser coverage: admin-only denial, coordinator allowance, cross-client/forged-Origin/invalid-CSRF rejection; malformed JSON; preview/cancel/select; private suggested-answer notice and saved-content exclusion; unchanged blank question; no writes before Save; independent rubric cancel/apply; actual saved/reloaded content and keys; repeated-reference fresh-ID remapping; section chosen at application time; pending-save rejection; stale validation after cancel; sign-out guard; atomic 30-question capacity rejection. Axe WCAG A/AA and no page overflow pass at 1440, 390 and 320px. Screenshot `output/playwright/assessment-import-mobile.png` inspected, including cropped review content; inherited sticky header and wrapped controls remain. No cross-browser or human visual acceptance is inferred.

Production build executed via a Python wrapper invoking `npm run build --workspace=@tracker/web` with `NEXT_DIST_DIR=.next-import-build`; it captured/restored the exact pre-build bytes of `apps/web/next-env.d.ts` and `apps/web/tsconfig.json` in `finally`. Build passed, 28 static pages generated; wrapper verified metadata preservation (`True`). Build artifacts remain local at `apps/web/.next-import-build/` and `.runtime/import-server-build/`. They are not source deliverables.

Formatting executed with `npx prettier --write` over the new contract/test/preview/config/sample files and touched existing API/domain/test TypeScript files. Added production lines/new modules were statically scanned for eval/exec, innerHTML assignment, shell execution, debug logging and hardcoded credentials: zero matches. Self-review found no persistence/SQL/schema changes and confirmed explicit allowlists. This is not an independent security review.

Browser harness uses `scripts/overview-browser-start.ts`: fresh isolated ephemeral PGlite/private storage under `.runtime/overview-browser`, ports 3110/3111, `.next-overview`, no owner `.env`, live mail or AI. Readiness polling briefly logs expected connection refusals while the test API starts; all suites subsequently pass. Owner 3100/3101 and owner databases were not touched. PGlite evidence does not qualify PostgreSQL concurrency/RLS.

## Topic-generation architecture preflight — historical; policy now resolved

Owner subsequently approved BOTH recommendations: shared client/workspace-and-environment authoring allowance, distinct configured cap under the organisation ceiling (not learner budgets). The bounded deterministic topic-generation fallback is implemented and separately documented in `ASSESSMENT_TOPIC_GENERATION.md`; actual Codex/paid generation remains disabled pending capability qualification/numeric production caps. The preflight below is retained as history, not a current request for owner approval.

This is a design/preflight record, **not an implemented topic-generation slice**. Branch verified as `feat/ai-import-assessment-generation`. The existing uncommitted JSON slice and Next metadata were preserved. No new provider request, migration, application-code change, owner-runtime action or database access was performed during this preflight.

### Proposed bounded design (not yet approved budget policy)

1. Add an explicit discriminated gateway scope: existing enrolment runs retain their enrolment ID and programme budget; assessment-authoring runs use an authoring scope and never manufacture an enrolment. Use an additive migration with a database constraint requiring exactly the appropriate scope for the task, tenant-bound scope references and preserved existing foreign keys. Do not merely make `enrolment_id` nullable without those constraints. New unsaved builder requests must not create an assessment draft as a side effect.
2. Keep the same organisation lock, organisation-wide spending reservation, idempotency ledger, encrypted task input/result, provider locks and one-running-client index. Authoring needs its own explicitly defined subordinate budget scope. Current code only has organisation and per-enrolment/programme budgets; choosing a replacement is a policy decision below, not a safe implicit fallback.
3. Introduce a separate authoring handler contract and registry classification path. Recheck current actor, available selected client and coordinator membership at admission, dispatch, result delivery and reads. Do not reuse learner classification by inventing a member. Local mock execution is synthetic/test-only and never permits a caller-supplied synthetic flag to classify arbitrary real topic text. Real topic data/provider enablement remains gated separately from synthetic fixture testing.
4. Pin a topic prompt/schema version. Strict request options default to five mixed MCQ/open-response questions in English, with selectable difficulty. Strict output builds on `assessment-proposals-v1` and additionally requires the exact requested count, both requested types, valid correct-choice references for every MCQ, preview-only guidance for every open response, and a non-null assessment-level rubric. Reject unknown fields, incorrect types/counts and incomplete answers; never silently truncate or repair into acceptance.
5. Return queued/running/complete/failed/cancelled/ambiguous state from the durable gateway, not simulated browser timers. Cancel is explicit; an already dispatched unknown outcome retains its accounting reservation and never auto-retries. Explicit retry must distinguish safe admission replay (same idempotency key) from a genuinely new approved execution; unknown-charge runs cannot become new calls by pressing Retry.
6. Feed only validated successful results into `renderProposalPreview`. No automatic append/save/publish or rubric replacement. Preserve the current separate rubric confirmation and preview-only open-response-answer notice. Cancellation rejects late results; save/reload persists only explicitly applied questions/private MCQ keys and separately applied rubric, never suggested open answers.
7. Qualify the migration with real PostgreSQL tenant isolation and concurrent organisation/subordinate reservations, idempotency and one-active-call tests. Then run gateway regressions, authoring API permission/CSRF/provider-gate/privacy tests and isolated builder cancel/select/rubric/save/reload browser tests. None of this qualification is claimed by this preflight.

### Historical blocking owner policy decision — now approved

`ai-gateway.ts` currently reserves against both `organisationLimit` and `programmeLimit`; the latter sums runs by `enrolment_id` (request admission around lines 217–225). `ai-registry.ts` exposes only those two limits. An assessment authoring request has no enrolment, and an unsaved builder has no durable assessment identity. The approved feature description does not define the replacement subordinate spending boundary.

**Decision requested before gateway/schema implementation:** should assessment authoring share one client/environment-wide authoring allowance (recommended to prevent budget resets by opening new drafts), or use a durable per-assessment allowance? Specify whether the authoring allowance is a distinct configured cap under the existing organisation cap, or intentionally reuses the programme-limit *value* as a separately named authoring cap. Do not silently treat each request/draft as a new programme allowance, omit the subordinate guard, or charge an unrelated learner. A disabled-by-default configurable cap is possible, but the scope and enabling policy still need an explicit decision. No cap, renewal window or production authorization has been invented here.

Codex OAuth subscription usage is a separate unit from the existing micro-USD ledger. A later local synthetic adapter must record unknown monetary cost honestly (not zero or the mock price), reserve a strict local call allowance before dispatch, and permit no unattended retry. It must not be registered as a normally usable production provider. The existing mock's `synthetic-ledger-v1` rates are simulated accounting only and cannot price Codex usage.

### Codex capability findings and remaining qualification

Executed read-only `codex --version` and `codex exec --help`: installed version `0.171.0`; supported options include `--ignore-user-config`, `--ephemeral`, `--sandbox read-only`, `--output-schema`, and `--strict-config`. Help explicitly says `--ignore-user-config` still uses `CODEX_HOME` for authentication. No credential files were read or copied.

Official documentation inspected:

- https://developers.openai.com/codex/config-file/config-basic — documents `features.shell_tool`, `apps`, `hooks`, `multi_agent`, `shell_snapshot` and `remote_plugin`; says resumable execution can only be disabled by managed requirements.
- https://developers.openai.com/codex/config-file/config-reference — documents command-execution feature controls and managed requirements.
- https://developers.openai.com/codex/config-file/config-sample — additionally documents disabling the local image viewer and bundled/default capabilities.

These are candidate controls, **not proof of an all-tools-disabled boundary on the installed Windows build**. `read-only` alone does not prevent sensitive reads; isolated cwd and prompt instructions alone are not sufficient. Before an adapter is exposed even for local fixtures, inspect the actual supported tool catalog under strict configuration, disable every file/command/web/connector/agent capability, qualify process environment and output/time limits, and use a fixed approved synthetic topic rather than arbitrary application text. If this cannot be demonstrated without host-policy changes, retain offline explicitly supervised synthetic import testing and the deterministic mock app path instead. No unsafe programmatic adapter was added and no five-question Codex result is claimed here. The parent's earlier standalone synthetic probe is distinct evidence, not a run executed by this preflight.

Source processing remains a subsequent slice: scan-clean/hash-verified bounded PDF/DOCX/TXT extraction, source classification, encrypted input provenance and explicit extraction review must be designed before any real document is sent externally. Open-response guidance persistence remains a separate owner decision.

## Files and follow-on handoff

Modified: `apps/api/src/main.ts`, `packages/domain/src/assessment-definitions.ts`, `apps/web/app/components/assessment-builder/builder.js`, `apps/web/app/components/ui/assessment-builder.module.css`, `tests/assessment-definitions.test.ts`, `DESIGN.md`, `FEATURE_CHECKLIST.md`.

Created: `packages/domain/src/assessment-proposals.ts`, `apps/web/app/components/assessment-builder/proposal-preview.js`, `tests/assessment-proposals.test.ts`, `tests/assessment-import-browser/import.spec.ts`, `playwright.assessment-import.config.ts`, this record and the synthetic sample.

Pre-existing Next metadata changes and `.hermes/`, `.worktrees/`, `.next-image-busy-build/` remain outside this slice. No source baseline/V2 files changed.

Next work, not implemented here: source-safe PDF/DOCX/TXT intake, provider/gateway authorization and budgeted AI generation, user-selectable difficulty with approved five mixed English-question defaults, and a separately approved private open-response model-answer storage contract. Reuse this validated proposal preview, not automatic application. Do not imply that JSON local verification completes those features or deferred human acceptance.
