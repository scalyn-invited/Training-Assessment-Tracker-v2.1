# Final workflow implementation review — t_5bf8231e

## Decision: CHANGES REQUESTED — candidate not accepted

Reviewed branch `feature/assessment-workflow-improvements`, production candidate **2652126fe7d69e280c4e3410efd3741d91f68bcd**, with QA evidence through **156e3830cb43ee65f0538634b970f9081de70f96**. Base `f24e87c`. Original QA-D03-01 is corrected and independently GREEN; the new **REVIEW-D03-02** below blocks implementation acceptance. Review-stage completion only hands findings to the default orchestrator; it is not merge, release or owner acceptance.

## Blocking finding

### REVIEW-D03-02 — High: newer published content is mistaken for confirmation of the local version

**Code:** `apps/web/app/components/assessment-builder/builder.js:538–560`, specifically **544–546**; downstream display/actions at 428–434 and 451–466. Server version semantics: `packages/domain/src/assessment-definitions.ts:168–180,232–278`.

**Reproduction:**
1. Window A holds saved definition D, revision1/edit version1, title/questions A.
2. Another authorized window saves changed content B to D (edit version2), then publishes D (version3).
3. A attempts to publish expected_version1. Server correctly returns409; a lost response before that rejection is the second tested transport case.
4. Authorized exact-ID readback returns published D/version3/content B.
5. The UI accepts `row.version > publication.version`, updates only local status/version, clears uncertainty, and announces “Publication confirmed for this exact definition.” It retains content A, enables Save and exposes Assign. Reopening Review labels content A “Saved revision1 · published · version3”. Compare is hidden.

**Impact:** same definition ID/publication revision does not prove the attempted saved content was published. This silently re-labels an obsolete local snapshot as the published snapshot, bypasses the intended conflict stop/comparison, and exposes assignment and copy-save actions under that false premise. The database's immutable publication and assignment pins remain intact; this is **not** a claim of DB overwrite or unauthorized access. It violates D03 exact-operation recovery and D04 truthful preview provenance.

**Evidence:** both new Playwright desired-contract cases fail because Save is enabled; all25 inherited cases pass. `browser-tests/workflow.spec.ts:733–760`, `reviewer-browser.log`, `browser.json`, `screenshots/REVIEW-D03-newer-published-{409,lost-response}.png`, retained traces. Screenshot independently inspected: old title/prompts, published/version3 label, confirmation, Save and Assign are present together. Separate **real domain** `publication-race.test.ts` passes, proving normal save→save→publish yields this same-ID/version3 state and correctly rejects the original version1 publication. Browser transport is synthetic; the domain probe establishes reachability, not an authenticated end-to-end race.

**Required correction:** distinguish confirmation of the attempted exact saved version from a later published version. Under the current domain contract, publication increments the saved version once; a higher-than-expected publication cannot be silently adopted as this operation's result. Retain the entire original local snapshot/version, stop newer writes and misleading assignment/preview claims, expose fresh authorized structured comparison and explicit cancel/discard/reload recovery for the newer-published case. Do not blindly replay, force-save, overwrite local content, persist private keys to browser storage, or weaken author checks. Preserve ordinary exact-success reconciliation, newer-draft recovery, denied/unavailable readback, cancellation, one-POST behavior and current authority. Add real built-Next recovery coverage for this branch, then independent QA and re-review. No owner policy decision is needed for this implementation defect.

## Review scope and security/architecture assessment

Read AGENTS, web AGENTS, DESIGN, checklist opening/current-status, authoritative workflow-proposal/root final-review and supporting source-review. Consumed prerequisite, implementation, original failed-QA, frontend correction, backend correction and independent corrected-QA handoffs. Inspected actual base-to-candidate application/domain/migration/test changes, exact correction diff and related authority/definition/review/response code. Evidence-only commits after2652126 do not change production.

- `Access.membership` one-query change is predicate-equivalent on inspection to the prior active→available→membership checks: user/environment, active identity, production-synthetic exclusion, imported freshness, active organisation/environment-specific suspension, current membership dates/status all retained. Returns `cm.*`, no cache or permission expansion. Independent gate/query-count tests pass. Shared callers still merit PostgreSQL/RLS/concurrency qualification; PGlite is not that evidence. Backend's measured query reduction is credible; do not claim every historical timing failure's root cause is proven.
- D07 adds optional API/domain return feedback to preserve existing callers; UI requires8–4000 trimmed characters for rejection. It is encrypted separately, rejection-only at schema level, immutable under existing review triggers, projected only for current attempt/member or authorized reviewer, and never falls back to private rationale. Existing latest-attempt, sensitive grant, evidence and approval controls retained. Relevant negative/immutable tests pass.
- D08 direct-source fields are nullable for legacy records, paired, same-tenant/environment/revision foreign-key constrained and immutable. Copy creation preserves source/pins and distinct edit/publication versions. Fresh migration/domain tests pass; populated PostgreSQL lock/rollout behavior is unqualified.
- D01 page-memory guard introduces no localStorage/sessionStorage of private drafts, guards client/logout before mutation, and preserves unknown-operation stops. Chromium history/real Next behavior passes. Navigation API support outside tested Chromium and bfcache remain compatibility limits, not a universal browser guarantee.
- D04 shared numbering uses the full pinned question order; D05 current attempt ID controls approval wording without blending MCQ/rubric scores or removing authorized controls.
- API file includes unrelated formatter-only hunks; no additional semantic API change found there beyond return feedback. No new dependency, executable-code feature, broad grant, historical pin migration, live adapter or grading-rule change found.

No additional confirmed blocking security or immutable-record defect identified in this bounded review. This is not a comprehensive penetration/load test.

