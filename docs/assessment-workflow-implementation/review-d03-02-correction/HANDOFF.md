# REVIEW-D03-02 correction — implementation-stage handoff

Status: implementation and bounded self-qualification complete; independent QA/reviewer acceptance remains pending. No further feature started.

## Exact revisions and scope

- Starting rejected candidate evidence HEAD: `56db8f9a320a55af714e10b66fadee72a284ea47` (production candidate `2652126fe7d69e280c4e3410efd3741d91f68bcd` remains NOT accepted).
- Production correction commit: `a1e4c16d2096076b4111cd3669396dfd4661d939`.
- Exact final tested implementation/harness commit: **`406ee8eb0988e82ed3b9c7bbd5c4a1486636fb34`**. The latter changes only the test's disclosure-close interaction. All final checks below run at this HEAD. Evidence is committed separately after this report; its exact ID is in the Kanban completion metadata.
- Only production file changed: `apps/web/app/components/assessment-builder/builder.js` (hotspot; ownership now hands to serialized QA then reviewer). Harness/source additions live only in this new correction directory. No domain/API/schema/policy changes.

## Cause and correction

Authorized same-ID publication readback previously accepted any version greater than the attempted version. Domain `publish` increments version exactly once; therefore v3 cannot confirm the attempted saved v1. Reconciliation now requires published version === attempted version + 1. A later published version uses the existing conflict stop and authorized comparison flow, without changing any local snapshot field or version. Save/publish remain disabled, Assign stays hidden, preview retains draft/v1 provenance; no implicit adoption, mutation replay, merge, export or browser persistence. Explicit discard/reload is the only adoption path tested. Ordinary exact-success and newer-draft recovery remain green.

## Reproducible commands and actual results

All commands run from this isolated worktree. `R` means `node docs/assessment-workflow-implementation/review-d03-02-correction/run.cjs`; `D` means the same directory's `domain-run.cjs`.

| Command | Actual result |
|---|---|
| `node docs/assessment-workflow-implementation/review-d03-02-correction/prepare.cjs` | Copied reviewer harness into NEW output destinations; original tests/evidence untouched. |
| `R browser red-exact --grep 'REVIEW-D03' --trace on` before production edits | **2 failed**, Save incorrectly enabled in both 409 and lost-response scenarios. Exit1. `red-exact.log`, `red/browser.json`, `red/screenshots`, `red/traces`. |
| `R browser green-exact --grep 'REVIEW-D03' --trace on` after minimal fix | **2 passed**, exit0. `green-exact.log`. |
| `R browser green-components-final --trace on` at406ee8e | **29 passed**, no skip/flaky/failure,82.915s. Includes25 inherited cases,2 exact reviewer negatives and2 extended newer-published recovery cases. |
| `D focused-final tests/access-membership.test.ts tests/assessment-reviews.test.ts tests/assessment-definitions.test.ts tests/assessment-assignments.test.ts` | **24 passed**,4 files,60.09s,exit0. |
| `R domain race-final --config docs/assessment-workflow-implementation/review-d03-02-correction/probe.config.ts` | **1 passed**,11.30s overall,exit0. Actual domain save A/v1→save B/v2→publish B/v3 and stale A publication409. |
| `R build-web build-final` | Optimized Next16.4.6 build,25 static pages,exit0. |
| `R next next-final --trace on` | **5 passed**,45.540s,exit0. Inherited3 plus2 newer-published409/lost-response built-Next reload cases. |
| `R typecheck typecheck-final` | Server TypeScript,exit0. |
| `R web-typecheck web-typecheck-final`; `R web-typecheck web-typecheck-restored` | Both exit0; build-generated next-env.d.ts imports restored exactly to committed text before final check. |
| `node docs/assessment-workflow-implementation/independent-qa/final-ports.cjs` |3275 and55439 free before and after; final output in `final-ports.log`. |
| `python .../process-check.py`; `git diff --check`; `node .../retain.cjs` | No matching correction-owned processes; clean diff; JSON stats and original-evidence/production tracked-diff verification in `verification.json`. |

## Added recovery assertions

For both409/lost response: fresh authorized/403-denied/network-unavailable comparison; no discard button on unavailable comparison; entire original local initial state including status/version/revision, title, questions, choices, sections/instructions, keys, criteria/threshold; navigation cancellation; discard cancellation; repeated fresh comparison unchanged local snapshot; exactly one publication POST; disabled Save/Publish; hidden Assign; no false published preview. Real built Next additionally reloads only after accepted discard, loads other author's title/prompt/status/version, and exercises narrow375px lost-response recovery. Transport remains intercepted synthetic fixtures.

## Intermediate failures preserved

Two expanded-component runs hit outer tool wall clocks (180s and420s); buffered runner logs/complete JSON were not emitted. The retained `interrupted/traces` contains actual Playwright error contexts: long expanded structured-comparison `<pre>` in sticky header intercepted the new test's Details click, reaching90s test timeout. Corrected the harness to close the disclosure with its ordinary summary click before changing stages; no forced click, assertion removal or deadline increase. Final29-case run passes. This existing large-disclosure/sticky-header interaction is not claimed fixed or full UX-qualified. Original reviewer RED and earlier unrelated evidence remain unchanged; `verification.json` records empty original-evidence diff.

## Isolation, visual scope, limitations and deferrals

Allowlisted environment; env files refused; AI, SMTP and account email disabled. Disposable worktree-local synthetic PGlite/storage at checked-free55439; renderer-only3275 with unreachable internal API and intercepted synthetic transport. No main3100/preview3150 interaction, real API/worker launch, credential/runtime copying, install, policy change, merge/reset/push/deploy or production action. Worktree source/history and sibling untracked artifacts preserved. Generated Next build remains ignored; test artifacts retained deliberately, no deletion of sibling/runtime records. No correction-owned test processes or isolated listeners at handoff.

Inspected actual `D03-next-published-lost-response-recovered.png`: authorized newer content and published/version3 appear only after reload, new prompt visible, Assign available. Narrow screenshot retains an existing sticky-header overlap near help copy; no claim all UI/screenshots visually qualified. Automated narrow overflow assertions pass. Playwright Chromium, not native desktop, other engines/devices, screen readers or full WCAG. Domain race proves reachability/server409, **not authenticated browser→real API→DB race qualification**. No full suite, PostgreSQL/RLS/concurrency, live scanner/provider/mail, security audit, human review or owner acceptance claim.

D02 case-scoped teamless alternate policy/handling of existing open cases remains owner-deferred and unimplemented. D06 queue is separately deferred; neither is silently resolved here.

Next owner: pre-created independent QA `t_cbf911da`, then reviewer `t_302f1747`. Copy harness to QA-only outputs before running; never overwrite this correction or original final-review evidence. Completion releases QA only, not overall acceptance.
