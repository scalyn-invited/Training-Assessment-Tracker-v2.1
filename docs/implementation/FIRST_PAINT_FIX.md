# First-paint appearance correction

Task `t_eeccfb23`; baseline `b729e23435b6f0e68feba6962aaac20724df7d14`.
Status: implementation/self-verification complete; independent QA `t_8db94a12` and overall acceptance `t_d56e101f` remain open. No deployment, remote push or human acceptance.

## Root cause and investigation

QA's FOUC-01 reproduced saved Dark becoming Light for a visible interval on reload. The new regression independently reproduced the exact cause: with Next bundles withheld, the visible SSR document had `data-theme="light"` rather than `dark` (RED log).

1. Root layout hardcoded Light. `useBrand` read the scoped local preference only after a post-hydration branding fetch. This exposed both the wrong palette and fallback `Training Tracker` branding.
2. The current plain Dark navy tokens existed only inside shared shell scopes. Setting the root to Dark alone would still leave the body/canvas on the old neutral-black tokens.
3. `AppShell` treated unresolved session context as guest and could start guest appearance resolution on authenticated documents.

Styles are imported by the root/actual components and delivered by Next. No stale asset version or stylesheet-ordering cause was proven; no cache busting, font dependency or stylesheet reordering was added. The production build and withheld-bundle browser checks verify the actual Next renderer rather than a component router shim.

## Correction

- `proxy.ts` supplies the actual pathname as an overwritten internal request header, not a caller-controlled route scope.
- `initial-appearance.ts` resolves the existing API's authoritative branding/palettes per request. For non-guest routes with an existing session cookie, it first asks the existing context endpoint for identity; it does not derive identity from an untrusted preference or reuse another user's palette. No backend/schema modification.
- Root layout sends the configured theme and generated CSS properties with HTML. A small parser-blocking head script reads only the appropriate allowlisted local-storage preference before body paint. The key is JSON-serialized with `<` escaping; no branding text or private credentials enter executable script text. Only the intentionally mutable root attribute uses hydration-warning suppression.
- `appearance-state.ts` shares scope, key, palette and preference logic; `appearance-provider.tsx` supplies the document snapshot to the existing hook. It is invalidated on navigation/appearance changes, not persisted as a cross-account cache.
- `useBrand` initializes from that snapshot, keeps server-owned client preference precedence and does not resolve an unknown session as guest. Stale asynchronous refreshes cannot supersede newer refreshes. Theme controls do not claim a resolved preference before hydration and remain disabled in the session-wait guest boundary.
- Plain Dark's existing navy base colors move to `globals.css`, covering canvas/gutters/recovery. Shell-only accent/status semantics remain unchanged. No redesign or new System option; configured platform/client defaults still do not mean OS-following.

A second RED test caught an implementation-stage navigation problem: returning to the initial route replayed its old server default. Invalidating the one-document snapshot fixed this; the final built test verifies the new default remains through return navigation.

## Verification and reproduction

Run from the worktree root after `npm ci --ignore-scripts`:

```sh
npx playwright test --config=playwright.first-paint.config.ts
API_INTERNAL_ORIGIN=http://127.0.0.1:3281 NEXT_DIST_DIR=.next-first-paint npm run build
FIRST_PAINT_BUILT=1 npx playwright test --config=playwright.first-paint.config.ts
npx playwright test --config=playwright.guest-ui.config.ts
npx vitest run tests/branding.test.ts
npm run typecheck
git diff --check
```

The first-paint server uses explicit synthetic HTTP fixtures at 3281 and the real Next renderer at 3280; it does not qualify API permissions/authentication. The existing guest suite separately starts the actual API/worker/Next against isolated ephemeral PGlite and private storage on 3110/3111, with mail/paid AI disabled. Neither touches the running operator environment at 3100.

