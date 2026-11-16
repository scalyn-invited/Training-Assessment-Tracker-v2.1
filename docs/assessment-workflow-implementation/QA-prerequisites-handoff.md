# Independent workflow prerequisite validation — t_2291410d

## Status / decision

**Validation stage complete; D05 accepted within the tested boundary. D01–D04 have actionable evidence; D02 implementation remains policy-deferred.** Release pre-created backend task `t_88729474`; do not block the independent fixes on D02. No production code was changed. This is not merge, deployment, full application qualification or owner acceptance.

Candidate tested: `2a407d77b33c9bfb122598d4b23a111488a74b24`, branch `feature/assessment-workflow-improvements`, base `f24e87c`. QA evidence/test commit is recorded in the Kanban completion metadata. The existing upstream untracked tooling diagnostics and screenshots were preserved and excluded from this handoff commit.

### Stage acceptance

- [x] Consume exact completed D05 handoff and independently exercise all three approval-copy states.
- [x] Exercise reviewer reload loss and client-switch/logout ordering with actual components; distinguish unexecuted integrated SPA/history paths.
- [x] Reproduce supported teamless appeal dead-end through real domain services on a fresh synthetic database; state the unresolved authority decision without broad-role workarounds.
- [x] Exercise uncertain publication and stale-save component behavior; independently verify exact publication retry/readback domain behavior.
- [x] Compare representative two-section preview, learner-subset and history rendering.
- [x] Assess D06–D08 with synthetic examples and separate actual behavior from unmeasured user comprehension.
- [x] Preserve authority, version, immutable-record and privacy regressions; provide concrete acceptance for the next implementer.

## Isolation, references and evidence vocabulary

Read worktree AGENTS.md, apps/web/AGENTS.md, DESIGN.md, checklist opening/final status and relevant assessment ledger. Read approved main-tree documentation **only**: `docs/assessment-workflow-audit/designer/workflow-proposal.md`, root `final-review.md` and `source-review.md`. `designer/final-review.md` does not exist; the authoritative review is at the audit root, consistent with the parent handoff. Did not copy main source/dirty files, inspect private runtime, or access the separate rich-editor worktree.

Loaded TDD, systematic-debugging, dogfood, training-tracker-runtime-qa and sdlc-review. `ux-engine`, `playwright` and `ux-auditor` skill loads returned not found; they are **not claimed loaded**. Playwright itself is installed and executed normally. Existing project conventions and DESIGN.md were followed. No Next application code was written.

- **B — observed component browser behavior:** actual production components/builder code, headless Chromium, all outbound requests intercepted and unexpected requests rejected. Synthetic transport is explicit test input, not a fabricated server result. Shell hooks for pathname/router are replaced with a stable test adapter; context mutation ordering uses the real AppShell handlers and real browser beforeunload. No Next server or authenticated HTTP lifecycle is claimed.
- **D — observed domain behavior:** actual Auth/Tenancy/assessment services and SQL migrations with fresh in-memory PGlite via `tests/helpers.ts`, loopback port 55439 checked free before test runs. Synthetic accounts/roles/grants are isolated fixtures. No environment database URL is used by that helper. Final contained run explicitly sets TEMP/TMP/TMPDIR to `.runtime/qa-temp` inside this worktree and verifies Node's resolved temporary directory before fixture writes. **Isolation deviation:** earlier runs inherited Windows `C:\Users\cabas\AppData\Local\Temp` for the review suite's disposable file fixture, despite the session's TMPDIR setting; that suite's afterAll removes its own temporary directory. This was detected by checking actual `os.tmpdir()` and corrected for the final complete rerun. Earlier tests were synthetic but their file-temp location was not worktree-contained; do not claim otherwise. No existing files/private runtime were accessed. Tests that set clean scan status are synthetic permission/hash fixtures, not scanner qualification.
- **S — source-only:** traced but not executed in an integrated application. These are explicitly distinguished below.
- No API/worker/web process, live SMTP, AI gateway, paid call, native desktop, protected 3100/3150 service, real credential/session or private database was used. Domain tests may enqueue local records but no delivery worker runs. Existing worktree-local Chromium/dependencies were reused without installation.

