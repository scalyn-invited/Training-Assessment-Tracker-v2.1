# Independent integrated-runtime QA — t_7b33ab54

## Verdict
**PASS for bounded source/runtime and isolated regression verification; final owner-browser acceptance PENDING.** No new confirmed product failure was observed. This handoff completes only the assigned independent verification/reporting phase and releases existing parent **default t_a9d4c15b**, not final feature acceptance. Do not promote the parent to Done until its rendered gate is evidenced. No reintegration/restart is required.

- Actual application: `C:/Users/cabas/Documents/Codex/Projects/Training Assessment Tracker V2.1`, **http://localhost:3100**.
- Branch: `ui/global-design-system`; current/resulting SHA **ff493ddbd8ad54b0535f1ca436e3233e9afa40fc**.
- Approved product SHA **bf3befe015e33d5584dcaec53d372ce5916463b9**; `apps packages tests` equal that product. No commit or application implementation change by QA.
- Consumed integration `INTEGRATION-t_4e1cf4b3.md`, actual task run154/exit event, approved lineage report, QA_RETEST.md and original regression sources. AGENTS/DESIGN/checklist and TDD, integration, browser policy, state-completeness/loading-transitions, responsive, runtime-QA and UX-auditor guidance read. Latest task's Chrome-only owner policy overrides older general Playwright preference.

## Intent and findings
Users need lightweight, authority-safe loading without stale client branding, lost keyboard position or discarded drafts. Initial animation must not hide an indefinite failure or imply an unsafe retry.

| Severity | Finding | Disposition |
|---|---|---|
| No new confirmed product defect | Executed bounded checks passed | No correction task created; no monitor graph IDs added |
| Capability limitation, not product defect | Worker tool inventory has no Chrome tab_create/tab_snapshot/tab_* | Final rendered gate handed to connected parent; no alternate owner browser used |
| Existing harness warning | esbuild CSS composition warns about panel border/min-width ordering | Retained in 03-builder.log; tests pass; not a newly demonstrated visual failure |

Preserved strengths: stable accessible loading status, explicit session-verification recovery without a second mutation, exact permission/scope rejection, editor reconciliation and guarded navigation. No speculative redesign recommended.

## Actual execution
All commands ran from the actual app checkout. Isolated component browsers used the accepted existing harness and intercepted synthetic transports, NOT localhost:3100, the owner profile or main DB. No API installation fixtures were run. Test temp directories were explicitly set through TEMP/TMP/TMPDIR to `.runtime/qa-t_7b33ab54-temp`; result directories are under `docs/loading-animation/qa-runtime-t_7b33ab54`. Free bind checks succeeded for 3110/3111/55432/3280/3281/3490/3491/55449 before tests; these component runs do not start API/database servers.

| Command | Result | Evidence |
|---|---|---|
| `git status --short`, `git branch --show-current`, `git rev-parse HEAD` | Correct branch/SHA; tracked tree clean; pre-existing untracked docs/worktrees retained | Initial tool output and QA-RUNTIME-STATE JSON |
| `python docs/loading-animation/preflight-t_0ca98965.py docs/loading-animation/QA-RUNTIME-STATE-t_7b33ab54.json` | exit0 at 04:57:53Z; process identities, health and preservation pass | QA-RUNTIME-STATE-t_7b33ab54.json |
| `node docs/loading-animation/preflight-schema-t_0ca98965.mjs > docs/loading-animation/QA-RUNTIME-SCHEMA-t_7b33ab54.json` | exit0; BEGIN READ ONLY / ROLLBACK; 33 source/33 receipts, no pending/unknown/mismatch, tenant role matches | QA-RUNTIME-SCHEMA-t_7b33ab54.json |
| `git diff --exit-code bf3befe015e33d5584dcaec53d372ce5916463b9 HEAD -- apps packages tests` | exit0 | Terminal |
| `python docs/loading-animation/qa-runtime-t_7b33ab54.py` | exit0, all five child commands exit0 | qa-runtime-t_7b33ab54/summary.json; exact command arrays recorded |
| `npx --no-install playwright test -c playwright.loading-animation.config.ts --output=<task evidence>/loading` | **22 passed** | 01-loading.log |
| `npx --no-install playwright test -c playwright.theme-picker.config.ts --output=<task evidence>/selectors` | **36 passed** | 02-selectors.log |
| `npx --no-install playwright test -c playwright.builder-workflow.config.ts --output=<task evidence>/builder` | **10 passed** | 03-builder.log |
| `npx --no-install vitest run -c vitest.appearance.config.ts` | **20 passed** | 04-policy.log |
| `npm run typecheck` | server/web exit0 | 05-types.log |
| `git diff --exit-code HEAD && git diff --check` | exit0 after regressions | Terminal |
| `python docs/loading-animation/preflight-t_0ca98965.py docs/loading-animation/QA-RUNTIME-FINAL-t_7b33ab54.json` | exit0 at 05:06:55Z; original runtime still healthy after tests | QA-RUNTIME-FINAL-t_7b33ab54.json |

