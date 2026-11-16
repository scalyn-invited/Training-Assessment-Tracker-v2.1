# Independent correction QA — t_98f7918e

## Verdict

**PASS for the specified bounded correction/requalification gates; ready for existing final reviewer t_5bf8231e. Not candidate acceptance, owner approval or deployment authorization.** No failed, blocked or skipped case in the executed batches. No full-suite pass is claimed. D02 remains policy-deferred and D06 queue-deferred, separately from corrected defects.

### Exact provenance

- Frozen candidate: `2652126fe7d69e280c4e3410efd3741d91f68bcd`.
- Frontend correction: `35f760d44667e06e3ede9d1dd94cd61ea2ed7c61`; handoff `3b6a53e000ef715856e5d2192ac6e71e5ef9126c`.
- Backend correction: `7cfe30212491f92c14255b0b288299acbf584695`; evidence `2652126fe7d69e280c4e3410efd3741d91f68bcd`.
- Independent execution/harness/screenshots/traces: `7ba940b6bed508bc664914776fafb5dd5891d74b`.
- Independent raw execution/isolation logs: `ffbacb73fd5c56ca2091c4831d9d8d1b4f53ecb7`.
- Original RED evidence retained at `066195288b0b437e825c8e84607b4611f2bbb727`; original candidate `c86aa43a32081c1ad6636daf99e2463480b0caf3` is not retroactively accepted.

Read both exact parent handoffs and correction diffs, original QA handoff, root/web AGENTS, complete FEATURE_CHECKLIST and DESIGN. Loaded dogfood, training-tracker-runtime-qa and sdlc-review. `playwright` and `ux-engine` skills returned unavailable; actual installed Playwright was executed. Generic execute_code was denied in unattended mode; no configuration change/bypass attempted. Ordinary file/terminal tools supplied the evidence.

## Isolation and preservation

Only the supplied worktree/branch `feature/assessment-workflow-improvements` was used. `freeze.json` captures HEAD, production tree and initial untracked state before execution. Independent copies change harness output locations only, leaving inherited assertions and timeouts intact. **Original prepare.cjs was not run**; the appended negative remains intact. Tests were serialized; test ports3275/55439 were verified free before use and after completion. Renderer-only Next uses3275, real RSC/router, intercepted synthetic API transport and no API/DB/worker service. Component transport uses secure intercepted synthetic origin. Domain fixture creates fresh in-memory PGlite; runner allowlists environment, refuses .env files, disables AI/SMTP/account-email and verifies TEMP/TMP/TMPDIR under new worktree-local directories. No live adapters, credentials, real database/storage copying, main3100/preview3150 service/browser interaction, native desktop, install, merge, push or deployment.

Build regenerated only `apps/web/next-env.d.ts` imports from dev to build type paths. Restored those generated imports to exact candidate text and reran web typecheck successfully. Final production/apps/packages/tests/scripts diff is empty; original independent-QA and both parent evidence directories unchanged. Pre-existing untracked files remain present. No application implementation correction by QA. `results-summary.json` records post-execution preservation, and `manifest.json` hashes evidence as captured before local evidence commits.

## Actual commands and outcomes

Run from the approved worktree. `R` below means `node docs/assessment-workflow-implementation/correction-qa/run.cjs`; `D` means `node docs/assessment-workflow-implementation/correction-qa/domain-run.cjs`.

| Actual command | Actual result | Exit |
|---|---|---|
| `node docs/assessment-workflow-implementation/correction-qa/prepare-independent.cjs` | Frozen candidate and independent harness copies |0|
| `node docs/assessment-workflow-implementation/independent-qa/final-ports.cjs` |3275/55439 free, before and after|0|
| `R browser browser --trace on` |25 passed,0 failed/skipped/flaky;137.472s|0|
| `R build-web build-web` |Optimized Next16.4.6 build,25 static pages|0|
| `R next next --trace on` |3 passed,0 failed/skipped/flaky;21.462s, fresh process|0|
| `R typecheck typecheck` |Server tsc --noEmit|0|
| `R web-typecheck web-typecheck` |Web tsc --noEmit|0|
| `R build-server build-server` |Server tsc compilation|0|
| `D targets tests/learning-support.test.ts tests/learning-plans.test.ts tests/programme-generation.test.ts tests/learning-kpis.test.ts` |27 passed in4 files;240.39s|0|
| `D assessment tests/assessment-reviews.test.ts tests/assessment-definitions.test.ts tests/assessment-content.test.ts tests/assessment-scoring.test.ts tests/assessment-assignments.test.ts tests/assessment-responses.test.ts` |40 passed in6 files|0|
| `D authority tests/access-membership.test.ts tests/tenancy.test.ts tests/historical-authority.test.ts tests/enrolments.test.ts tests/administration-version.test.ts tests/approved-feed.test.ts` |24 passed in6 files|0|
| `D affected tests/onboarding.test.ts tests/delivery.test.ts tests/learning-grading.test.ts tests/learning-lifecycle.test.ts tests/mock-identity.test.ts` |27 passed in5 files|0|
| `R web-typecheck web-typecheck-final` |Passed after generated-import restoration|0|
| `node docs/assessment-workflow-implementation/correction-qa/summarize.cjs` |Parsed actual JSON, retained traces, computed hashes and verified preservation|0|
| `git diff --check` |Passed before evidence staging|0|

**Domain total:118 passed across21 explicitly selected files,0 failed/0 skipped.** This is bounded affected regression, not the complete suite. `results-summary.json` includes every actual test name/status/duration; individual JSON and logs retain source results. Target breakdown: learning-support8, learning-plans6, programme-generation9, learning-kpis4. Previously timing-sensitive plans overlapping-approval case passed17943ms against unchanged30s deadline. Backend query-count and same-transaction current-authority boundary tests pass independently.