## D01–D08 disposition

| Item | Final review disposition |
|---|---|
| D01 | Bounded Chromium/component and fresh real Next navigation/recovery PASS. Other engines/bfcache, forced termination and full accessibility unqualified. |
| D02 | **Owner/orchestrator policy-deferred; not fixed.** Teamless appeal freeze characterization passes again. Define exact case-scoped alternate eligibility, grantor/sensitive access, expiry/revocation/no revival/closure and handling of existing open cases. No broad-role/team workaround. |
| D03 | **BLOCKED by REVIEW-D03-02.** Prior QA-D03-01 newer-draft correction passes; newer-published readback remains unsafe. |
| D04 | Preview/reference positives pass, but truthful published preview is affected by REVIEW-D03-02. Persisted reorder-to-history browser journey remains unqualified. |
| D05 | All3 state cases pass, desktop/narrow; approved current-attempt screenshot inspected. Separate90 rubric/100% MCQ and review controls retained. |
| D06 | Existing exact-ID assignment handoff passes; new queue deferred for lack of demonstrated need. This is not missing authority or an implemented queue. |
| D07 | Component/domain privacy, return guidance, validation and immutable current-attempt behavior pass. Member screenshot inspected. |
| D08 | Direct source/copy identity, replay/immutability and old pins pass. Narrow provenance screenshot and full-resolution panel inspected. |

D02 needs policy; D06 needs evidence/prioritization. Neither is the reason to reject this corrected candidate. REVIEW-D03-02 is a concrete implementation fix.

## Independent execution in this review

All commands from the approved isolated worktree. `R` = `node docs/assessment-workflow-implementation/final-review/run.cjs`; `D` = `node docs/assessment-workflow-implementation/final-review/domain-run.cjs`.

| Actual command | Result |
|---|---|
| `node docs/assessment-workflow-implementation/final-review/prepare.cjs` | Copies inherited harness into reviewer-only output directories; assertions unchanged before added negative cases. Exit0. |
| `node docs/assessment-workflow-implementation/independent-qa/final-ports.cjs` |3275/55439 free before and after. Exit0. |
| `D reviewer-focused tests/access-membership.test.ts tests/assessment-reviews.test.ts tests/assessment-definitions.test.ts tests/assessment-assignments.test.ts` | **24 passed**,4 files,81.49s,exit0. |
| `R browser reviewer-browser --trace on` | **25 passed,2 failed**,0 skipped/flaky,83.50s,exit1. Both new newer-published negatives RED; inherited cases GREEN. |
| `R domain reviewer-race --config docs/assessment-workflow-implementation/final-review/probe.config.ts` | **1 domain characterization passed**,9.17s,exit0; validates reachable version sequence, not frontend correctness. |
| `R build-web reviewer-build` | Optimized Next16.4.6 build,25 static pages,exit0. |
| `R next reviewer-next --trace on` | **3 passed**,22.34s,exit0: real router/navigation plus existing newer-draft recovery. Does NOT cover the new newer-published fix. |
| `R typecheck reviewer-typecheck` | Server tsc --noEmit,exit0. |
| `R web-typecheck reviewer-web-typecheck` | Web tsc --noEmit after generated-import restoration,exit0. |
| `node docs/assessment-workflow-implementation/final-review/retain.cjs` | Parsed actual JSON, retained traces and hashed91 evidence files before this report. `verification.json`/`manifest.json`. |
| `git diff --check`; production and parent evidence `git diff --exit-code` | Exit0; production and all4 reviewed parent-evidence directories unchanged. |

QA's separate118/21 bounded domain,25 component,3 Next and build/typecheck results were read and considered, not claimed as this review's execution. Historical158pass/16fail/2skip remain an incomplete aborted run, not a full-suite result. Corrected target requalification supersedes those cases only within the documented bound; no full-suite pass claimed.

## Isolation, evidence and limitations

Runner allowlists environment, refuses env files, disables AI/SMTP/account email, uses disposable worktree-local TEMP/TMP/TMPDIR and installed worktree browsers. Domain helpers create fresh in-memory synthetic PGlite at checked-free55439, not environment-selected real databases. Next is renderer-only3275 with intercepted synthetic transport and unreachable internal API origin; no API/worker/live delivery process. Browser tests intercept/reject unexpected destinations. No main3100/preview3150 interaction, private runtime/credential copying, native desktop, install, global change, merge/push/deploy or production migration.

Build rewrote generated next-env.d.ts imports; restored exactly to candidate text before final web typecheck. No implementation source fix. Only reviewer harness/tests/logs/screenshots/traces/report under `final-review/` are added; all sibling untracked artifacts preserved. `verification.json` records empty production and parent evidence diffs. Original RED evidence remains untouched.

Loaded sdlc-review, TDD, systematic-debugging and dogfood. ux-engine/playwright skills returned unavailable; actual installed Playwright package executed. No policy bypass attempted.

Individually inspected the new failure screenshot, upstream real-Next409 conflict screenshot/full-resolution crop, upstream D05 approved-mobile, and fresh D07/member and D08 narrow provenance/crop. Not all screenshots individually visually reviewed. No full WCAG/screen-reader, physical-device, other-engine, real PostgreSQL RLS/concurrency, populated migration, authenticated browser→real API→DB race, full-suite, live scanner/provider/mail or owner acceptance claim.

## Next responsible agent

**Default orchestrator:** route REVIEW-D03-02 to frontend with serialized shared-worktree ownership, then independent QA and reviewer requalification of the exact corrected commit. Preserve existing evidence/commits and original/new negative tests. Do not treat this final review-stage completion as implementation acceptance or begin another feature. Approval remains withheld until the blocking correction passes independent verification.
