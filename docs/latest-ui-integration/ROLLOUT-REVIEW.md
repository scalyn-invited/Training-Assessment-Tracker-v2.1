# Running-app rollout review — t_b9689fc0

## Verdict: external browser prerequisite blocked

Reviewed 2026-11-21 at 06:26 UTC. No implementation edits, data writes, service restart or alternate browser used by this reviewer. Final rollout approval is withheld pending rendered-feature verification.

## Independently verified after backend worker exit

- Backend worker PID 45936 no longer exists; Kanban records its successful exit.
- Main checkout remains `ui/global-design-system` at exact accepted `ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e`; tracked/index diff clean.
- Inspected and executed the read-only assertions from `.runtime/latest-ui-verify.py` in memory, excluding its report write, preserving the implementer's report. Added comparison of all process PID/creation-time pairs against original ROLLOUT-VERIFICATION.json and assertion that backend worker had exited. Exit 0.
- All five original runtime processes survive with identical creation times and expected cwd, parent tree and listeners: supervisor 15308, API 38384, worker 43180, Next launcher 40756/server 51864. Runtime handle `proc_e1a040519087`.
- Live API, ready API and web ready endpoints return 200. `/login`, `/accounts`, `/account/security`, `/platform`, `/dashboard` return HTML 200; every stylesheet emitted by these pages returns 200.
- All 1394 cold-backup file hashes reverified; 8 configuration/private asset hashes unchanged; all other Git refs unchanged.
- AI_LIVE_ENABLED, AI_ANTHROPIC_ENABLED, AI_GEMINI_ENABLED, SMTP_ENABLED, ACCOUNT_MAIL_ENABLED and RETENTION_APPROVED remain false across all runtime processes.
- Backup remains `.runtime/latest-ui-backup-t_b9689fc0`. No backup contents or secrets included in this report.

## Unsatisfied gate

Approved Chrome extension `tab_list` returned `no_browser`: “No browser is connected for this session. Open Chrome with Background task tabs enabled, or manually attach a tab in Hermes Control.” Per task policy, no other browser was attempted.

Connect Chrome to the reviewing session via Background task tabs or Hermes Control and resume this task. Verify rendered Theme and Workspace popovers plus selected-client account theme on navigation/reload. Direct targets:

- http://localhost:3100/login
- http://localhost:3100/platform
- http://localhost:3100/dashboard
- http://localhost:3100/accounts
- http://localhost:3100/account/security

HTTP results do not prove hydration, appearance, interaction or authenticated scope. Existing isolated parent QA does not replace this main-runtime gate. No screenshots, human acceptance, deployment, PostgreSQL qualification or overall rollout completion claimed. D02/D06/favicon and deferred source-only locator maintenance remain out of scope.
