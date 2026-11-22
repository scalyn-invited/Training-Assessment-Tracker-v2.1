# Loading animation main-app integration — t_a9d4c15b

## Status and exact lineage

**Source integrated and runtime restarted; final owner-Chrome rendered checks and independent post-worker-exit persistence verification remain OPEN.** Next owner: default (parent/orchestrator). Not overall Done or owner acceptance.

Actual checkout: `C:/Users/cabas/Documents/Codex/Projects/Training Assessment Tracker V2.1`, branch `ui/global-design-system`, URL **http://localhost:3100**. Original HEAD `ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e`; accepted/integrated HEAD **ff493ddbd8ad54b0535f1ca436e3233e9afa40fc**. Product matches **bf3befe015e33d5584dcaec53d372ce5916463b9** exactly under apps/packages. Review t_ea348e19 approved this bounded lineage; see REVIEW.md. No unrelated merge, literal-main switch, remote push or deploy.

## Feature checklist

| Feature | Accepted evidence | Integration | Actual rendered main app |
|---|---|---|---|
| Same-workspace stable chrome/content spinner | REVIEW.md navigation + loading22 | exact accepted source | OPEN, parent Chrome |
| Initial session/refresh centered theme-safe spinner, protected content withheld | held-context/components | exact accepted source | OPEN |
| Neutral client/workspace transition, atomic authorized reveal | scope/history/races + temporal | exact accepted source | OPEN |
| Sign-in errors retained then minimal transition | original guest journey + reviewed handlers | exact accepted source | OPEN |
| 3000ms contextual text, actionable errors, accessible status/reduced motion | loading22, deadline/recovery | exact accepted source | OPEN |
| Focus, builder lifetime/save/history and unsaved-work safety | unchanged temporal regression, builder gates | exact accepted source | OPEN |
| Existing FOUC/503, popovers and account theme preserved | review selectors36/policy20/account and outage | lineage retained; policy20 rerun | OPEN |

No feature code was authored during integration; TDD implementation/RED-GREEN evidence remains upstream. No fresh browser fixture suite ran against main data. Independent isolated builds and browser results in REVIEW.md are attributed upstream, not claimed as integration reruns. Historical full first-paint remains 22 pass/1 superseded-contract assertion failure, not suite-green.

## Preservation and controlled restart

Verified main tracked tree clean and still at expected base before mutation; inspected ancestry and full changed-file scope. Packages, API, worker, migrations, dependency manifests and dev launcher are unchanged. Existing untracked documentation and other worktrees were left untouched; all other Git refs verified unchanged afterward.

Read-only before/after checks: all **33** migration receipt hashes match source; **31 users / 3 organisations** and full-row digests for these two tables match exactly. This is bounded continuity, not all-table equality. No fixtures, reseed, migration change or external database imported.

Revalidated old process creation times, cwd and parent chain: supervisor15308, API38384, worker43180, Next40756/server51864. Terminated only identified Next children; established supervisor child-exit shutdown closed PGlite and removed its active lock. Verified all five exited before cold copy. Preserved **1394** backup file hashes, verified at copy and after restart, under `.runtime/loading-backup-t_a9d4c15b/data/`; private manifest/digests stay in that ignored directory, never attached or committed. All **8** non-database config/private-asset hashes unchanged. Existing encryption material and branding preserved without exposing their content. Only regenerable `apps/web/.next` renamed to backup `next-cache`; fresh cache regenerated. No browser cookies, accounts, uploads, dependency caches or other worktrees cleared.

Existing launcher restarted with `node --import tsx scripts/dev.ts`, supported terminal handle **proc_c9585ca999e8**, `persist_on_release=true`; polled running afterward. This is persistence requested across worker release, not reboot service or proof after worker exit.

Process identities (exact creation times/cwd/commands in ROLLOUT-VERIFICATION.json): supervisor/PGlite **14456** port55431, API **31152** port3101, worker **45080**, Next launcher **9368**, Next server **22308** port3100. All five read back with AI_LIVE_ENABLED, AI_ANTHROPIC_ENABLED, AI_GEMINI_ENABLED, SMTP_ENABLED, ACCOUNT_MAIL_ENABLED and RETENTION_APPROVED false. Log `.runtime/loading-main-server.log`.

## Commands and actual results

- `python .runtime/loading-prepare.py`: prepared scoped scripts, no runtime mutation.
- `git merge-base --is-ancestor ba5856f ff493dd`: exit0.
- `git diff --exit-code ba5856f ff493dd -- packages apps/api apps/worker scripts/dev.ts package.json package-lock.json`: exit0.
- `node --import tsx .runtime/loading-db-check.ts before`: read-only receipt/count verification passed.
- `python .runtime/loading-preserve.py`: clean owner exit, 1394 verified backups and cache rename passed.
- `git merge --ff-only ff493ddbd8ad54b0535f1ca436e3233e9afa40fc`: exit0; `.runtime/loading-merge.log`.
- `npm run typecheck`: exit0, server/web; `.runtime/loading-types.log`.
- `npx --no-install vitest run -c vitest.appearance.config.ts`: **20 passed**; `.runtime/loading-policy.log`.
- `node --import tsx .runtime/loading-db-check.ts after`: passed exact bounded continuity and 33 receipts.
- First `python .runtime/loading-verify.py` reached startup before HTTP was listening: connection-refused, not a pass. Read launcher log (Next ready); reran unchanged verifier: **exit0**, `.runtime/loading-verification.log` and ROLLOUT-VERIFICATION.json.
- API live/ready and web proxy ready: HTTP200. `/login`, `/accounts`, `/account/security`, `/platform`, `/dashboard` and emitted stylesheets: HTTP200, hashes recorded. These unauthenticated HTTP/asset checks are NOT rendered/authenticated feature tests.
- `git diff --exit-code bf3befe015e33d5584dcaec53d372ce5916463b9 HEAD -- apps packages`, source/index equality and `git diff --check`: exit0.

Tool limitation: Chrome tab_create/tab_snapshot search exposed no tools; no alternate owner-browser control used. A discovery-only Python -c command was denied by unattended policy and not executed; ordinary file search located shared skills instead, without changing policy.

## Required parent verification after this worker exits

1. Independently read current HEAD and recorded process birth/cwd/parents/listeners; repeat health and asset checks. Confirm persistent runtime survived worker release. Do not restart merely to repeat this check.
2. Owner-approved Chrome tab_create then tab_snapshot only: open http://localhost:3100/login and inspect fresh refresh/session loading, theme safety and guest transition. Use existing authorized session; if redirected, request direct secure sign-in rather than collecting secrets.
3. At http://localhost:3100/platform and /dashboard, verify stable header/sidebar on same-workspace navigation; client/workspace switch must conceal outgoing client visuals until destination authority resolves. Check desktop/tablet/mobile and accessible focus/reduced-motion where available.
4. Verify /accounts and /account/security retain selected-client theme consistency, theme/workspace popovers remain functional, and normal navigation/reload are sound. Preserve unsaved user work; do not create fixtures or mutate real records to test builder saves. Prior isolated builder evidence remains the safe regression proof.
5. Record exact observations and limitations. No HTTP-only/browser-substitute success; keep final gate open if authenticated access or safe delay/error observation is unavailable.

Rollback is not an automatic database restore: inspect subsequent writes and coordinate source/runtime rollback first. Original source SHA and cold backup are retained, but never overwrite later user data. No human acceptance, full WCAG/manual screen-reader, PostgreSQL concurrency/RLS or whole-app certification claimed.
