# Global design-system integration preparation — 18 November 2026

## Authorization and boundary

The user supplied Bernie's instruction to apply the current Figma presentation globally across existing routes, preserve workflows and safeguards, reconcile current main, and perform bounded feature QA. **No push or deployment is authorized for this integration.** Existing uncommitted files and stashes must be preserved. The earlier five-screen work is the visual reference, not evidence that the remaining routes have been migrated.

## Branch reconciliation

- Starting branch: `ui/settings-figma`, commit `440fcc831d41fc1ccfa39c508fe3c5023e8fd015`.
- Fetched main: `7bcef2cd840666a8b8da6259e10564274c7f8248`.
- New local branch: `ui/global-design-system`.
- Integration merge: `a5a9334d17eeda4fec9ebc72d3e2d134e6e134a5`, a normal full-history merge of `origin/main` into the Settings-based branch. No migration-file copying or selective workflow replacement was used. Both source commits are ancestors.
- No tracked modifications existed before the integration. All **67 pre-existing untracked files** were inventoried by path/hash and verified unchanged afterward. Stash inventory was unchanged (empty at preparation). The local verification manifest lives in ignored `.runtime/global-ui-prep/before.json`; it stores hashes, not file contents. No local private files were committed.
- The merge added the already committed Archify handoff/reference material. `git diff 440fcc8 HEAD -- apps packages scripts tests` is empty at the integration merge, so application code, assessment workflow code, tests and all 31 migrations present on the UI branch were preserved byte-for-byte. `git diff c4a76e7 origin/main -- apps packages scripts tests` is also empty: fetched main does not introduce additional assessment workflow changes beyond the previously shared baseline.

## Remote state observed during preparation

Overview PR #2 was merged to main first. Clients PR #3 was later merged to the Overview branch; People PR #4 to the Clients branch; Audit PR #5 to the People branch. Those later merges do not retroactively update main. Settings PR #6 was still open at the check. This explains why the full UI must be reconciled locally rather than assuming every screen is already in main.

No remote PR, branch or merge was changed by this preparation. If the assessment fixes mentioned in the new instruction are on a different branch/commit or not yet published, their location must be confirmed before claiming they have been integrated. No unidentified fix is claimed present.

## Verification

- TypeScript passed after reconciliation.
- `npx vitest run tests/migration-integrity.test.ts tests/assessment-definitions.test.ts tests/assessment-assignments.test.ts tests/assessment-responses.test.ts tests/assessment-reviews.test.ts`: **22 tests passed across five files**, 19.32 seconds. Tests use the repository's isolated database/storage fixtures, not the saved demo.
- Page-file census: 38 existing page routes. Shared `error.tsx` and `not-found.tsx` add two recovery surfaces. The route-by-route checklist records roles, shell, page/child components, dialogs and loading/empty/error/recovery states in `GLOBAL_UI_ROUTE_INVENTORY.md`.
- This is branch/inventory verification. No new screen migration, new desktop/mobile visual approval, full parity or production readiness is claimed. Historical evidence remains intact.

## UX Engine resolved; historical workflow-source question

The preparation check did not find UX Engine in the exposed tools or installed skill locations. The user subsequently identified `ux-engine-v2.4.0/` in the workspace. Its `agent-skills/` directory contains Codex-compatible instructions; the design-system, visual-character, responsive (including its examples), restyle and state-completeness instructions have now been read for the shared foundation work. No installation or package modification was needed. The previous missing-package finding is resolved; no UX file is requested from Bernie.

At the foundation checkpoint, `global-ui-team-confirmations.txt` asked whether the assessment workflow fixes were already in main or on another branch/commit. The user authorized shared foundation work while that answer was pending. That historical question is now resolved below; the reported foundation evidence remains unchanged.

## Assessment workflow source resolved and merged locally

Bernie supplied `codex/assessment-workflow-fixes` in the response forwarded by the user on 18 November 2026. Fetched tip: **e44b295**. Preserved the in-progress shared shell/account presentation in local checkpoint **9f60b1f** (explicitly QA pending), then merged the complete branch with normal full history in **dffeacd**. `git merge-base --is-ancestor e44b295 HEAD` succeeds. No migration-only copying or selective workflow replacement was used.

The merge includes the author save/publication recovery, question references, review state/member-safe feedback, published handoff/copy provenance, unsaved-work guards and migrations **0032** and **0033**, together with their tests and historical evidence. Two conflict resolutions retain both sides' behavior:

- API `/platform/client-accounts`: retain the UI's `view=all|admins` query and fourth directory argument while retaining incoming workflow changes elsewhere.
- `app-shell.tsx`: retain `ApplicationShell` and shared controls, plus the incoming `confirmWorkLeave` and `leaveAfterConfirmedMutation` imports. Client switching and logout check work state before sending mutations.

