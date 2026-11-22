# Independent workflow implementation QA

Task t_a93de53c — **CHANGES REQUIRED; candidate NOT accepted.**

## Frozen candidate and scope

Tested production commit **c86aa43a32081c1ad6636daf99e2463480b0caf3**, branch `feature/assessment-workflow-improvements`. Root/main/rich-editor/preview untouched. No production source was edited; all new harnesses/reports live under this directory. Upstream untracked diagnostics and archives preserved. The eventual QA evidence-only commit does not qualify a different production candidate.

Read root/web AGENTS, DESIGN, tech-stack, checklist, parent implementation handoff, authoritative workflow proposal, final audit review and source review. The supplied `designer/final-review.md` path is absent; the actual authoritative file is `docs/assessment-workflow-audit/final-review.md` in the approved main documentation tree (read only). TDD, systematic-debugging, runtime-QA, dogfood and sdlc-review skills loaded. UX Engine and Playwright skills were unavailable; actual installed Playwright executed. No skill load is fabricated.

## Reproducible product finding QA-D03-01 — P2

**Publication conflict leaves a stopped workflow without the promised comparison/recovery.**

1. Open a saved, publication-ready draft, optimistic version1.
2. Another writer saves version2 of the same draft.
3. Original tab publishes version1. Server returns409; exact-ID readback confirms status=draft, version2.
4. Observe “Publication outcome unknown: the saved version changed. Local edits are retained; reload only after comparing the current definition.”
5. The Compare control remains hidden. Save and Publish are disabled. The retained `publication` marker also makes the shared guard block ordinary link/context navigation. Only repeated status checks or a native reload/discard escape remain; the stated compare-before-reload path is unavailable.

Evidence: independent negative test appended to `browser-tests/workflow.spec.ts` (`QA-D03 changed server draft after publication conflict offers recovery comparison`), fails twice at the visible comparison assertion; `screenshots/QA-D03-changed-draft-recovery.png`; browser initial/rerun logs and retained trace. Synthetic fault injection uses actual production builder; it does not claim a live HTTP/database race. Positive controls for unchanged-draft, published, denied and unavailable readbacks all pass.

Source: `apps/web/app/components/assessment-builder/builder.js:538–555` retains `publication` for changed-version draft but does not expose `compareButton` (enabled only in save409 at505). Shared guard line571 marks this as uncertain; work-guard.ts:95–102 blocks route/context exit. No authority or immutability weakness demonstrated.

**Fix acceptance:** distinguish confirmed stale-draft conflict from unknown transport status; preserve the entire local draft; keep unsafe writes stopped; offer current-authorized structured comparison and explicit cancel/discard/reload recovery. Do not blind-republish, force-save, expose keys to unauthorized users or weaken current-authority checks. Add real RED→GREEN coverage for changed draft after409 and lost-response readback, comparison denied/unavailable, cancellation preservation, and eventual authorized recovery. Preserve existing four readback-state tests and exact-operation save replay.

## Actual execution

Commands from the isolated worktree:

- `node docs/assessment-workflow-implementation/independent-qa/run.cjs browser`: 23 tests, **21 passed / 2 failed**, 1.9m. One failure is QA-D03-01. The inherited learner test expected dirty-only `confirm` but received the correct pending/unknown `alert` after autosave had already started. Zero context POSTs were preserved. This initial timing-sensitive failure is NOT labeled product data loss.
- Same code/assertions: `.../run.cjs browser browser-rerun`: **22 passed / 1 failed**, 1.7m. All inherited22 component tests pass; new QA-D03-01 remains RED. No assertion relaxation or production fix.
- `.../run.cjs next`: initial real Next test failed after waiting60s for builder. `.../run.cjs next next-rerun`: same failure. Trace records initial page/API fixtures200 and a pending exact builder RSC request (status-1). Snapshot remained directory. **Not passed; root cause unconfirmed.** There was concurrent domain qualification; contention is a hypothesis, not a demonstrated cause. Do not substitute the parent's earlier pass for this run.
- `.../run.cjs typecheck` and `.../run.cjs web-typecheck`: server and web TypeScript both exit0.
- `.../run.cjs build-server` and `.../run.cjs build-web`: server compilation and optimized Next16.4.6 production build both exit0;25 static pages generated. This is build qualification, not deployment.
- Full domain `.../run.cjs domain` was deliberately stopped after bounded verification; exit15, no final suite JSON. The detached Windows tool wrapper reported `stdin is not a tty` while its owned Node child continued; PID/parent/command were verified before stopping only that test tree. Buffered real output was recovered as `domain.log`. Parsed completed-file summaries report **158 passed,16 failed,2 skipped**, NOT whole-suite totals. Failed files: learning-support(6), learning-plans(3), programme-generation(4), learning-kpis(3). Several cases hit approximately30s, others failed sooner; repeated TimeoutOverflowWarning also appears. Causes were NOT established; these are outstanding regression failures, not waived as infrastructure. Initial database isolation check passed; a second attempted run was refused at the occupied test port before writing fixtures. No competing domain run was started.
- Then serialized `.../run.cjs domain domain-focused tests/assessment-reviews.test.ts tests/assessment-definitions.test.ts tests/assessment-content.test.ts tests/assessment-scoring.test.ts tests/assessment-assignments.test.ts tests/assessment-responses.test.ts`: **40 passed in6 files,163.68s, exit0**, fresh PGlite. `domain.json` is this focused result, not full-suite evidence. D02 freeze reproduced; D07 encrypted/immutable/current-attempt public feedback/privacy and D08 durable copy provenance/unchanged pins pass.
- A third unchanged Next invocation, `.../run.cjs next next-serialized`, after domain completion still timed out at the same builder assertion. Thus concurrent domain execution alone does not explain the failure. All three failures remain unqualified; final trace copied to `traces/next-serialized/`. Restore this integrated qualification in the correction loop before acceptance.

