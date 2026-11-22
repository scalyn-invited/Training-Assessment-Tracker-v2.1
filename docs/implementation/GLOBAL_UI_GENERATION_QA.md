# Generation progress - 19 November 2026

## Scope and visual system

`/enrolments/[id]/generation/[runId]` now uses the shared learning shell, header, panels, feedback and refresh button. The progress/budget panel remains above configuration/provenance and provider attempts. All block counts, status messages, budget units, policy/prompt/schema/provider versions, fallback/synthetic labels, revision notes and attempt metadata remain visible. Existing curriculum and exact-result-version URLs remain. No generation, cancellation, reconciliation or approval action was added.

UX Engine visual-character, responsive, restyle and state-completeness guidance applies through DESIGN.md. Before: legacy generic panels, button and feedback, global body/subtle type and separate authenticated shell. After: the established sans-serif hierarchy, semantic navy/light/client palettes, 14px panels, 24px section and 16px internal spacing, 8px list spacing, shared focus/disabled styles and tabular budget figures. Long provider/request identifiers wrap on mobile; amounts stay together. Desktop and mobile retain the same information order. Generic global panel/notice/subtle/preserve-lines utilities still have other consumers and remain.

The existing three-second queued/running polling and manual refresh are unchanged. Refresh errors retain previously fetched details. Ambiguous/failed guidance and archived-note behavior are preserved. Signed-out direct visits now reach login rather than remaining pending. The API still requires record details, management and separate sensitive authority. Corrected the inventory's inaccurate cancellation controls and generic-viewer description. No backend, migration, approval, permission, scan-state, immutable-record, budget or N+2 rule changed.

## Verification

The isolated browser journey creates a real synthetic training record, separately grants sensitive authority, confirms onboarding/calendar inputs and queues the local mock provider. Four blocks finish, provenance and simulated usage are returned by the real API, and the result link opens the exact new draft version without approval. No external provider is contacted.

Additional checks cover signed-out and missing-client redirects, loading/disabled refresh, initial load failure, refresh failure with retained details, keyboard refresh/recovery, unavailable request, no attempts, queued/running polling, stopped polling on completion, ambiguous/failed messages, archived notes, fallback provider, unknown tokens and long identifiers. Explicit response fixtures cover transient and rare states; they are not evidence of actual uncertain charges or retention execution. Member access returns 403; unallocated Client Admin/Global Admin access remains concealed with 404; cross-client reads return 403. Light/Dark, client-default precedence and axe A/AA/overflow at 320, 390, 800 and 1440px are checked.

Commands:

- `npx playwright test --config playwright.generation-ui.config.ts` - passed, 33.7s / 41.8s overall.
- Set `OVERVIEW_QA_SUITE=shell`, then `npx playwright test --config playwright.overview.config.ts` - isolated shared-shell regression passed, 13.1s / 21.3s overall.
- `npx vitest run tests/programme-generation.test.ts tests/programme-generation-contract.test.ts` - 28 tests passed, 24.58s.
- `npm run typecheck` and `npm run build` with `NEXT_DIST_DIR=.next-clients-build` - passed. Generated Next files are restored after checks.

The first test attempt had incorrectly encoded punctuation in locator text; this was corrected. A later test expected 403 for every unauthorized role, but the existing record-detail boundary deliberately returns 404 for inaccessible records; assertions now match those preserved rules. No permission behavior changed. Final screenshots cover real complete desktop/mobile output and an explicitly synthetic ambiguous mobile state.

Browser fixtures use fresh `.runtime/overview-browser` database/private storage, test accounts and separate `.next-overview` output. Email and live AI are disabled. The operator environment and V2 remain untouched. Historical evidence is preserved. Final desktop/mobile screenshots were visually inspected and saved in `screenshots/global-generation/`. All 67 originally inventoried untracked file hashes and stashes are unchanged. Whitespace checks pass.

## Limits

Automated browser/domain checks and agent visual inspection do not establish human UX/accessibility acceptance, full parity, global completion, production readiness or PostgreSQL/RLS qualification. Native shell dialogs retain their existing behavior. No offline feature is introduced. Remaining routes and final legacy retirement are still open. Nothing pushed or deployed. Future authorized PRs target `dev` per Bernie's latest instruction.

Next bounded feature: document review `/enrolments/[id]/documents/[fileId]`.
