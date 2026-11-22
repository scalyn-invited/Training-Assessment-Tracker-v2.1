# Main application cache refresh — t_b77c6213

## Final scope and result

**Owner clarification superseded the initial task: “main” means the MAIN APPLICATION at localhost:3100, not Git `main`.** Literal-main integration and checkout switching were cancelled immediately upon receipt. The accepted FOUC candidate was already present; no further application merge was needed.

- Application directory: `C:/Users/cabas/Documents/Codex/Projects/Training Assessment Tracker V2.1`.
- Before/after application branch: **ui/global-design-system**.
- Before/after application HEAD: **ff1d19fb427c054efd9e48bc546c9ec1398ef835**.
- URL: **http://localhost:3100**; login: **http://localhost:3100/login**.
- Actual Git `main` remains **3f558bbd780390feb288dbed07c277aec05022ed**.
- No application merge commit, branch promotion, reset, stash, cleanup, push or deployment occurred.
- Implementation/operations phase verified; **default orchestrator independent readback remains required**. This report does not claim browser or human acceptance.

## Cancelled isolated merge investigation

Before the clarification, inspected AGENTS.md, feature checklist, design directive, previous runtime report, Git graph and diff. Actual `main` and accepted candidate diverged by 26/80 commits, with numerous patch-equivalent commits. API/packages/runtime scripts/dependency manifest and lockfile matched between the tips; UI and QA history differed substantially.

Created only `.worktrees/main-accepted-t_b77c6213`, on `integration/main-accepted-t_b77c6213`, from actual main. Ran a normal `git merge --no-commit --no-ff ff1d19fb427c054efd9e48bc546c9ec1398ef835` there. Proposed parents were `3f558bbd780390feb288dbed07c277aec05022ed` and `ff1d19fb427c054efd9e48bc546c9ec1398ef835`; **no merge commit was created**.

Seven conflicts remain, deliberately isolated and untouched after cancellation:

- `apps/web/app/components/app-shell.tsx`
- `apps/web/app/components/assessment-response.tsx`
- `apps/web/app/components/assessment-review.tsx`
- `apps/web/app/components/response-questions.tsx`
- `tests/workflow-qa-browser/d05.spec.ts`
- `tests/workflow-qa-browser/learner-guard.spec.ts`
- `tests/workflow-qa-browser/workflow.spec.ts`

A combined proposed resolution/PowerShell inspection command was blocked before execution by unattended tool approval; none of those resolutions landed. Python inline inspection and execute_code were also unavailable under unattended policy. Subsequent bounded, explicit file-based diagnostics and operations returned actual execution evidence. No failed command was represented as successful.

No existing worktree used Git main. The running Codex/other tools were not stopped. Cancellation eliminated the need for main-writer promotion coordination. All refs, worktree HEADs, and the isolated unmerged index were captured before cache operations and verified unchanged afterward. The initial application status had only untracked `.worktrees/` and `docs/fouc-main-integration/`; both remain. This new report directory is also intentionally untracked, preserving the exact accepted app HEAD.

## Shutdown, preservation and cache boundary

Identified and revalidated process creation times, commands, cwd, parent relationships and listening ports before shutdown. Old supervisor **28684** owned PGlite55431, API33128, worker34680 and Next29944/server32268. `NEXT_DIST_DIR` was unset on the actual Next processes; `apps/web/next.config.ts` therefore resolves the build directory to `.next`.

Stopped only the identified Next server/launcher. The existing `scripts/dev.ts` child-exit handler then stopped API/worker and closed PGlite. Waited until all five known runtime PIDs exited and `.runtime/private/pglite.lock` was removed by normal shutdown. No forced database-owner termination or manual active-lock removal was needed. The prior persistent process session was not accessible from this profile (`not_found`), so it was not falsely reported as stopped through that tool.

With the runtime cold, copied existing private/installation storage and `.env` (if present) under `.runtime/main-app-cache-backup-t_b77c6213/data/`. Verified **1394 copied files** byte-for-byte. Backup contents and the private preservation manifest remain outside Git and are not attached to this report.

