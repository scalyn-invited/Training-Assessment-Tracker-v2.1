# Global UI submission — 20 November 2026

Bernie's reply, forwarded by the user, authorizes reconciling with current `dev`, pushing `ui/global-design-system`, and opening a PR targeting `dev`. Leave it unmerged for his review. This supersedes the earlier no-push boundary; deployment remains unauthorized.

## Reconciliation

- Pre-submission UI checkpoint: `9531c1e`; recovery branch `backup/global-ui-before-dev-9531c1e` retained locally.
- Fetched `origin/dev`: `e4a4588` (also the fetched main tip).
- Merge: `3578819`, with both current dev and the completed UI history preserved.
- Dev's three commits absent from the UI history merge the old Settings PR and subsequently revert it. The effective incoming changes remove Settings routes, assets, historical evidence, test coverage and the personal-settings profile entry point. They do not add a new backend or migration fix.
- Inspected each affected path and retained the later global Settings/shared-shell implementation under Bernie's global UI directive. The resolved merge tree is byte-for-byte identical to `9531c1e`. The PR must explicitly disclose this Settings reintroduction relative to dev.
- `e44b295`, Bernie's complete assessment workflow-fix commit, remains an ancestor. The PR includes its implementation and evidence, not just migrations `0032`/`0033`: member-safe return guidance, immutable assessment-copy provenance and fresh membership authorization checks. Its substantial historical evidence is deliberately preserved.

The first broad restore command was rejected by automatic approval review. It did not execute. After inspecting the individual diffs, explicit resolutions were approved for the conflicting components, deleted Settings artifacts and Settings-only test/style hunks. No unrelated dev changes were discarded.

## Fresh local verification

| Check | Result |
| --- | --- |
| Settings browser | Pass, 23.7s test / 40.3s overall |
| Overview browser | Pass, 22.2s / 31.9s |
| Shared shell browser | Pass, 21.3s / 33.3s |
| Membership, assessment definitions and assessment reviews domain suites | 18 tests pass, 19.28s |
| TypeScript | Pass |
| Separate-output production build | Pass, `.next-clients-build` |
| Source style/route audit | Pass; same 38 routes, 33 CSS Modules and 627 static references as final UI audit |

Browser/domain fixtures use isolated databases and storage. Generated Next config changes are restored. Existing full-route evidence remains in `GLOBAL_UI_FINAL_QA.md` and the route inventory; it is not represented as rerun in this checkpoint. Workflow harnesses are also configured for remote CI; their renderer deliberately refuses a checkout containing local environment files.

All 161 untracked files present at submission start and the stash inventory are preserved by path/hash checks. The original 67-entry preservation baseline also remains intact. No local environment files, UX Engine folder, downloaded archify folder or team drafts are added to the PR. Committed Archify reference files already present in dev remain unchanged. V2 is untouched.

## Review boundary

The published PR and GitHub Actions are the source for remote CI status; local tests do not establish remote success. Do not merge or deploy. Human technical/UX and owner acceptance remain deferred, and full V2.1 parity/production readiness is not claimed. Review the Settings reintroduction and assessment workflow migrations explicitly.