Verification after merge: 42 tests in eight migration/assessment/access/platform/API suites passed (24.61s); 30 authentication/account/branding/client-account tests passed (12.48s); all 22 workflow browser fixtures passed (20.1s); the actual Next navigation fixture passed (15.7s overall). The Next fixture ran in an isolated detached worktree at `dffeacd`, with no environment files, database, API, worker or external adapters. Only `node_modules` was linked for dependencies; the local browser override selected installed Chrome. The existing saved environment was left intact. Shared-shell/account and reference-screen evidence is recorded separately in `GLOBAL_UI_ACCOUNT_QA.md`.

The requested workflow source is integrated. Assessment presentation migration has not started. Continue in the recorded order: remaining platform/account pages, client administration, learning, assessments, guest/setup/recovery, then verified obsolete-code retirement. Nothing pushed or deployed; no human acceptance or production readiness is inferred.

## Future PR target - 19 November 2026

Bernie's message forwarded by the user specifies `dev` as the target for future pull requests. Continue local work on `ui/global-design-system`; when submission is authorized, reconcile against the then-current `dev` before preparing the PR. This message does not authorize a push or deployment, and no new merge or remote branch verification is claimed here.

## Authentication workflow direction confirmed - 19 November 2026

Bernie's response forwarded by the user explicitly confirms preserving the current authentication flow. Additional authentication stages and recovery behavior in Christian's designs are future work. This resolves the earlier question about administrator-issued recovery, combined authenticator/recovery-code input and password plus confirmation on one screen. Preserve the original clarification draft and historical QA. This direction is not human UI acceptance or authorization to push/deploy. Setup/installer presentation follows the same workflow-preserving boundary; evidence is in `GLOBAL_UI_SETUP_QA.md`.


## Platform account-access controls - locally verified, 19 November 2026

PlatformAccounts and AccountAccess now use shared panels, fields, buttons, feedback and pagination. People Global Admin confirmation forms use the same controls. The People dialog now uses the shared Dialog component, fixing a stale shell CSS reference and preserving native open/close behavior while adding the established keyboard focus loop. Existing request payloads, versions, reasons, confirmation resets, eligibility, session invalidation, password-mode invitation restrictions and last-active-admin protection remain. No workflow or API changes.

Four isolated browser suites pass: local-password account access, mock-auth account join, People and Clients. Extended checks cover keyboard disclosure/focus loop/Escape, native validation, paging, search empty/error/retry, stale recovery, 44px touch controls, desktop/mobile overflow and axe A/AA. TypeScript, separate-output production build, formatting and whitespace checks pass. Removed 16 obsolete selector alternatives for review-section, form-actions, choices and directory-panel after consumer checks; retained CSS declarations and order are unchanged. Evidence: GLOBAL_UI_ACCOUNT_ACCESS_QA.md and GLOBAL_UI_ACCOUNT_ACCESS_AUDIT.json; six inspected images in screenshots/global-account-access/.

All 67 original preservation entries and stashes remain unchanged. Historical evidence and untracked drafts remain. V2 untouched; no push, deployment, live email or paid AI. Future authorized PRs target dev. Final cross-route component/style reconciliation and completion evidence remain open; no human acceptance, full parity or production readiness is claimed. Next: final shared-component and scoped-style consumer audit, then review the remaining foundation checklist for a local handoff.


## Global UI final reconciliation - locally verified, 19 November 2026

The route and shared-foundation UI checklist is locally complete: 38 page routes, two recovery screens, one authenticated shell and shared guest/recovery presentation. Clients management was the last raw dialog outside the shared primitive; it now uses shared Dialog, Button and Input while preserving payloads, confirmations, versions, reasons, pending-close guard and stale drafts. Ten obsolete selector alternatives are removed after consumer checks. Retained editor/base utilities and all public assets remain necessary; no old shell fallback remains.

The reproducible source audit covers 95 source files, 33 CSS Modules, 627 static style references and eight compositions. No missing style references, orphan modules, unused class candidates, unreferenced source candidates or absent route rows remain. The two dynamic control lookups are reviewed against all declared variants. Thirty-seven page modules reach AppShell, the root keeps its existing redirect, and two recovery screens reach RecoveryFrame. All 28 previously linked QA documents exist. Static reachability is an audit aid; bounded browser evidence remains authoritative for exercised behavior.

Six final isolated browser suites pass: Clients, Overview, People, Settings, shell and client Appearance. TypeScript, separate-output production build, targeted formatting, whitespace and preservation checks pass. Evidence: GLOBAL_UI_FINAL_QA.md, GLOBAL_UI_FINAL_AUDIT.json and six inspected screenshots in screenshots/global-ui-final/. Earlier bounded feature results remain historical evidence, not tests rerun by this checkpoint.

Bernie's workflow-fix commit e44b295 remains an ancestor. All 67 original preservation entries and stashes are unchanged. No backend, workflow, permission, approval, scan, immutable-record, budget or N+2 change. V2 untouched; no push, deployment, live email or paid AI. Human technical/UX and owner acceptance stay deferred; local UI completion does not establish full V2.1 parity, production readiness or PostgreSQL qualification. Next: local handoff; future authorized submission must reconcile current dev and target dev.