Only this exact regenerable cache was cleared from its active location by rename, not deletion:

- Source: `C:/Users/cabas/Documents/Codex/Projects/Training Assessment Tracker V2.1/apps/web/.next`
- Retained backup: `C:/Users/cabas/Documents/Codex/Projects/Training Assessment Tracker V2.1/.runtime/main-app-cache-backup-t_b77c6213/next-cache`
- Rename: **2026-11-21T03:25:27.556742+00:00**; confirmed source absent immediately afterward.
- Fresh cache creation: **2026-11-21T03:25:48.699419+00:00**; **204 files** present at verification, including newly served CSS.

No browser cookies, localStorage, profile, uploads, database files, runtime/private contents, npm cache or other-worktree caches were deleted. All eight captured non-database configuration/private files remained byte-identical. Existing unrelated server3112 retained the same three process identities and listening port. No migration was required: all **33/33** source migration hashes matched receipts both before and after restart. The ordinary startup verifier ran without pending migrations. Read-only SQL transactions found **31 users and 3 organisations** before and after. This is bounded continuity evidence, not byte equality of a live database or exhaustive record equivalence.

## Restart and persistent ownership

Restart command from the actual application directory:

```sh
AI_LIVE_ENABLED=false AI_ANTHROPIC_ENABLED=false AI_GEMINI_ENABLED=false SMTP_ENABLED=false ACCOUNT_MAIL_ENABLED=false RETENTION_APPROVED=false NEXT_TELEMETRY_DISABLED=1 node --import tsx scripts/dev.ts > .runtime/main-app-cache-server.log 2>&1
```

Terminal session **proc_ca1916e010e4**, launched with **persist_on_release=true**, was polled running after verification. This is persistence across task release, not a machine-reboot service.

Verified new runtime:

- Supervisor/database **6256**, port55431.
- API **30712**, port3101.
- Worker **31868**.
- Next launcher **38848** / web server **46468**, port3100.

All processes use the actual application checkout (root or `apps/web`), not the isolated integration or QA worktrees. Launcher environment readback confirms all six live-effect flags remain `false`. No live email, paid AI or retention operation was invoked. Source branch/HEAD, clean tracked/index state, process ownership and all refs were verified after restart.

## Executed verification

- `npm run typecheck`: server and web pass, exit0; repeated with retained `typecheck.log`.
- `npx --no-install vitest run -c vitest.appearance.config.ts`: **14 passed**, one file, exit0; repeated with retained `appearance-tests.log`. Pure isolated policy checks, no main-DB test fixtures.
- API `/health/live`, `/health/ready`, web proxy `/api/health/ready`: HTTP200 before and after restart.
- `/login` and both linked stylesheet assets: HTTP200 before and after restart.
- Read-only receipt/count checks: pass before and after; transactions rolled back.
- `git diff --exit-code HEAD` and cached equivalent: pass.
- Preservation assertions: all refs, worktree HEADs, isolated conflict index, captured private/config hashes and unrelated3112 process identities unchanged.

Raw evidence: `process-before.json`, `http-database-before.json`, `http-database-after.json`, `preservation-after.json`, `typecheck.log`, `appearance-tests.log`. Diagnostic scripts and server log remain under `.runtime/main-app-cache-*`. The only new application-visible effect is a freshly generated Next cache and restarted same-source app.

## Limits and handoff

Chrome extension `tab_*` tools are not exposed in this worker (tool discovery returned no match). No Playwright, CDP, native browser or computer-use fallback was used. HTTP checks are **not rendered-browser verification**. Default orchestrator should independently read back branch/HEAD, health, persistent process ownership and fresh cache, then use its authorized extension if browser verification is available. No authentication, account mutation or broad tests were performed against the main DB.

The cancelled isolated merge is neither tested nor accepted and must not be promoted. It remains available for inspection only; removal or renewed integration requires separate authorization. No new semantic merge needs QA because the actual app source never changed. Previously accepted FOUC evidence and its stated limitations remain as recorded in `docs/fouc-main-integration/`.