| Check | Result |
|---|---|
| Original withheld-hydration saved-Dark regression | RED: expected Dark, received Light; then GREEN |
| Return-navigation snapshot regression | RED: expected Platform Dark, received Light; then GREEN |
| Production build | PASS; all application routes now request-rendered, not statically cached |
| Final built browser matrix | **17 passed** |
| Existing real API guest/account-link journey | **1 passed**, including password/MFA recovery, invitation/reset flows, theme persistence/reset, mobile overflow and axe checks |
| Existing branding domain tests | **6 passed** (the earlier command also named nonexistent `http-policy.test.ts`; only branding ran, so no HTTP-policy test claim) |
| Final server/web TypeScript | PASS |
| Diff whitespace check | PASS |

Built cases cover every exposed guest built-in/platform-generated palette before hydration, native scheme, conflicting OS preference, reload, missing/malformed/blocked storage, configured-default reset, delayed authenticated session context on shared/client routes, failure/retry, return navigation, and not-found recovery. The temporal case saves Dark through the UI, then samples each visible animation frame through reload at widths 1440, 801, 800, 390 and 320. The 390px case disables browser cache and adds 200ms latency / 200000 Bps down / 100000 Bps up. Every collected visible-frame sample must retain Dark and navy canvas/shell, and each viewport checks horizontal overflow. These are frame observations, not a compositor-video or zero-CLS claim.

Evidence in the attached `first-paint-evidence.tar.gz`: RED and GREEN logs, final build/type/guest/domain logs, pre-hydration and settled screenshots, responsive screenshots and timestamped per-frame JSON. The initial and settled desktop screenshots and 390px screenshot were actually inspected: navy and known Scalyn branding remain consistent, controls use the current styling, and mobile fields fit. Initial session text is replaced by the form; normal content insertion remains visible. At a short desktop viewport the existing centered introduction/footer can move when the taller sign-in form arrives; no blanket zero-layout-shift claim is made.

Intermediate issues retained accurately: a new helper initially collided with existing `appearance.tsx`; renamed to `appearance-state.ts`. Two test selectors initially matched multiple/hidden elements; scoped/hidden-aware selectors corrected without relaxing palette assertions. Real integration startup emitted readiness-probe ECONNREFUSED messages before the API became ready, then the test passed. Generated Next tsconfig/next-env changes were restored; the dedicated build output is ignored.

## Constraints / independent QA disposition

- Early resolution has one **2500ms total network deadline**, not a forced wait or blank-screen timer. Successful responses render immediately. The critical appearance dependency now contributes to document TTFB; ordinary page data remains client-loaded.
- If the API cannot resolve identity/default/generated palettes, the document uses the existing visible fallback/retry path; a known guest built-in saved theme still applies. Exact eventual generated/default appearance **cannot be guaranteed during that outage**, and a successful retry can change it. No stale private palette is persisted to conceal this. This is an explicit remaining constraint for QA/owner disposition, not a passing no-flash claim.
- Server context resolution uses the existing context endpoint, which refreshes a valid session and may create an anonymous replacement for an expired cookie; server bootstrap intentionally does not propagate that replacement cookie or CSRF value. The normal browser context flow still establishes the session. This adds a context lookup on authenticated document requests; load/rate-limit qualification is not included.
- Existing pre-hydration brand/image space is reserved by the existing fixed logo dimensions. No new skeleton or blanket hidden-app gate was added. Full zero-CLS qualification, layout of all routes, all branding failure modes, client switching between distinct real users/clients, strict future CSP, other browser engines, and the baseline's exact 800ms hard-reload matrix remain independent QA work.
- No OS `system` option exists; none was introduced. Light/Dark/neon/generated themes and preference precedence were preserved.

## Files / handoff

Application: root layout and proxy, new `initial-appearance.ts`, new appearance state/provider, `brand-header.tsx`, `app-shell.tsx`, guest picker readiness, root/token CSS. Supporting: `.gitignore`, dedicated Playwright config/server and three spec files, this record and DESIGN.md clarification.

Use the final local implementation commit from the Kanban handoff. Do not run QA against the unchanged operator dev server and call it this fix. The pre-created QA child should independently apply the implementation commit, use the designer's acceptance contract at commit `7c12826129d3dcd11632e2b0c51b3ab0004e685f`, and assess the constraints above. Completion of this implementation card only releases that QA lane.
