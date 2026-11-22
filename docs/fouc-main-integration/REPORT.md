# Approved FOUC integration and main-app runtime

## Result

Integrated by `git merge --ff-only ff1d19fb427c054efd9e48bc546c9ec1398ef835` into the actual application checkout, **ui/global-design-system**. No checkout of historical `main`, reset, stash, clean, unrelated branch merge, remote push or deployment.

- Original/rollback SHA: `b729e23435b6f0e68feba6962aaac20724df7d14`.
- Integrated HEAD: `ff1d19fb427c054efd9e48bc546c9ec1398ef835`.
- Approved product: `37fe632303d44678a685e836fc1987d9da1f252d`.
- Main URL: **http://localhost:3100** (login: http://localhost:3100/login).
- Main directory: `C:/Users/cabas/Documents/Codex/Projects/Training Assessment Tracker V2.1`.

## Integrity and preserved state

Verified target ancestry before merging and exact product equality between approved product and QA HEAD for apps/packages/scripts/package.json/package-lock.json. QA worktree HEAD matched the approved SHA. Read completed t_d56e101f and its round-3 report (retained as accepted-QA-REVIEW.md). Round-3 archive SHA256 independently reproduced: `f7f0ff7cbd9dae610602a9360ca22be697a3a6b0b52903c98ae909cd2a553ebd`.

Initial Git status contained only untracked `.worktrees/`; tracked modifications and untracked app documentation outside worktrees were absent. No worktree directories were recursively copied or changed. Final tracked worktree and index both match integrated HEAD. Only this new report directory and preexisting `.worktrees/` are untracked. Report intentionally remains uncommitted so application HEAD stays the exact approved SHA.

No main application processes were active before integration. Cold backup of main private/installation storage was made before database opening at `.runtime/fouc-main-integration-backup/`; private manifest stays there, not in Git. All **1397** copied file hashes verified both after copy and during final evidence collection. All **7** non-database/non-active-lock files remained byte-identical after startup, including existing encryption key/branding and historical locks. Database pages naturally change during engine startup; a byte-identical live database claim is not made. No credentials, database or test fixtures were imported from another worktree. Original private storage remains `.runtime/private`.

Stale main lock recorded PID27544; absence was checked before opening the stopped database. Preserved the lock as `pglite.lock.stale-fouc-integration`, rather than deleting it. Main data was not reset, replaced, reseeded or upgraded. Before startup, all **33/33** migration receipt hashes matched source, with **zero pending migrations**. The candidate changes no database migration files. Startup ran the existing idempotent migration verifier only. Read-only transactions before/after startup both found **31 users and 3 organisations**. These count checks establish bounded continuity, not exhaustive record equivalence.

## Runtime ownership and persistence

Used the existing `npm run dev` implementation directly: `node --import tsx scripts/dev.ts`, with working directory at the actual checkout. Existing Node24.19.0/npm11.17.0 and lockfile dependencies were reused; no installation or version changes.

Terminal persistent server session: `proc_c2f346abffd8`, launched with **persist_on_release=true**, acknowledged by the terminal tool. It is intentionally long-lived, not a bounded worker test process. Runtime PID28684 owns the local PGlite listener55431 and spawned API33128 (3101), worker34680, and Next launcher29944/server32268 (3100). Exact process creation times, commands, cwd, parent links and sockets are in preservation-process.json. Source HEAD was verified after process startup. All target processes point to this checkout, not a QA worktree. Server was polled alive after successful checks. Persistence across task release is requested through the supported terminal mechanism; parent should independently confirm it after handoff (not a machine-reboot service).

Explicit process overrides, read back from launcher environment, keep AI_LIVE_ENABLED, AI_ANTHROPIC_ENABLED, AI_GEMINI_ENABLED, SMTP_ENABLED, ACCOUNT_MAIL_ENABLED and RETENTION_APPROVED=false. No live email, paid AI or retention action was invoked. No other application/Hermes/browser processes were stopped.

Log: `.runtime/fouc-main-server.log`. Observed local database startup, migration verification, Next ready, worker started and application URL. Stop/restart must target this process tree only; preserve storage and do not remove an active lock. For rollback, stop this exact runtime gracefully, inspect any new user changes, and use the recorded old SHA under a separately reviewed rollback procedure; do not reset a running checkout or restore an old backup over new records.

## Executed verification

- `git merge-base --is-ancestor HEAD <approved-QA-SHA>`: passed before integration.
- Approved product/QA tree equality and archive hash: passed.
- `git diff --exit-code HEAD` and `git diff --cached --exit-code HEAD`: passed after integration/startup.
- `npm run typecheck`: server and web passed, exit0.
- `npx --no-install vitest run -c vitest.appearance.config.ts`: **14 passed**, one file, exit0. Pure appearance resolver policy checks; no main-database tests.
- API `/health/live` and `/health/ready`: HTTP200, API/PGlite ready.
- Web proxy `/api/health/ready`: HTTP200, API/PGlite ready.
- `/login`: HTTP200 HTML; both emitted CSS assets HTTP200. HTML is the expected client-hydrated shell (no server-rendered form/password input). This is **not browser/rendered-page verification**.
- Post-start `BEGIN READ ONLY` SQL: all33 receipts verified against source; user/organisation counts unchanged. No broad suite, fixture setup or mutation tests ran against main data.

Raw bounded HTTP/database results: runtime-verification.json. Process/preservation results: preservation-process.json.

During preflight, the first diagnostic count query incorrectly used `clients` rather than the actual `organisations` table, returned42P01, and exited before merge; corrected after reading the schema. A first health probe ran before API initialization finished and got connection refused. Subsequent readiness checks passed. Neither diagnostic issue was hidden or treated as success.

## Remaining verification and retained QA limits

Required `hermes-browser-extension:hermes-browser-extension` skill returned **not found** in this worker. No Playwright, CDP, native browser or computer-use fallback was used. Default parent should use its approved Chrome background tab_create → tab_snapshot → tab_* flow to verify rendered page and independently read back runtime liveness after this task releases. No authenticated sign-in or account modification was attempted here.

Prior reviewer evidence is attributed, not claimed rerun: first-paint **22 passed / 1 user-superseded outage assertion failed** (old platform-dark expectation conflicts with approved built-in dark503 fallback); representative dynamic editor/lesson/receipt coverage and scope checks passed. This remains a bounded automated approval, not all-green historical-suite reporting. No physical-device/WebKit/full manual WCAG/all-palette, real installer/PostgreSQL concurrency, live-service or deferred human acceptance claims.

Implementation/integration phase ready for parent independent readback; usable HTTP runtime is live. Browser verification is explicitly outstanding with the authorized parent.