Final browser fixtures load **all four layout stylesheets** and `data-theme="light"`. Initial runs loaded globals only; their layout is superseded by final styled screenshots. The fixture's extra explanatory headings and direct builder mounting are not application layout defects. In particular, the real React wrapper supplies the published builder's “Revise assessment” heading; this harness does not test that heading.

## Disposition and implementable acceptance

### D01 — confirmed reviewer loss and unsafe context ordering (P1)

**B reproduction: reviewer reload.** Mount a submitted review with one criterion and a synthetic clean file. Enter score `83`, member feedback, private decision rationale, verified file text and confirmation reason. Reload. No beforeunload dialog occurs; remounting the same review projection shows empty score, feedback, rationale and verified text. The values were local and never submitted. Test: `D01 reviewer reload loses score feedback rationale and verified file text without warning`; screenshot `qa-screenshots/D01-reviewer-dirty.png` records the pre-reload state, assertions record the loss.

**B reproduction: context switch and logout.** Mount actual AppShell plus dirty builder. Select Synthetic B and click Switch client; dismiss the browser leave dialog. Recorded order is `POST /api/clients/select` **then** `beforeunload`. Dirty title remains in the canceled page and shell stays “Opening client…”. Logout similarly records `POST /api/auth/logout` **then** `beforeunload`. These requests were fulfilled by fixtures, so this proves unsafe client-side ordering, **not a real server session mutation or subsequent real save denial**. Screenshots: `D01-switch-canceled-after-post.png`, `D01-logout-canceled-after-post.png`.

**S remaining navigation boundary:** builder.js:504 installs only beforeunload; AppShell links use Next Link, and reviewer fields remain local React state. Actual Next SPA sidebar transitions, browser history integration and back-forward cache were not run. Do not label those paths reproduced data loss. The confirmed reload/context defects already justify the shared safeguard.

**Acceptance for implementation:**
1. One dirty/pending/uncertain-work contract must include author fields, reviewer criterion score/feedback/evidence selections/rationale, verified text/confirmation reason and relevant pending mutations.
2. Resolve Stay/Leave **before** client-selection or logout POST. Stay sends zero context/session mutations, keeps all values and prior effective client, clears attempted busy state, and permits safe continuation.
3. Cover literal links, real Next sidebar navigation, browser Back/Forward, reload/unload, client change and logout with integrated Playwright tests. Record positive clean-navigation controls; no blanket permanent navigation lock.
4. Pending or unknown operations settle/reconcile before a newer write or navigation. Do not introduce broad localStorage persistence of private reviews or silently persist a server draft.
5. Cancellation and denied/stale decisions preserve values without authorizing approval of a stale attempt. Add genuine failing desired-contract tests before production edits; existing characterization tests intentionally assert current defects.

### D02 — teamless appeal dead-end reproduced; policy required (P1)

**D reproduction:** using normal domain create/assign/save/submit/decision APIs, create an enrolment with `groupId: null`, reject its submitted attempt, then let its learner open an appeal. Independent Client Admin routing returns that case with **no reviewers**. Routing the otherwise valid alternate coordinator returns `422 invalid_alternate`. Learner save and submit both return 409; the prior normal reviewer decision returns 403; exact member read still shows an open appeal. Test: `QA D02 characterizes no-team appeal freeze and unavailable alternate routing` in `tests/assessment-reviews.test.ts`.

The same suite passes the ordinary team-case routing, exact role binding/no revival, metadata-only routing, resolution/file-access closure and stale/private-result checks. Thus the teamless failure is not inferred merely from a missing browser fixture. No real record was stranded.

**Root:** `assessment-reviews.ts:401–420` requires enrolment team plus an exact team coordinator grant; appeal opening does not require a team. `assessment-access.ts` separately requires eligible case authority. Removing only the first team check would not constitute a secure policy.