Times above are UTC on 2026-11-22. Final fingerprint: `06e106638442c12309e73444e00ebce36cc5e60821f569f7afb04fadc502bb0a` (includes new evidence filenames, so not expected to equal the integration fingerprint).

## Independent persistence and source correspondence
**Passed after integration worker exit.** Kanban run154 records worker PID39512 exit0 at epoch1795323196; the QA runner independently found that PID absent. Later final inventory confirmed identical process creation times, commands, cwd, parent IDs and listener sets for supervisor/PGlite14456, API31152, worker45080, Next launcher9368 and server22308. The actual source path is the approved checkout. Listeners remain 127.0.0.1:3100, :3101 and :55431. API live/ready, web proxied ready and login HTML return HTTP200. All six recorded safety flags remain false. Historical backup1394/config-asset8 hashes match.

This is continued process availability, not reboot/service qualification. Source/process correspondence and HTML200 do not prove the in-memory renderer's feature behavior. Historical backup integrity is not proof of coverage of later writes. No stop, cache reset, database/account/data query beyond schema receipts, migration, source edit, live email, paid AI, push or deployment occurred.

## Feature checklist — separate fresh checks from owner gate
“Passed” below is only the stated isolated/source scope. **Every owner-rendered row remains Pending (not executed here).** Prior built journeys are accepted upstream evidence on byte-equal source, not fresh execution in this task.

| Criterion | Fresh independent evidence/status | Main owner-rendered gate |
|---|---|---|
| Same-workspace retained header/sidebar; centered content animation | Passed component DOM-identity/exact-authority test and centering at1440/820/390; inspected1440/390 captures | Pending actual navigation/mount behavior |
| Refresh/session spinner, no initial loading heading/card, protected content withheld | Passed session/guest status and signed-out concealment tests | Pending actual refresh/initial document |
| Switch hides outgoing content/branding; only neutral safe shell | Passed component mutation/context, guest-boundary and neutral-route tests | Pending real client/workspace switch |
| Reveal verified permissions/theme/branding together | Passed component permission invalidation/exact authority and policy20; real scope journey previously passed | Pending actual identity/client reveal |
| Sign-in validation/errors and minimal success transition | Not rerun as a real sign-in journey; existing guest/shell upstream pass on equal source; guest loading component passed | Pending secure owner sign-in/validation; never label guest Theme alone a pass |
| Animation only initially; context at about3seconds | Passed 2999/3000ms assertions; source timer only changes explanatory text, not operation completion | Pending temporal observation |
| Slow context and actionable confirmed failure; no endless spinner/blind mutation retry | Passed deadline/retry/reset and failed mutation session-verification tests | Pending safely observable recovery; do not inject main faults or repeat mutations |
| Shared styling, no fake percentage/artificial minimum wait | Passed source inspection of shared LoadingState/CSS; no completion-delay coupling or fabricated percent | Pending visual consistency |
| Reduced motion static equivalent | Passed computed animationName none at1440/820/390 | Pending actual runtime reduced-motion check |
| Accessible visually textless status; no repeated announcement/focus loss | Passed stable status, main focus on error/retry at1440/820/390, background input/node/focus preservation; popover axe checks pass | Pending actual keyboard transitions; manual screen-reader not tested |
| Save/submit indicators unchanged | Source equals accepted product; builder component save/reconciliation/guard tests pass; all-form indicator sweep not rerun | Pending representative observation; no owner-record save permission inferred |
| Responsive and both popovers | Passed36 checks including320/390/800 and short desktop, keyboard dismissal/focus/geometry; inspected320x300 overlay | Pending actual popovers and layouts |
| Account-theme consistency and FOUC | Passed source equality and appearance-policy20; previous real account and first-paint evidence retained | Pending actual /accounts and /account/security reload and palette transitions |
| Approved fresh503 fallback | Policy/source coverage passed; real outage-policy journey NOT rerun here (upstream passed) | Pending safe observational evidence; historical full suite remains22 passed/1 superseded-contract failure, NOT suite-green |
| Stale-response suppression and client isolation | Passed component context/mutation epoch and exact-permission cases; original real scope/history/identity journey upstream | Pending actual boundary rendering; exhaustive API tenant security not retested |
| Builder lifetime/save/history and unsaved guards | Passed10 component workflow checks including stale/unknown saves and Back/Forward cancellation; built lazy-host/gate journey NOT rerun here, upstream passed | Pending nonmutating actual builder observation; do not create/save owner records |

