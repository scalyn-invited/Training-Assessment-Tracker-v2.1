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

## Required input before visual migration

The instruction explicitly requires UX Engine throughout. No UX Engine tool or skill was found in the exposed tool catalog, repository skill locations, user skills directory or installed plugin cache; prior UI QA documents record the same absence. The Figma design-to-code skill is available, but is not represented as UX Engine. A location for the required workflow, or explicit approval of the established Figma/token/browser/accessibility alternative, is needed before the visual migration.

Team confirmations are drafted separately in `global-ui-team-confirmations.txt`. Preparation and inventory are complete; global UI implementation remains pending. When the required input is resolved, proceed in the recorded order: shared foundations with remaining platform/account pages, client administration, learning, assessments, guest/setup/recovery, then verified obsolete-code retirement. Verify and record each bounded feature before continuing.
