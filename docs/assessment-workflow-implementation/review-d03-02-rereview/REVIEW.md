# Final independent requalification — t_302f1747

## Decision: APPROVED WITH NON-BLOCKING FINDINGS (bounded implementation review)

**REVIEW-D03-02 is corrected.** Independent QA passed and this reviewer independently reproduced GREEN for both original negatives and the required recovery/regression cases. Prior QA-D03-01 remains corrected. This approves the bounded implementation reviewed here, not owner acceptance, overall parity, merge, deployment or release. Original candidate `2652126fe7d69e280c4e3410efd3741d91f68bcd` remains rejected historically; its failures are not erased.

- Branch: `feature/assessment-workflow-improvements`; ancestry to `f24e87c` verified.
- Exact tested HEAD / upstream QA evidence: **`e920b19152f355ba37cd375d247f25cd5642b379`**.
- Exact production correction: **`a1e4c16d2096076b4111cd3669396dfd4661d939`**.
- Frontend final tested harness: `406ee8eb0988e82ed3b9c7bbd5c4a1486636fb34`; frontend evidence `03949a624b0354efbd32008e8c9dd0f7cc1238ef` (artifact commit `78fa02422a5442628b0c6b7ed69b4285d29fcc6d`). Production bytes identical through tested HEAD.
- Fresh reviewer evidence commit is recorded on this card's completion transition; this report and all fresh evidence reside in `docs/assessment-workflow-implementation/review-d03-02-rereview/`.

## Scope and reasoning

Read live frontend t_b2de6441 and independent QA t_cbf911da cards and handoffs; no QA correction child exists. Read AGENTS, discovered web AGENTS, DESIGN, checklist current status/assessment ledger, approved MAIN-tree designer/workflow-proposal.md and root final-review.md read-only, and original final-review/REVIEW.md. Reviewed exact production diff and surrounding save/publish/comparison/navigation-guard implementation and actual domain version contract. No source implementation edit by reviewer; build-generated imports were restored to committed text.

The sole production change since rejected candidate is `apps/web/app/components/assessment-builder/builder.js` (6 inserted/4 removed lines). At **538–562**, exact-ID published readback confirms only `row.version === publication.version + 1`. At **552–556**, later draft OR publication enters conflict without adopting any local field/version. This matches the domain's locked exact-version check and single increment at `packages/domain/src/assessment-definitions.ts:232–278`; intervening save consumes an increment, so B/v3 cannot confirm A/v1. There is no new domain/API contract, policy, migration, dependency, permission or grading change.

Conflict stops Save/Publish (builder **461–465**, **484**, **565**), preserves original draft status so Assign stays hidden, and retains truthful draft/v1 preview (**428–466**). Fresh comparison (**512–532**) obtains currently authorized same-ID data, renders it as text separately from local data, and offers discard/reload only after successful comparison and explicit confirmation. Cancellation does not mutate state. Guard **578** treats conflict as protected work. No force-save, blind publication replay, automatic merge/adoption/export or private browser persistence added. Existing permission checks are not replaced by UI visibility. No newly confirmed blocking security, compatibility or reliability defect found in this bounded change.

## Acceptance evidence

Both transport branches (409 and lost response) now preserve complete A/v1 after B/v2 is published as B/v3. The component cases assert every original snapshot key, repeat comparison after cancellation, stop writes, hide Assign, reject misleading publication confirmation and retain draft/v1 preview. They cover denied and unavailable comparison, subsequently authorized fresh comparison, navigation cancellation, discard cancellation and exactly one publication POST. Built-Next cases additionally assert expected_version1 and actual document reload to authorized B/v3 only after explicit discard acceptance; narrow lost-response coverage is included. Exact-success published/v2, unchanged draft, unavailable/denied readback, newer-draft recovery and original QA-D03-01 remain GREEN.

Original reviewer negatives are byte-identical after output-path normalization (`verify.cjs` enforces marker presence and exact suffix equality). Original final-review JSON retains25 passes/2 failures; frontend red/browser.json retains2 failures and red-exact.log shows Save incorrectly enabled in both cases. Frontend GREEN29 and QA GREEN29 were parsed and compared with this review's fresh GREEN29. Original evidence `cfcd73e52384f190d6acc13e002643f383ef99b8` / `56db8f9a320a55af714e10b66fadee72a284ea47` and upstream correction/QA directories remain unchanged. Historical RED is audited, not falsely represented as a fresh old-code execution. Frontend's interrupted expanded-test runs remain preserved; closing the long disclosure before stage navigation uses ordinary interaction, not forced clicks or weakened assertions.

## Checks actually executed

All from the isolated worktree. `P=docs/assessment-workflow-implementation/review-d03-02-rereview`, `R=node $P/run.cjs`, `D=node $P/domain-run.cjs`.

