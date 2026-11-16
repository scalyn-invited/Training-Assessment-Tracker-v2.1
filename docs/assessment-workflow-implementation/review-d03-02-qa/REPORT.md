# Independent QA — REVIEW-D03-02

## Verdict and exact scope

**Bounded QA PASS; recommend final independent re-review. This is not overall implementation acceptance, owner acceptance or deployment approval.** No remaining REVIEW-D03-02 functional defect reproduced in the required scenarios. Original `2652126fe7d69e280c4e3410efd3741d91f68bcd` remains rejected, not retroactively accepted.

Tested HEAD: `03949a624b0354efbd32008e8c9dd0f7cc1238ef` on `feature/assessment-workflow-improvements`, descendant of `f24e87c`. Production correction: **`a1e4c16d2096076b4111cd3669396dfd4661d939`**. Production bytes are identical to frontend tested implementation `406ee8eb0988e82ed3b9c7bbd5c4a1486636fb34`; later `78fa02422a5442628b0c6b7ed69b4285d29fcc6d` and tested HEAD contain evidence only. QA evidence commit is recorded in the task completion metadata.

Read project AGENTS/DESIGN/checklist, frontend handoff, original final-review/REVIEW.md and approved MAIN-tree designer/workflow-proposal.md and root final-review.md read-only. Inspected actual builder diff and reconciliation/comparison flow, tests and real-domain race fixture. Sole production delta from rejected candidate is builder reconciliation: published version must equal attempted version + 1; a later draft or publication enters conflict preservation. No domain/API/authority changes. No implementation fix made by QA.

## Executed commands and results

All commands from the isolated worktree. `Q=docs/assessment-workflow-implementation/review-d03-02-qa`; `R=node $Q/run.cjs`; `D=node $Q/domain-run.cjs`. JSON counts independently parsed in verification.json, not inferred from frontend handoff.

| Command | Result / evidence |
|---|---|
| `node $Q/prepare.cjs` | Assertion-identical harness copied into fresh QA outputs before running; original/correction artifacts untouched. |
| `R browser qa-components --trace on` | **29 passed**, 0 failed/skipped/flaky, 122.749 seconds. Inherited 25 + original 2 reviewer negatives + 2 extended published recovery cases. browser.json, qa-components.log, runtime-browser-results traces. |
| `D qa-focused tests/access-membership.test.ts tests/assessment-reviews.test.ts tests/assessment-definitions.test.ts tests/assessment-assignments.test.ts` | **24 passed**, 4 files, 0 failed/pending, 59.17 seconds; qa-focused.json/log. |
| `R domain qa-race --config $Q/probe.config.ts` | **1 passed**, 12.22 seconds; domain.json, qa-race.log. Real domain save A/v1 → save B/v2 → publish B/v3; stale A publication returns 409/definition_changed. |
| `R build-web qa-build` | Optimized Next16.4.6 build PASS, 25 static pages, exit0. |
| `R next qa-next --trace on` | **5 passed**, 0 failed/skipped/flaky, 42.933 seconds. Inherited 3 plus published409/lost-response explicit reload cases; next.json, qa-next.log, runtime-next-results traces. |
| `R typecheck qa-server-typecheck` | Server TypeScript PASS, exit0. |
| `R web-typecheck qa-web-typecheck`; `R web-typecheck qa-web-restored` | Both PASS, exit0. Build-generated next-env.d.ts imports restored exactly to original committed text before second check; no final source diff. |
| `node docs/assessment-workflow-implementation/independent-qa/final-ports.cjs` before/after | 3275 and55439 free at both boundaries. Filename says final but before output retained separately. |
| `python $Q/process-check.py`; `node $Q/verify.cjs`; `git diff --check`; `git diff --exit-code` | No QA-scoped test processes; exact negatives unchanged; parsed counts, empty production/original-evidence/tracked diffs, clean whitespace. |

No failed or interrupted test invocation in this QA stage. Generic execute_code and a later inline Node staging command were denied by unattended policy; no policy change/bypass used. Ordinary approved terminal/read/write and explicit Git commands performed execution. Final staged diff checking flags three trailing-space lines in raw Next build progress output; retained unchanged as real execution evidence (source/harness checks are clean), not a product/test failure.

## Acceptance-criterion mapping

| Requirement | Status and evidence |
|---|---|
| Both exact original reviewer negatives | **Passed** on correction, both409 and lost response. verify.cjs compares original reviewer test suffix byte-for-byte after output-directory normalization; unchanged assertions. |
| Entire local A/v1 preservation, not falsely B/v3 | **Passed**: extended component cases compare every initial snapshot field, repeat fresh comparison, retain status/version/title/questions/sections/keys/rubric fields. Built Next checks full structured local contents. |
| Stop writes; no misleading Assign or published preview | **Passed**: Save/Publish disabled, Assign hidden, preview draft/version1, no Publication confirmed; same after cancellation. |
| Fresh authorized/denied/unavailable comparison | **Passed** in component and built Next for409/lost response. Denied/unavailable offers no discard action, preserves local input. Authorized comparison returns newer content separately. |
| Navigation/discard cancellation | **Passed**: navigation dialog dismissed without mutation; canceled discard retains complete local snapshot/version. |
| Explicit discard/reload only | **Passed**: built Next document reload adopts authorized newer title/prompt/status/version3 only after acceptance. |
| Exactly one publication POST, no blind replay | **Passed** in component and built Next; expected_version1 asserted; final posts=1. |
| Exact-success and changed-draft positives | **Passed**: exact published readback, same-version draft, denied/unavailable readback, prior QA-D03-01 newer-draft recovery and both real Next draft reload cases. |
| No force-save/merge/adoption/export/private persistence/authority weakening | **Passed within inspected change and tested recovery scope**: minimal production diff adds none; tests demonstrate preservation and onePOST. Not a forensic browser-storage or security audit. |
| Reachable server409 sequence | **Passed**, actual domain/PGlite characterization; **not authenticated browser→realAPI→DB race testing**. |
| Relevant regression/build/typechecks | **Passed** within exact counts above; not full suite. |