Harness copies preserve original assertions/imported production components, changing only screenshot destinations. New configs anchor cwd to this worktree. `prepare.cjs` recreates inherited harness copies and would overwrite the appended negative test; do not rerun it on the delivered reproduction without retaining that test. Full domain runner strips inherited environment, verifies no `.env` files, supplies no database URLs or credentials, disables live adapters, and uses fresh in-memory PGlite. TEMP/TMP/TMPDIR point to `.runtime/independent-qa-temp` (verified via Node). Next uses its existing allowlisted renderer-only launcher, port3275, no API/worker/DB, API origin127.0.0.1:9; component transport is entirely intercepted. No main3100/preview3150 interaction, personal DB, live SMTP/provider, native desktop, install, push, merge or deployment.

## Acceptance matrix / D01–D08

| Item | Independent disposition |
|---|---|
| D01 | Component positives pass on unchanged rerun: dirty author/reviewer/learner retention, context/logout ordering, unknown-save blocking, Back/Forward, confirmed clean-state recovery. Learner test has a reproduced autosave timing race. Real Next integrated route/history qualification timed out twice and remains unqualified here. |
| D02 | Explicit policy deferral retained. No teamless alternate workaround implemented or approved; eligible case-bound authority/grant/revocation and existing-case recovery remain orchestrator/owner decisions. |
| D03 | **FAIL QA-D03-01**. Four existing reconciliation states, stale-save comparison and same-operation save replay pass; changed-version publication conflict recovery does not. |
| D04 | Component preview labeling, non-recording behavior, shared section/question references and pinned-history rendering pass. Not a fully persisted browser reorder-to-history journey. |
| D05 | All three states pass on desktop and375px: current approval, pending attempt, newer attempt with prior approval; review controls and separate scores preserved. |
| D06 | Existing exact-ID assignment destination passes. New queue remains evidence-deferred; no new counts/authority claimed. |
| D07 | Component separate member-safe guidance, required validation, payload separation, no released grade, private reviewer retention and clean receipts pass. Domain result below governs persistence qualification. |
| D08 | Component direct source/new revision/edit-version identity, reload fixture and375px wrapping pass. Domain result below governs immutable provenance and old pins qualification. |

## Screenshots and limits

20 fresh component screenshots indexed in `screenshots-index.json`; contact sheet is an overview only. Individually inspected QA-D03-01, D05 current-approved mobile and D08 narrow provenance (including original-resolution crop). D05 wording is accurate, rubric90 remains separate from objective100%; sampled375px provenance wraps without clipping. Other screenshots have automated assertions and contact-sheet overview, NOT individually certified visual review. No successful fresh integrated Next screenshot is claimed.

PGlite does not qualify PostgreSQL RLS/concurrency/populated deployment migration. No authenticated browser→realAPI→DB journey, full screen-reader/WCAG/physical-device qualification, other browser engines/bfcache, live scanner/provider/mail or owner acceptance. Forced tab termination cannot preserve page-memory work. Findings are bounded to this candidate and actual tests.

## Handoff

QA stage produces actionable failure evidence, **not candidate acceptance**. Notify default orchestrator to route the ordinary correction loop before final acceptance. Existing reviewer child t_5bf8231e must retain this FAIL and the unqualified Next check; no merge/deployment approval is inferred. No fresh user permission needed for ordinary scoped regression correction. D02 remains a separate policy question, not a license to broaden authority.