| Command | Result |
|---|---|
| `node $P/prepare.cjs` | Copied assertion-identical QA harness into fresh reviewer output destinations; refuses overwrite. |
| `node docs/assessment-workflow-implementation/independent-qa/final-ports.cjs` before/after |3275 and55439 free both times; separate ports-before.log / ports-after.log. Helper's static phrase 'after QA' also appears in before log; invocation order defines boundary. |
| `R browser reviewer-components --trace on` | **29 passed**,0 failed/skipped/flaky;109438.954ms,exit0. Includes inherited25, original2 negatives,2 extended published cases. |
| `D reviewer-focused tests/access-membership.test.ts tests/assessment-reviews.test.ts tests/assessment-definitions.test.ts tests/assessment-assignments.test.ts` | **24 passed**,4 files,0 failed/pending,exit0; reviewer-focused.json/log. |
| `R domain reviewer-race --config $P/probe.config.ts` | **1 passed**,12.60s,exit0. Real domain A/v1→B/v2→B/v3 then original publication rejects409/definition_changed. |
| `R build-web reviewer-build` | Fresh optimized Next16.4.6 build,25 static pages,exit0. |
| `R next reviewer-next --trace on` | **5 passed**,0 failed/skipped/flaky;47761.806ms,exit0. Original3 plus2 newer-published cases. |
| `R typecheck reviewer-server-typecheck` | Server tsc --noEmit,exit0. |
| `R web-typecheck reviewer-web-typecheck`; `R web-typecheck reviewer-web-restored` | Both exit0; second after exact restoration of generated next-env imports. |
| `python $P/process-check.py` | No reviewer-scoped node/Chromium processes; inherited JSON key says qa_owned_processes, filter actually uses rereview scope. |
| `node $P/verify.cjs` | Parses counts/RED lineage; unchanged original negatives; empty production/upstream evidence/tracked diffs; hashes retained artifacts. |
| `git diff --exit-code`; `git diff --check`; `git merge-base --is-ancestor f24e87c HEAD` | All exit0 before reviewer evidence staging. |

No test invocation failed in this stage. Generic execute_code was denied by unattended policy and did not execute; ordinary approved tools used, no policy changes. Raw Next build log retains its original trailing-space progress lines; these are evidence output, not source lint errors. Fresh traces are retained under runtime-browser-results and runtime-next-results.

## D01–D08 disposition

| Item | Disposition |
|---|---|
| D01 | Bounded Chromium/component and real built-Next navigation/context guards pass; other engines, bfcache and full accessibility unqualified. |
| D02 | **Owner policy-deferred, not fixed.** Teamless freeze characterization passes. Exact case-scoped teamless alternate eligibility, grantor, sensitive access, expiry, revocation/no revival, closure and handling of existing open cases still require policy. No broad-role/team workaround. |
| D03 | **REVIEW-D03-02 resolved** within required scenarios. Prior QA-D03-01 newer-draft recovery preserved. |
| D04 | Truthful local versus published provenance restored; inherited references/history tests pass. Full persisted reorder-to-history browser journey not newly qualified. |
| D05 | All3 current-attempt wording states pass; separate scoring/authorized review controls retained. |
| D06 | Existing exact-ID assignment handoff passes; **queue separately deferred**, not implemented or silently conflated with D02/D03. |
| D07 | Inherited member-safe guidance/privacy/validation cases and focused domain review tests pass. |
| D08 | Inherited copy/source provenance and old-pin/immutable definition checks pass. |

## Non-blocking findings and limits

**Low, existing visual usability limitation:** sticky builder header overlaps nearby helper copy in narrow post-reload view; expanded private structured comparison makes the sticky area very tall. Observed in fresh screenshot and upstream failed harness evidence. Closing disclosure restores ordinary stage navigation; tested comparison/cancel/discard controls remain operable. Retain for orchestrator prioritization; not claimed fixed and not a new functional blocker to this narrowly scoped correction. No visual redesign requested here.

Individually inspected fresh REVIEW-D03-newer-published-409.png: conflict text, original draft/version1, Compare, disabled writes and no Assign; and D03-next-published-lost-response-recovered.png: authorized newer title/prompt, published/version3 and Assign after reload, with helper-text overlap. DOM assertions establish disabled state/exact content; screenshots alone do not prove authority or all stored fields. Not every screenshot independently inspected.

Browser transport is intercepted synthetic data. Actual domain409 characterization establishes reachability/server rejection, **not authenticated browser→real API→DB race qualification** or real concurrent transactions. Disposable in-memory PGlite is not PostgreSQL RLS/concurrency. No full suite, populated migration rollout, full WCAG/screen reader, other engine/device, penetration/load test, live scanner/provider/mail, owner acceptance or release claim. Earlier broader QA results are not recounted as this review's execution.

## Isolation, cleanup and handoff

Allowlisted environment, env files refused, AI/SMTP/account email disabled, unreachable internal API origin. Renderer-only3275 and synthetic disposable domain55439; no API/worker/live-service launch. Test temp/output paths scoped to this fresh directory; no credential/runtime copying, install, main3100/preview3150 interaction, native desktop, sibling worktree edits, reset/merge/push/deploy or production migration. Ports free and reviewer-scoped processes absent at finish. Own synthetic temp directories retained uncommitted; all sibling untracked artifacts preserved. Build's ignored outputs remain incidental build artifacts. Build-generated tracked next-env.d.ts restored exactly and re-typechecked; no final production diff.

**Next responsible agent: default orchestrator.** Record this bounded corrected-implementation approval and remaining D02/D06 deferrals/visual limitation; no further feature begun or correction task needed. Independent QA is already complete at t_cbf911da; final re-review does not substitute for future broader qualification or owner acceptance. `builder.js` remains a collision hotspot; reviewer made no implementation change. This separate review-stage card completes normally, not same-card request_changes/review.