## RED/GREEN lineage

Original reviewer evidence at cfcd73e/56db8f9 retains **25 passing/2 failing** component cases; original logs/JSON and correction's red-exact.log were read. Both failures specifically show Save enabled when it must be disabled. Correction red/browser.json retains **2 failed** before fix; correction browser.json retains29 passing. Current QA independently executes those same two test bodies unchanged and all29 pass. Git history places production fix at a1e4c16 and only harness disclosure closing at406ee8e; tested HEAD has no subsequent production change. Verification JSON preserves these stats and empty original-evidence diff. QA did not reset or rerun old production in place, nor claim original historical RED as a new QA execution.

Frontend's two interrupted expanded-test attempts and sticky disclosure interception remain preserved upstream; not erased or called passes. Closing the disclosure before stage navigation is ordinary interaction, not forced clicking or relaxed assertion.

## Visual/accessibility scope and residual risk

Intent: an authorized author safely distinguish their preserved local draft from newer saved/published work, compare and explicitly choose discard/reload without misleading publication/assignment claims.

Individually inspected fresh screenshots: REVIEW-D03-newer-published-409.png (conflict, original draft/version1, compare and disabled controls); D03-next-published-409-cancel.png (long structured comparison preserved); D03-next-published-lost-response-recovered.png (narrow authorized newer title/prompt and published/version3 after reload). Functional assertions carry exact snapshot text where long screenshots are downscaled.

Existing sticky builder header still overlaps nearby helper text in narrow post-reload view; expanded structured comparison creates a very tall sticky area. This is the frontend-disclosed pre-existing layout limitation, not claimed fixed. Closing disclosure enables ordinary stage navigation; cancellation/recovery controls passed. Carry this usability risk to final reviewer; no new blocking functional regression confirmed here. No comprehensive visual acceptance or full keyboard/screen-reader/WCAG, other engine/device, bfcache or zoom qualification. Narrow375px overflow assertions passed only for tested states.

What's working: truthful preserved-draft provenance; comparison failure does not offer unsafe discard; complete snapshot remains in memory; explicit reload restores server content; immutable-domain and permission regressions retain their controls.

## D01–D08 disposition and limitations

- D01: bounded Chromium/component and built-Next navigation/context guards pass.
- D02: teamless freeze characterization passes, but **policy remains owner-deferred**, including exact alternate eligibility, grantor/sensitive access, expiry/revocation/no revival/closure and existing open cases. Not fixed.
- D03: REVIEW-D03-02 and prior QA-D03-01 pass this independent bounded QA.
- D04: truthful draft/published provenance and inherited reference cases pass; broader persisted historical reorder journey not newly qualified.
- D05: all3 current-attempt copy states pass; not full visual qualification.
- D06: existing exact-ID assignment handoff passes; queue remains separately deferred.
- D07: inherited member-safe feedback/validation/privacy cases and focused domain tests pass.
- D08: inherited copy provenance and immutable old-pin checks pass.

Browser transport is intercepted synthetic data, not authenticated real API/database integration. Domain fixtures are synthetic disposable PGlite, not PostgreSQL RLS/concurrency. No full-suite, populated migration, live scanner/provider/mail, penetration test, human/owner acceptance or deployment claim.

## Isolation and handoff

Environment allowlisted; env files refused; AI/SMTP/account email disabled; unreachable internal API origin; no API/worker/live-service process. Separate Playwright Chromium and renderer3275, disposable domain55439; temp/DB/storage and output destinations redirected into QA-only directory. No MAIN3100/preview3150 interaction, credential/runtime copying, install, reset/merge/push/deploy or rich-editor edits. Build's ignored generated outputs are incidental required build artifacts, not committed changes; generated tracked import drift was restored exactly. Sibling untracked artifacts preserved. Temporary synthetic fixtures retained locally, not committed; no cleanup/deletion of unrelated data. Ports free and no QA-scoped test process at finish.

Production/evidence commits and original RED remain untouched. Only QA harness/report/logs/JSON/screenshots/traces are staged. Final reviewer **t_302f1747** receives exclusive shared-worktree ownership upon QA completion; no same-card review and no new feature. Builder.js remains a collision hotspot, not edited by QA. Final reviewer must independently requalify, not treat this QA pass as owner acceptance.