**Decision required from default/orchestrator before D02 implementation:** define the eligible alternate pool for teamless cases and its exact revocable authority record (including any distinct sensitive permission requirement), who may grant it, which existing open cases may be explicitly rerouted, and the expiry/revocation/closure semantics. The approved proposal instructs that this policy must be decided; it does not supply the missing grant model. Do not invent a team, broaden roles, reuse general admin/author authority, automatically revive grants or leave already-open cases without a recovery rule.

**Acceptance once decided:** independent Client Admin routes only case metadata; exclude learner, prior reviewer and routing actor; authorize exactly the case/attempt and submitted evidence; deny unrelated training/files; bind exact live grant and require explicit rerouting after replacement; close authority on resolution; test fresh and already-open teamless cases, self/prior/router/cross-client denial and revocation/no revival. Keep learner edits paused during an open appeal. **Defer only D02**, not this stage or D01/D03/D04.

### D03 — publication ambiguity and ineffective stale-save stop confirmed (P2)

**B publication reproduction:** ready saved two-section draft → Publish confirmation accepted → intercept publish response as lost → UI says “Publication failed. Your saved draft is preserved.” Publish re-enables; second click sends the same ID/version without exact-definition readback, receives 409, and continues claiming a saved draft is preserved. Screenshot `D03-unknown-publication.png`. The transport's committed flag is a deliberate fault model, not proof of a real commit.

**D independent supporting check:** actually publish a definition through the service, retry that exact ID/old expected version, observe 409; exact `definitions.get` returns the **same published ID**, revision 1/version 2. Test `QA D03 exact publication retry conflicts but exact readback confirms the same published record`. This separately grounds why the browser's definitive failure text is unsafe.

**B stale-save reproduction:** edit title → save receives 409 → fields remain and message says copy before reload. Clicking Retry save sends a **new save token with the same stale expected version**. Thus preservation works, but the specified stop-writes state does not. Screenshot `D03-conflict-retry.png`. Domain regression still rejects stale overwrites and altered-token replay.

**Acceptance:** distinguish definitive error, unknown outcome and confirmed publication. Reconcile the exact definition/status/version before retry or newer mutation; never create another revision as a retry. On 409 retain the entire local structured draft, enter a write-stopped conflict state, and offer authorized comparison/recovery before explicit destructive reload. Include success-response-loss, network failure before commit, failed readback, denied access, same-operation save replay with newer typing, and conflicting tabs. Do not enable answer-key/private-content export by default or weaken exact-version checks. Domain correctness alone does not fix the misleading browser state.

### D04 — preview scope and reference divergence confirmed (P2)

**B reproduction:** use Section A questions A1/A2 and Section B questions B1/B2. Preview numbers B1 as **Question 3**. Pass the same section-B subset to the actual ResponseQuestions renderer (as the real response editor does): B1 becomes **Question 1**. Rendering all questions for history gives Question 3 again, without section headings. Choose a preview answer, leave Review, edit the title and return: the answer resets while the **unsaved local title** appears. Existing text excludes keys/author rubric but does not state non-recording response behavior or saved-versus-unsaved provenance. Screenshot `D04-section-preview-history.png`.

**Boundary:** renderer comparison, not a full persisted section-navigation journey. The domain response suite independently passes ordered section progress, matrix gates and immutable submission/replay. `assessment-response.tsx:129–133,441–444` corroborates full-history versus current-section inputs.

**Acceptance:** persistent “Content preview — responses are not saved”; truthful current-unsaved versus saved-revision context; shared stable section/question references across preview, learner sections and history (do not change underlying IDs). Keep author rubric separate and private keys hidden. Any section simulation must disclose omitted save/submit/permissions/scanning. Test at least two sections with multiple questions, local unsaved edits, preview reopening, reordered content and historical pinned content. Reset itself is not an autosave defect; the scope/reference ambiguity is the issue.

### D05 — independent bounded PASS

Copied parent regression cases into the separate QA browser directory solely to avoid overwriting upstream evidence, then exercised the actual unchanged component with full layout CSS/light theme. Current approved attempt uses the exact approved sentence; pending and earlier-approved/new-current-attempt retain approval-required wording. Separate rubric90/MCQ100%, expected result presence, enabled authorized decision controls, no page errors and no 375px page overflow all pass. Desktop and narrow screenshots for each case are in `qa-screenshots/D05-*`.

