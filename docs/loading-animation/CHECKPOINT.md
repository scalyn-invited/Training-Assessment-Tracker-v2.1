# Loading animation implementation checkpoint — NOT READY

Task: t_02ae82aa. Main-app base and isolated worktree HEAD: `ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e`.
Branch: `ui/loading-animation`. Worktree: `C:/Users/cabas/Documents/Codex/Projects/Training Assessment Tracker V2.1/.worktrees/loading-animation`.
Main app, database, storage, running processes and other worktrees were not changed. No integration, restart, push or deployment.

## Executed evidence

- `npm ci --ignore-scripts`: exit 0, 275 packages added, zero reported vulnerabilities. Isolated worktree only.
- `npx playwright test -c playwright.loading-animation.config.ts` at first tracer: exit 1, expected missing spinner (`01-red.txt`).
- First implementation rerun: exit 1, fake clock was still advancing during assertions (`02-green.txt`, retained despite filename). Corrected the harness to pause its clock before mounting; no production timing change.
- Same command after clock correction: exit 0, one session-loader test (`03-green.txt`). It checks initial animation, accessible name and visible explanation at 3000ms.
- `npx playwright test -c playwright.loading-animation.config.ts shell.spec.ts`: initial fixture bundling error retained (`04-shell-red.txt`); added the esbuild plugin's missing resolveDir.
- Corrected shell tracer: exit 1, expected missing sidebar during delayed same-workspace route authority (`05-shell-red.txt`). The test also requires the same sidebar node and absence of protected destination content. This RED remains unresolved, not waived.

These are isolated automated Chrome component fixtures using the project's accepted esbuild/Playwright technique and `.invalid` intercepted transports. They do not use an owner browser, running service, TCP test server, database, real account or credentials. No rendered main-app verification claimed.

## Partial code — uncommitted, not a release candidate

- Added shared LoadingState presentation and CSS, with 3000ms delayed text, status label, timer cleanup and a reduced-motion rule.
- Routed the existing auth-ui Pending non-error branch through it. Existing recovery action and error branch unchanged.
- Added isolated loader and persistent-shell tracers/config.
- No AppShell/appearance/root-layout authority changes have been made.

Reduced-motion, responsive screenshots, full error/timeout coverage, sign-in integration, the loading-label sweep, full build and builder regressions remain outstanding. One passing tracer does not certify these.

## Architecture prerequisite for safe continuation

`AppShell` is currently constructed inside each page (also through Guest), not owned by a persistent layout. `useContext` starts at null per mounted consumer; useBrand correctly invalidates authority on the exact pathname/account/client key. AppShell returns a standalone RecoveryFrame while authority is pending. Consequently, a new route removes both shell chrome and content.

The assessment builder deliberately keeps its imperative lifetime above that page-local gate (see BUILDER_APPEARANCE_GATE_FIX.md). Simply lifting the entire gate into root layout unmounts the page/editor on authority changes, including save-URL/history transitions. Conversely, caching the previous shell/context indiscriminately risks showing old scoped identity, branding or privileges during client/identity changes. Neither shortcut is acceptable.

Recommended direction: persistent **chrome ownership only**, retaining page-local content gating and the page/editor component lifetime; retain chrome only for a verified unchanged workspace/account/client, immediately neutralize it on boundary changes, and keep fresh-document 503 recovery plus standalone error/not-found behavior. Before undertaking this cross-cutting ownership change, request a bounded independent security/architecture review of the proposed lifetime and authority contract. This is not another request for owner Proceed and must not release downstream QA or rollout.

The peer review must return a concrete ownership mechanism and regression requirements, or identify a smaller approach satisfying the same contract. Resume implementation after that prerequisite; do not mark this feature complete on the current worktree.
