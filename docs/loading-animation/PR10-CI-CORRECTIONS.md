# PR 10 CI corrections - 22 November 2026

Initial submitted head: `18a70efa18f3bd420adcd6d9ab460a2ae7884251`.
PR: https://github.com/scalyn-invited/Training-Assessment-Tracker-v2.1/pull/10 (base `dev`).

## Observed failures and bounded changes

- Platform UI push run 45010109804 and PR run 45010134505 reproduced two stale assertions. Settings searched for the removed Theme `summary`; it now uses the accessible Theme button and dismisses the popover and parent dialog separately. Clients expected the old page alert and immediately reusable list after a failed identity mutation. The test now verifies the authority-gated error, hidden workspace action, explicit session recheck, restored action and successful selection. No assertion is skipped and the final selected-client check remains.
- Assessment PR run 45010134503 failed before browser execution because Webpack CSS Modules reject `:global(html[data-shell-neutral])` without a local selector. Moved the same nine declarations, values and importance to `html[data-shell-neutral]` in the global stylesheet. No change to authority, focus, timing, motion or theme-selection logic.

## Local verification

- Clients and Settings isolated real-API browser journeys each reported their single test passing. The Windows harness then stalled during server teardown; the completed-test processes were interrupted. The first Settings launch correctly refused the still-occupied fixture port; after stopping the Clients runner, Settings ran and passed. These are passing test-body results, not clean runner exits.
- `npx.cmd --no-install playwright test -c playwright.loading-animation.config.ts`: 22 passed, clean exit 0, including neutral canvas, identity races, failed-mutation concealment/retry and keyboard focus at desktop/tablet/mobile. The initial sandbox attempt failed dependency reads; rerun with filesystem access passed.
- Original submission TypeScript and appearance policy (20 tests) passed. Initial remote verification passed TypeScript, domain tests, PostgreSQL tests and production build; its final browser outcome was still pending at this checkpoint.
- Generated Next configuration changes from local test startup were restored; existing nested worktrees and runtime data are excluded.

Final-head GitHub checks must be read from the PR. Historical first-paint policy failure and pending actual-app/human acceptance remain as documented; this correction does not close those gates.
