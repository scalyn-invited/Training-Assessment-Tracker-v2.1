# Combined candidate backend requalification — t_8d33f464

Status: preparation and focused combined requalification PASS; independent reviewer t_137037d0 required. NOT rollout approval.

## Exact lineage and bounded correction

Tested HEAD: `755b39f9cbfbc4b607bcd92968580953338e174f`, branch `integration/latest-ui-t_8d33f464`, worktree `.worktrees/latest-ui-t_8d33f464`.
Product merge: `48c37f7e60b367ff672c62c4f017f539611d727b`.
Locator correction: `a1600eee15f98ba89d4eb68a77636a68d564629f`; subsequent frontend HEAD contains evidence only.

Fresh git merge-base --is-ancestor checks passed for main/FOUC `ff1d19fb427c054efd9e48bc546c9ec1398ef835`, selector product `bd7bc723d38a5b18dda05ff3baa2334af9247b9b`, selector QA `9507c45c964cb60e9f9555825e7c1172ae170d4e` and account product `32ab3631a878b8adce3e250d174dceca86d689e0`. Original integration/conflict details remain in PREPARATION.md. Review-only decdd1a was not substituted for selector lineage.

Inspected exact correction diff: only two obsolete summary locators became button accessible-name locators. All assertions, palette list and timeouts retained. Fresh product comparison confirms appearance-state.ts/initial-appearance.ts exactly match accepted account candidate; brand-header.tsx differs from selector QA only by accepted account authority selection. Selector popover code is preserved. No additional product changes in this retry.

Hotspot: apps/web/app/components/brand-header.tsx — both accepted lines touch this file; exclusive ownership passes to reviewer on completion.

## Independently executed commands

All executed in isolated candidate at tested HEAD; raw logs in `logs/requalification-*.log`.

| Command | Result | Log |
| --- | --- | --- |
| `npm run typecheck` | exit 0 | requalification-types.log |
| `API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build` | exit 0 | requalification-build.log |
| `QA_BUILT=1 UI_QA_SCREENSHOTS=output/latest-ui-backend-requalification npx playwright test -c playwright.account-theme.config.ts --output=output/latest-ui-backend-requalification-results` | exit 0; 1 passed (1.6m), nine-palette journey | requalification-account.log |
| `npx playwright test -c playwright.theme-picker.config.ts --output=output/latest-ui-backend-selector-results` | exit 0; 36 passed (1.3m) | requalification-selectors.log |
| `npx vitest run -c vitest.appearance.config.ts` | exit 0; 20 passed | requalification-policy.log |

Account coverage retains dashboard/account routes, all nine palettes, SPA/reload, responsive overflow, axe and client/shared preference persistence. Selector count includes overlapping existing coverage, not 36 distinct contracts. Startup ECONNREFUSED messages remain in successful account log; not hidden or claimed warning-free. Screenshots are local in output/latest-ui-backend-requalification; no manual visual acceptance claimed.

## Preservation and remaining gates

Fixture configuration inspected: memory:// PGlite, timestamped isolated private storage, operator database/key overrides removed, unused dotenv path, SMTP/account mail/live AI disabled, reuseExistingServer false. netstat showed fixture ports3110/3111/55432 free before launch and main3100/3101 listening. Tests did not use main data. Original failing log retains blob `df6e1e1c91fdace47fc67f9d28d86dfae38b06f7`; separate result folders preserve original evidence/expanded. Next-generated next-env.d.ts/tsconfig.json changes inspected and restored only in candidate; tracked diff clean afterward. Original untracked .next-expanded and evidence/expanded retained.

Main remains ui/global-design-system at ff1d19fb427c054efd9e48bc546c9ec1398ef835 with original untracked .worktrees/, docs/fouc-main-integration/ and docs/main-branch-integration/. No main checkout changes, process restart, cache clear, migration, database/account operation, push or deployment. No favicon scope expansion or D02/D06 work.

This supersedes PREPARATION.md's unresolved locator status, without altering its historical failure evidence. Independent reviewer owns combined production review and broader FOUC builder/history regression gate; full cross-browser/route/PostgreSQL qualification and operator-instance verification are not claimed. Mandatory runtime launcher/backup and later rollout/verification remain downstream, not performed here. Human acceptance remains deferred.