Fresh component screenshots: `loading-1440.png`, `loading-820.png`, `loading-390.png` are standard harness outputs regenerated by this run. Inspected1440/390: spinner centered in available content, retained same-context shell, no initial loading heading/card or horizontal clipping. The visible synthetic identity in these same-context fixtures is NOT permission to retain identity at a scope boundary. Selector screenshot `qa-runtime-t_7b33ab54/selectors/selector-qa-independent-combined-geometry-320x300/theme.png` shows bounded top-layer menu with scrollable choices and reachable trigger. No owner-app screenshot was captured.

## Tool errors and limitations
- `execute_code` read batching was denied by unattended approval policy before execution. Used normal read_file tools; no policy changes.
- Discovery reads for guessed `playwright.loading-next.config.ts` and `scripts/qa-expanded-server.ts` returned File not found. Located/read actual `playwright.qa-expanded.config.ts` and `tests/expanded-appearance-browser/server.ts`; no command launched using missing paths.
- Tool searches for tab_create/tab_snapshot, then browser/Chrome returned no authorized Chrome tab-control tools. **No tab_create call was possible in this worker, and no new no_browser result is claimed.** Prior parent's no_browser is historical only. No browser_exec, desktop, alternate interactive browser or connector installation was attempted.
- No full real-API/build-suite rerun, full WCAG/manual screen reader, PostgreSQL RLS/concurrency, whole-app parity, reboot persistence or human acceptance claim. Previous 503 strict assertion remains disclosed, not waived into green.

## Exact owner-browser handoff
Next owner: **connected default parent t_a9d4c15b / owner-chat session**. Keep `renderedMainVerified=false`, `runtimeVerified=false`, `finalGatePassed=false`, `ownerAccepted=false`. Do not repeat merge/restart or requeue an identical worker expecting extension access to appear.

1. Use ONLY Chrome `tab_create` at **http://localhost:3100**, then `tab_snapshot` in that session-owned tab. Confirm current source **ff493ddbd8ad54b0535f1ca436e3233e9afa40fc** before accepting captures. Report any tool error verbatim; do not switch tools/browsers. If stale lease is specifically reported, follow tool-owned new-tab recovery; cancellation is not a stale lease.
2. Verify actual rendered identity/client/permissions. If redirected to **/login**, use direct secure user sign-in; do not retrieve secrets or infer current login from an old snapshot. Preserve other tabs and unsaved drafts. Settled sign-in HTML or Theme button does not prove authenticated transitions.
3. At desktop1440, tablet820 and mobile390 (plus800 breakpoint if supported), inspect **/platform → /platform/clients**, refresh, and **/dashboard** workspace/client transitions. Observe intermediate loading as well as arrival: persistent same-workspace shell, centered initially textless spinner, no protected heading/card before authority, neutral outgoing scope, atomic destination identity/permissions/palette/logo reveal. Do not turn an unobservable fast transition into a pass; mark temporal coverage pending if tools cannot safely observe it.
4. For safely observable delayed operations, verify contextual text at approximately3seconds and useful slow copy. Confirmed failures must replace indefinite animation with an actionable verification/recovery path; never force production-like faults or blindly repeat sign-in/client mutations merely to manufacture this scenario. Existing isolated tests cover injected races/errors; actual-app temporal limitations remain explicit.
5. Navigate using keyboard and check focus during/after loading and retry, reduced-motion static presentation and status behavior. Open both Workspace and Theme popovers, test dismissal/viewport constraints without altering records. Observe **/accounts** and **/account/security** under the selected client's authorized theme and on reload; theme changes only within the owner's approved interaction scope.
6. Preserve real drafts. Inspect existing builder loading/history only where nonmutating and safe; saves/submit tests stay in isolated harness unless explicit owner authorization is added. Record exact URL, role/client (without secrets), viewport, action, intermediate/settled result and evidence for every completed row. Leave any missing row Pending, not Passed.

Only the parent can close the final gate after sufficient actual-app evidence or an explicit owner exception. This task's completion is the requested honest handoff, not deployment or final feature approval.