The earlier-approved/new-current projection is defensive input, not proof that ordinary domain resubmission reaches that combination. No permission or lifecycle expansion is inferred. Preserve this behavior during subsequent work.

### D06 — defer new queue; existing handoff demonstrated

**B:** published synthetic definition already displays **Assign assessment**, linking to `/assessments/definitions/synthetic-definition/assign`; local editing hides it. Screenshot `D06-existing-assignment-handoff.png`. **D:** assignment tests pass pinned revision, eligible/sensitive authority, duplicate safety, team-rule stop/resume and creator-revocation checks.

No user study, missed-work measurement, representative queue volume or confusion was demonstrated. Do not claim a missing handoff/queue. Defer a new queue/redesign. If later evidence justifies copy, retain publish≠assign and exact-revision destination without new authority; any future counts need permission filtering and independent empty/loading/error tests.

### D07 — return-feedback gap supported, bounded clarity work justified

**D:** reject an evidence-bearing attempt with supplied criterion feedback; member read has `approved:null`, `reviews:[]`, `rubric:null`, `evidence:[]` and contains neither the private decision rationale nor the supplied criterion feedback. Save a revised answer with the returned version and status becomes draft; existing tests then submit a new immutable attempt and deny review of the superseded one. Test `QA D07 characterizes absent member-safe return feedback without leaking private rationale`.

**S UI corroboration:** member response shows `rejected` and editable answers; AssessmentReview has an appeal form but no distinct returned-member feedback presentation. No human comprehension or complete rejected-learner browser journey was measured.

**Acceptance for bounded improvement:** separately authored, explicitly member-safe changes-request feedback, stored and projected independently of private rationale/analysis. Show actionable return guidance without publishing a grade or private history. Preserve missing evidence versus explicit zero versus insufficient=null and approval-as-release; keep old attempts/decisions immutable. Test privacy with identifiable synthetic private and public strings, empty/invalid public feedback recovery, rejection→saved draft→new attempt and open-appeal edit denial. Do not expose the existing private reason as a shortcut or introduce another release workflow.

### D08 — provenance gap observed; immutable pins pass

**B:** begin from published source, edit, save a response naming `synthetic-copy`; URL changes to that new ID and status says “Draft saved. Not published.” No source definition/revision or new identity is rendered in the builder body. Screenshot `D08-copy-provenance.png`. The live React wrapper's heading is outside this probe, as noted above.

**D:** actual published save creates a new draft ID, same family/next revision; source definition remains exactly equal. Added `QA D08 published-copy creation preserves old individual and team pins`: existing assignment IDs/definition IDs/team-rule IDs and team-rule definition pins are unchanged. These are real service/SQL checks, not fixture-response inference. No historical-record corruption was found.

**Acceptance:** bounded provenance display is supported: source definition and publication revision, new draft identity/revision and explicit old-pin preservation. Publication revision must not be confused with optimistic version. Do not invent a direct-parent provenance link if only family membership exists; use known source identity during copy and a durable explicit relationship if required after reload. No implicit assignment migration, unpublish or in-place editing. Test reload, copy/save replay, old assignments/team rules/attempt snapshots and unauthorized source access. No broader redesign or measured confusion claim.

## Executed commands and actual results

All commands executed from the isolated worktree; logs are adjacent to this report.