The original aborted broad run's158pass/16fail/2skip remain completed-file summaries, not total-suite results. The corrected candidate's four target files now independently pass; this does not prove the exact root cause of every historical failure or TimeoutOverflowWarning. No prior failure evidence was deleted or relabeled.

## Required gate matrix

| Gate | Status and evidence |
|---|---|
| QA-D03-01 original independent negative |**Passed** unchanged behavior assertion now GREEN; browser25th case; original RED retained separately.|
|409 and lost-response same-ID/newer-draft recovery|**Passed** component and real Next. Writes stop; confirmed stale draft is not incorrectly labeled unknown.|
|Authorized structured comparison and local preservation|**Passed** complete local ID/version/title/questions/sections/criteria/answer keys remain exact; saved snapshot shows version2 separately. No automatic merge/adoption.|
|Denied/unavailable comparison|**Passed** both outcomes in both recovery modes; unavailable notice and no discard control.|
|Cancel and explicit authorized recovery|**Passed** ordinary-link cancel and discard cancel preserve content. Real document reload only after accepted discard loads authorized title/edit version2. Exactly one publish POST, pinned original ID/expected_version1; no blind replay/force-save.|
|Positive reconciliation controls|**Passed** published, unchanged-draft, denied and unavailable readbacks; stale-save comparison and exact-operation save replay before newer typing.|
|Inherited22 component cases|**Passed** all unchanged; learner initial autosave timing race did not recur. Earlier race remains a timing observation, not data loss.|
|Real Next navigation/history|**Passed** fresh optimized build followed by real next start, unchanged original assertions/deadlines. Clean SPA navigation and dirty sidebar/history cancellation plus recovery reloads.|
|Learning regressions and authority|**Passed** bounded27 target +24 authority +27 affected tests, no assertion/deadline relaxation.|
|Focused assessment domain|**Passed**40 cases including current authority, exact revision, immutable/encrypted decisions and member-safe projection.|
|Typechecks/build|**Passed** server/web and both builds; web rechecked after generated-file restoration.|
|Production/source evidence preservation|**Passed** empty diffs against frozen production candidate and original RED evidence; sibling untracked files retained.|

### Next diagnosis interpretation

Upstream measured cold dev compilation at47,041.854ms in a failed repeat and retained pending RSC traces. The corrected harness separates optimized build from timed route qualification, rather than increasing the60s builder assertion or substituting fake RSC. Independently observed fresh built-runtime navigation3.1s,409 recovery6.4s and lost-response recovery5.7s. Thus real Next integrated qualification is restored for this candidate. This is **not** a claim to have fixed Next's development compiler, reproduced every historical delay, or proven concurrency alone caused the earlier three failures. Original traces remain unchanged.

## D01–D08 disposition

- **D01 — Passed within scope:** author/reviewer/learner work guards, context/logout ordering, uncertainty stop, clean transitions and real Next route/history. Other engines/bfcache and physical devices not tested.
- **D02 — Policy-deferred:** existing freeze characterization remains; no teamless alternate authority workaround or grant expansion.
- **D03 — Passed:** QA-D03-01 corrected and independently GREEN with negative-authority, cancel, exact-operation and real reload recovery controls.
- **D04 — Passed component/domain scope:** preview disclosure, shared references and pinned-history rendering. Fully persisted browser reorder-to-history journey not tested.
- **D05 — Passed:** all three approval/pending/newer-attempt states at desktop/mobile, review controls and separate scores preserved.
- **D06 — Existing exact-ID handoff passed; queue-deferred:** no new queue/count/authority claim.
- **D07 — Passed component/domain scope:** separate safe return guidance, validation/private rationale separation, no released grade, encrypted/immutable feedback and current-attempt authority.
- **D08 — Passed component/domain scope:** direct copy-source/new revision/edit-version identity, reload fixture and narrow wrapping; immutable provenance and old assignment pins retained.

## Screenshots, traces and limits

Fresh screenshots in `screenshots/`, all browser traces in `traces/browser/` and real Next traces in `traces/next/`. JSON provides precise screenshot/test correspondence. Individually inspected:
- `D03-next-409-cancel.png`, including full-resolution crop: local revision1/edit version1, explicit stopped publication conflict, visible Compare, author-only structured snapshot warning; neither version overwritten.
- `D03-next-lost-response-recovered.png`:375px layout, authorized newer title, edit version2, draft-not-published, usable Save; provenance wraps without visible clipping.
- `D05-current-approved-attempt-mobile.png`: Approved result, rubric90 distinct from multiple-choice100%, retained human review controls and separate safe/private fields; no visible clipping.

Other images have automated assertions, **not** an individually certified visual review. Full-page comparison image includes scroll/sticky-layout whitespace; this is not comprehensive visual certification. Narrow comparison overflow is asserted. Full keyboard/screen-reader/contrast/WCAG2.2AA audit is **Not Tested** in this correction run.

Additional **Not Tested** qualification: real PostgreSQL RLS/concurrency, populated deployment migrations, authenticated browser→real API→DB publication race, full suite, live scanner/provider/mail, other browsers and physical devices. PGlite and synthetic transport do not substitute for those. Forced tab termination cannot preserve page-memory work. No new release-blocking failure observed in the executed scope; these limits remain explicit, not passed by inference.

## Handoff

Existing final reviewer **t_5bf8231e** must consume this corrected-candidate evidence and perform final review, especially fresh membership SQL predicate equivalence/current authority. Completion of this QA card releases that stage as evidence only. Final candidate acceptance and any release remain with authorized reviewer/owner; D02 policy and D06 queue deferrals stay separate. No replacement reviewer card, merge, push or deployment.
