# FOUC-QA-04: reproduced; transition-contract decision required

Task: t_3d811d15. Implementation is NOT complete. No product or test assertion changes have been made.

## Baseline and execution

- Product: b1ec076f72c4650785f5e73997e95a0a31d6d3bd.
- QA-only 54554dcee7bb34a657387c5453af6dab8001db78 cherry-picked as df3239f.
- Fresh worktree-local dependencies installed with `npm ci --ignore-scripts`. Initial build could not resolve Next within the worktree's Turbopack root; install resolved this. Both logs retained.
- TEMP, TMP, TMPDIR set to worktree-local `.runtime/tmp`.
- `NEXT_DIST_DIR=.next-expanded API_INTERNAL_ORIGIN=http://127.0.0.1:3111 npm run build`: passed after install.
- `QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser QA_EVIDENCE_DIR=evidence/scope-fix/red npx playwright test -c playwright.qa-expanded.config.ts`: one test failed at unchanged scope.spec.ts:113, expected client-dark, received light. Test continued through its independent client/user controls; no other assertion failure was reported.
- Harness used new isolated PGlite, private synthetic fixtures and real API, with live mail and paid AI disabled. No operator/private fixture copied.

Inspected `evidence/scope-fix/red/scope-client-pending.png`: actual client dashboard welcome heading is visible under Light and Scalyn. Settled screenshot shows QA Alpha and Client Dark. Raw frames, client B responsive/reload controls and identity summary are retained beside the images. This is normal successful-response latency, not the approved 503 exception.

## Root cause

`layout.tsx` resolves authoritative appearance for a document. `AppearanceProvider` correctly invalidates that snapshot after pathname changes so it cannot replay stale authority on return navigation. Each destination AppShell's `useBrand` then resolves browser branding asynchronously in a passive effect. Until it completes, the document retains its prior palette and the shell renders its default brand while destination children are already visible. Moving only the DOM write to a layout effect would not supply the missing authority.

Do not fix by retaining the initial root snapshot indefinitely, guessing the client palette/name, or caching palettes in persistent storage. A server template alone is also not enough to establish fresh back/forward authority: Next can reuse router payloads, and the installed root template only remounts on changes to its own segment. Installed Next documentation was read; no framework behavior change was made.

## Precise decision needed

The acceptance text permits a safe existing transition while authority is unknown, but the supplied test additionally requires the destination heading to be visible **before** the held successful browser branding response is released (lines 93–103). It then requires the authoritative client theme at that same pending point (lines 108–113). The existing document snapshot contains only the departure shared scope.

Consequently, retaining the departure view or showing an explicit nonblank pending transition until authority arrives cannot pass this unchanged test: it waits for the destination heading before releasing the response. Removing the browser fetch also hangs `await seen`. This is not a request to waive the defect or weaken wrong-scope assertions.

Recommended disposition for orchestrator/QA: approve authority-gated navigation. Keep a visible, clearly identified departure/pending surface, do not display destination content/branding until the destination authority is available, and provide failure/Retry without representing departure branding as destination branding. Amend the temporal test protocol explicitly to release after inspecting the pending view, then require every visible destination frame to have the correct scope/theme/name. Preserve this original RED test and evidence as historical diagnostics; add strengthened pending/settled frame assertions, both directions/back-forward and stale-response controls. Authentication changes must not retain another account's protected view.

Alternative if destination content must remain visible while that exact browser response is held: approve a second navigation-scoped server authority path and a coordinated pre-paint commit. The browser request becomes revalidation. This is a larger change; it needs freshness/generation rules for back/forward, identity/client changes and out-of-order responses. Do not implement duplicated fetching solely to satisfy a test without confirming that this is the intended contract.

No policy has been chosen or applied. This is a focused transition-contract escalation, not a request for the deferred human feature acceptance. Root QA owns the disposition and subsequent independent retest. Existing strict generated-outage evidence remains superseded, not green; the approved b1ec076 503 exception is untouched. Root's legacy assessment-flow and dirty builder exit failures remain untriaged and untouched.