1. `node docs/assessment-workflow-implementation/qa-port-check.cjs` — free loopback test port confirmed before each domain batch; no connection to protected services.
2. `node node_modules/vitest/vitest.mjs run tests/assessment-reviews.test.ts tests/assessment-definitions.test.ts tests/assessment-content.test.ts tests/assessment-scoring.test.ts` — initial run: **13 passed, 14 skipped; two suite setup hooks timed out at 60s** (`QA-domain.log`). Not a product pass or test failure reproduction.
3. `node node_modules/tsx/dist/cli.mjs docs/assessment-workflow-implementation/qa-db-probe.ts` — foreground exit0: actual PGlite create/query, socket helper and all migrations completed and closed (`QA-db-probe-foreground.log`). Earlier background invocation exited1 with `stdin is not a tty` (`QA-db-probe.log`); it was not left running.
4. Same four-file Vitest command with `--hookTimeout=180000` — **27 passed**, 98.17s (`QA-domain-retry.log`). No assertions weakened. Exact first-run timing cause is not established.
5. Six-file Vitest command adds `tests/assessment-assignments.test.ts tests/assessment-responses.test.ts`, retains `--hookTimeout=180000` — **6 files, 38 passed**, 84.50s (`QA-domain-final.log`). Includes new D08 pin test. After correcting Windows temporary-directory scope, reran all six files unchanged: **38 passed, 73.64s** (`QA-domain-contained.log`); `QA-isolation-final.log` records the actual worktree-local temp path and free port. For reproduction, first `mkdir -p .runtime/qa-temp` and set TEMP, TMP and TMPDIR to the absolute worktree `.runtime/qa-temp` path. PGlite is not PostgreSQL RLS/concurrency qualification.
6. `node node_modules/playwright/cli.js test -c playwright.workflow-qa.config.ts workflow.spec.ts` — initial **4 passed/3 failed** (`QA-browser-initial.log`): nonsecure fixture origin lacked randomUUID for saves, and Active client locator matched both form/select. Fixed test harness only: HTTPS reserved fixture origin and exact select locator. No production changes or claims of product RED/GREEN.
7. `node node_modules/playwright/cli.js test -c playwright.workflow-qa.config.ts` — 10 passed in retry and formatted runs (`QA-browser-retry.log`, `QA-browser-final.log`). Final full-layout stylesheet/light-theme run: **10 passed, 14.8s** (`QA-browser-styled.log`). These are **characterization passes, not proof the recorded defects are fixed**.
8. `npm run typecheck` — server and web passed, exit0 (`QA-typecheck.log`). Browser harness is executed/transpiled by Playwright; this command does not separately typecheck every probe.
9. Prettier writes/checks on QA tests/config and `git diff --check` — passed. No production build/full-suite/PostgreSQL run.

Generic execute_code and inline diagnostic execution were refused under unattended policy; no approval setting was changed. Ordinary file-based test tools worked. These tooling failures are preserved rather than counted as application failures.

## Evidence and handoff files

- `tests/workflow-qa-browser/workflow.spec.ts`: seven reproducible component characterization scenarios.
- `tests/workflow-qa-browser/d05.spec.ts`: three D05 checks derived from the parent, with separate screenshots/full application styles.
- `playwright.workflow-qa.config.ts`: one worker, worktree-local browser, no webServer.
- `tests/assessment-reviews.test.ts`: two QA scenarios and optional synthetic no-team fixture argument.
- `tests/assessment-definitions.test.ts`: exact publication retry/readback check.
- `tests/assessment-assignments.test.ts`: published-copy pin preservation check.
- `qa-port-check.cjs`, `qa-db-probe.ts`: scoped isolation/tooling diagnostics.
- `QA-*.log`, `qa-screenshots/`, this report: execution evidence. The package manifest enumerates actual artifact counts/hashes.

Visually inspected final styled current-approved D05 narrow screenshot, canceled switch, publication-error and copy-provenance screenshots. Also inspected the initial D04 comparison at full/cropped resolution; final D04 assertions passed unchanged with complete styles. Not all screenshots received individual visual inspection. D05 narrow assertions are component-level responsive checks, not physical-device/WCAG acceptance.

**Next:** backend `t_88729474` consumes this evidence, starts with D01, then supported D03/D04; preserves D05; defers D02 pending the stated policy and D06 queue absent evidence; considers bounded D07/D08 clarity under the approved spec. Write desired-contract RED tests and fix one bounded feature at a time. Existing characterization assertions that encode a defect should be replaced with the intended acceptance when that feature is implemented, not retained as a requirement to preserve the bug. The pre-created downstream QA remains the independent verification gate. No new task or same-card review is needed.
