# D03 exact publication and conflict recovery

Implemented after separate real RED runs: four lost-publication scenarios failed because no exact GET occurred (`D03-publish-red.log`); stale-save desired stop/compare failed on old copy-before-reload message (`D03-conflict-red.log`). GREEN logs: D03-publish-green, D03-browser-green, D03-browser-final and D03-typecheck (exit0).

Commands: `node node_modules/playwright/cli.js test -c playwright.workflow-qa.config.ts` (focused `-g` runs as named), `npm run typecheck`, Prettier on test file, non-log `git diff --check`.

Unknown publication now stops save/publish, reads back exact definition/client, confirms published status only for that ID, or permits explicit retry of unchanged saved draft. Readback denied/unavailable retains unknown state and offers Check publication status. No blind mutation retry/new revision is issued. Definitive request rejection remains distinct. Editing during pending publication remains local and cannot write until reconciliation.

409 save stops writes without replacing any structured local content. Explicit authorized comparison reads the same definition and provides private local/saved snapshots (including author answer keys, labeled); no export/download, automatic merge, force-save or backend bypass. Explicit discard/reload requires confirmation. Unknown save continues exact same-token/payload replay before saving newer typing; regression passed.

Limits: fixture browser transport is fault injection, not a real network-commit proof. Parent domain test establishes exact publish retry conflict/readback separately. Real conflicting browser sessions/auth expiry matrices and exhaustive comparison/reload keyboard qualification remain downstream QA. Sensitive draft stays only in page memory. No API/domain/schema changes in this slice.
