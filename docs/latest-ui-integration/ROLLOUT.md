# Latest accepted UI — local runtime handoff (t_b9689fc0)

## Status

**Integrated and restarted; final rendered-feature and post-worker-exit verification pending with default. Not yet overall rollout complete.** No deployment or Git `main` switch.

Parent t_137037d0 was read first and freshly verified `done`, approved with non-blocking findings. Its final verdict supersedes the earlier stop. Exact candidate `ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e` was fast-forwarded into the actual application checkout on **ui/global-design-system**. This evidence-only HEAD has identical apps/packages/tests to independently tested `ebb32ffd66c7689c5ae57bb85023500503fed90b`.

Main directory: `C:/Users/cabas/Documents/Codex/Projects/Training Assessment Tracker V2.1`.
Original/rollback reference: `ff1d19fb427c054efd9e48bc546c9ec1398ef835`.

## Integrity and scope

Verified ancestry of original main/FOUC ff1d19f, selector product bd7bc723d38a5b18dda05ff3baa2334af9247b9b and account product32ab3631a878b8adce3e250d174dceca86d689e0. Source packages, database migrations, dependencies and dev launcher unchanged between old main and candidate. No pending migrations: all33 existing receipt hashes match source before/after. No feature implementation edits during rollout.

`git merge --ff-only ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e` succeeded. All other Git refs remain unchanged. Tracked worktree/index match accepted HEAD after startup. Existing untracked worktrees and docs/fouc-main-integration and docs/main-branch-integration were not changed. New rollout report/logs are intentionally uncommitted, preserving exact accepted source HEAD. No reset, clean, stash, remote push, file deletion, dependency installation or arbitrary user-file commit.

Default t_616602dc confirmed exclusive runtime ownership and deferred other source-only locator maintenance; no concurrent candidate mutation. D02/D06 and favicon remain out of scope.

## Shutdown, backup and cache

Fresh process discovery identified old supervisor6256, API30712, worker31868, Next launcher38848/server46468 by PID, creation time, cwd, parent chain and listeners. Only identified Next child processes were terminated; the established dev supervisor's child-exit handler shut down its own API/worker and cleanly flushed/closed PGlite. All five exited and the active PGlite lock disappeared before cold copy. Other Node/Codex/browser/worktree processes were untouched.

Before integration/startup, cold-copied current private/installation data into:
`.runtime/latest-ui-backup-t_b9689fc0/data/`

**1394 file hashes verified after copying and again after restart.** Private hash manifest and bounded DB continuity digests remain in `.runtime/latest-ui-backup-t_b9689fc0/`, not Git or attachments. All8 non-database configuration/private-asset hashes remain unchanged. No `.env` exists in this installation; existing encryption key and branding were preserved. No credentials, fixtures or database were imported from another worktree.

Only actual regenerable `apps/web/.next` was renamed to `.runtime/latest-ui-backup-t_b9689fc0/next-cache`. New Next dev cache was compiled from updated checkout. No other cache/storage was deleted. Database pages are not claimed byte-identical after startup.

Read-only SQL before/after: **31 users / 3 organisations**, exact full-row digest equality for these two tables; all33 migration receipts match. This is bounded continuity, not full-table/database equivalence. No fixture suite, reseed or application mutation was run against main data. Existing worker operates normally with external services disabled.

## Persistent runtime

Existing launcher: `node --import tsx scripts/dev.ts`, from the actual checkout.
Supported terminal handle: **proc_e1a040519087**, launched with **persist_on_release=true** and polled running afterward. This requests survival of worker release; it is not a reboot service and post-worker survival must be independently verified.

Current identities (creation times/cwd/commands/listeners in ROLLOUT-VERIFICATION.json):
- Supervisor/PGlite15308, port55431.
- API38384, port3101.
- Worker43180.
- Next launcher40756 / server51864, port3100.

All five processes' environments were read back and verified `false` for AI_LIVE_ENABLED, AI_ANTHROPIC_ENABLED, AI_GEMINI_ENABLED, SMTP_ENABLED, ACCOUNT_MAIL_ENABLED and RETENTION_APPROVED. No live mail or paid AI requested. Log: `.runtime/latest-ui-main-server.log`.

For a future authorized stop, revalidate process creation/cwd/parent identity before touching the runtime. Prefer the established child-exit shutdown so PGlite closes cleanly; never delete an active lock. Rollback requires inspecting new user writes and a separately controlled source/runtime procedure; do not restore this backup over later user data or reset a running checkout.

## Executed verification

- `npm run typecheck`: exit0, server/web pass; logs/rollout-types.log.
- `npx --no-install vitest run -c vitest.appearance.config.ts`:20 passed; pure policy tests only, logs/rollout-policy.log.
- `node --import tsx .runtime/latest-ui-db-check.ts before` and `after`: read-only checks pass; private results under backup directory.
- `python .runtime/latest-ui-verify.py`: backup/config/ref/process/environment and HTTP checks pass; public output ROLLOUT-VERIFICATION.json.
- API `/health/live`, `/health/ready`, web `/api/health/ready`: HTTP200, ready PGlite.
- `/login`, `/accounts`, `/account/security`, `/platform`, `/dashboard`: HTTP200 HTML and every emitted CSS asset HTTP200, hashes recorded. These are unauthenticated shell/asset checks, not hydrated or authenticated feature proof.
- Git source/index equality and exact source HEAD verified after startup.

No fresh production build/browser fixtures were run against main; parent qualified the exact source with isolated build and selectors36, policy20, account, guest, scope/history, builder, lazy-builder, overview and recovery checks. See REVIEW.md for attributed evidence and retained failures/limits. Those are not claimed as this worker's reruns.

## Changed features and final parent checks

Use approved Chrome extension `tab_*` only; worker tool search exposes no extension tools. No alternate browser, Playwright, CDP or screenshots inferred from HTTP were used for this runtime.

1. http://localhost:3100/login — refresh actual page, open Theme; verify native popover opens above footer, remains usable in short/mobile viewport, internal scrolling and dismissal/focus behavior. Guest retains shared theme policy.
2. http://localhost:3100/platform and http://localhost:3100/dashboard — with existing authorized session, verify Workspace button/popover lists authorized destinations, fits viewport and navigates normally. No fixture/account writes.
3. http://localhost:3100/accounts and http://localhost:3100/account/security — verify selected-client account theme consistency on SPA navigation and reload; shared/no-client and guest boundaries remain as qualified. Avoid screenshots containing personal information/security material and avoid preference/data mutations unless explicitly authorized.
4. After this backend worker exits, independently verify recorded processes still exist with matching creation/cwd and HTTP live/ready plus HTML/CSS checks. Record actual Chrome captures/rendered observations and any session limitation separately. No overall success before these gates.

No human acceptance, PostgreSQL qualification, all-route/cross-browser or universal zero-FOUC/CLS claim. Remaining review goes to default on this same task; no duplicate rollout task created.
