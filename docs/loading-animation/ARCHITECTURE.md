# Loading shell lifetime and authority prerequisite

Task **t_3fbaf854**, advisory to frontend **t_02ae82aa**. Decision: **safe to implement the constrained chrome-only design below; current implementation is NOT approved**. This is neither final review nor QA/owner acceptance. QA t_d69674e1 and final review t_ea348e19 remain downstream of implementation.

## Inspected revision and evidence

Inspected branch `ui/loading-animation`, HEAD **ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e**, isolated `.worktrees/loading-animation`. HEAD does not identify the entire inspected tree: `auth-ui.tsx` is modified; LoadingState/CSS, loading browser tests/config and docs/loading-animation were untracked at inspection. No product files were edited by this reviewer. This document is the advisory deliverable, not a committed implementation.

Read AGENTS.md, apps/web/AGENTS.md, DESIGN.md (including scoped appearance, account scope and standalone recovery), relevant feature-checklist entries, CHECKPOINT.md, SCOPED_APPEARANCE_TRANSITION_FIX.md, BUILDER_APPEARANCE_GATE_FIX.md, and installed Next layout/page documentation. Source findings:

- `components/app-shell.tsx:13-33,92-108`: each page owns AppShell, context and exact-route useBrand. Pending returns RecoveryFrame instead of ApplicationShell.
- `components/auth-ui.tsx:46-77`: context deduplicates only an in-flight request. Each hook initializes null, broadcasts completed context, and has no generation fencing. Keeping a previous Context object is not evidence of a newly verified identity.
- `components/brand-header.tsx:16-101`: exact pathname/account/client authority, render invalidation, layout-effect response generations, ten-second deadline and pre-paint palette commit. These guarantees must survive.
- `components/appearance-state.ts:21-27`: appearance scope is NOT identical to workspace. Learning `/clients` is shared; `/accounts` and `/account/security` are client-scoped when selected. Do not replace this resolver with a `/platform` check.
- `components/application-shell.tsx:187-325`: sidebar, header, client bar, content main, footer, mobile navigation, dialogs and theme controls currently share a page-owned component. Sensitive chrome is not just the logo: role links, name, client choices, settings dialogs, external branding link and theme controls all carry authority.
- `components/assessment-builder.tsx:58-99`: editor data lifetime is above Guest/AppShell. Its detached imperative root preserves newer input/save state/guard while the local host disappears. The parent must not be removed by a new root gate.
- `layout.tsx:14-36`, `appearance-provider.tsx:15-24`: request-scoped first-paint snapshot, not a navigation cache. `error.tsx`, `not-found.tsx` and `recovery-frame.tsx` deliberately have no shell/session dependency.

Independent execution: `npx playwright test -c playwright.loading-animation.config.ts --output=output/loading-architecture-review` returned **exit 1: one passed, one failed (8.0s)**. Session timer tracer passed. Shell tracer failed at `shell.spec.ts:38` because the complementary/sidebar element disappeared. The subsequent same-node/content-hidden assertions were not reached; do not claim them passed. Trace/error context are under `output/loading-architecture-review/`. The original `05-shell-red.txt` is preserved. No server/database fixture, main runtime, owner browser or native desktop was used. An attempted batched read via execute_code was denied by unattended approval policy and did not execute; ordinary read tools were used instead.

## 1. Concrete ownership: persistent chrome, unchanged page position

Add a client `AppShellRoot` inside the existing AppearanceProvider in root layout. It owns **only shell controller state and chrome outlets**, not permission to mount the route. Its children must always be rendered at the same React tree position with the same wrapper types, even when authority is pending, failed, guest, recovery or authenticated. Never key this root or its children by pathname/client/brand; never switch between `<ApplicationShell>{children}</ApplicationShell>` and bare children.

Conceptual ownership (names are an implementation contract, not supplied code):

```text
RootLayout (existing initial appearance/script/skip link unchanged)
  AppearanceProvider
    AppShellRoot / shell authority context
      stable frame div (mode changes via attributes/classes, not element type)
        persistent sidebar outlet
        stable column div
          persistent header/client-bar outlets
          stable route-slot div
            Next route boundary / Page or AssessmentBuilder   ALWAYS mounted by Next
              AppShell / Guest                              page-local boundary
                authenticated main#main with gated CONTENT
                OR existing GuestShell / standalone pending frame
          footer outlet
        mobile navigation/dialog outlets
```

Extract chrome rendering from ApplicationShell; do not duplicate its role/navigation predicates. The sidebar DOM node stays identical during same-workspace navigation, including while the new page mounts. Main/content remains page-owned. Root route-slot is a **div**, not another main. GuestShell and RecoveryFrame continue to own their own main. Exactly one visible main and `id=main` must exist. Preserve existing dimensions/breakpoints/tokens and menu focus behavior; this is ownership extraction, not visual redesign.

The root must not portal the **page** into a different parent or reparent the imperative editor. Prefer ordinary persistent chrome outlets as siblings of the fixed route slot, not a root conditional wrapper around route children. ApplicationShell can be split into chrome and content/frame primitives while preserving its existing standalone test adapter if necessary; the shipped app must have exactly one chrome owner.

Page-local AppShell consumes the root's resolved appearance status instead of issuing a competing useBrand writer. It returns its content loader/retry until **exact current route authority** is ready. The Page/AssessmentBuilder above it remains alive. The builder host detaches/reattaches through its existing callback; no changes to the builder's data lifetime, lazy mount or saved-URL/history logic are needed. Other page data fetches can still run as today; fetched data is not permission to reveal DOM.

## 2. Shell participation and recovery must be explicit

Do not infer successful shell participation solely from a pathname regex. `/platform/missing` and an error thrown on `/platform` can be recovery routes under the same root layout.

Use a page-local registration lease from AppShell to AppShellRoot: unique mounted instance token + current pathname/navigation generation + mode. Register/update/release in a layout effect. A cleanup may release only its own token, never a replacement page's newer lease. Root chrome visibility requires a live matching lease; an old route's lease never authorizes the new route. Reconcile route changes and registration before paint; keep the structural chrome nodes mounted through the handoff, but never paint protected chrome using an unmatched lease. Do not store React page children or arbitrary last-page props in this registry.

Standalone error/not-found must explicitly suppress chrome, independent of context/branding success (a tiny recovery registration component is sufficient). Suppression takes precedence over all shell leases, including same-path errors. Do not add fetching to RecoveryFrame. Do not mark every RecoveryFrame instance as standalone: AppShell currently uses it for appearance pending. Put standalone suppression at `error.tsx`/`not-found.tsx` or pass an explicit distinction. The root remains structurally transparent in recovery mode, with no sidebar/header/menus/main competing with RecoveryFrame. Cleanup also removes the old page's lease. Verify both initial 404 and SPA error/not-found, plus retry back to a valid page.

SSR/hydration must start without speculative authenticated chrome. Registration may settle before first client paint but must not fabricate a server session from local storage or create hydration mismatches. First paint appearance still comes from the existing server snapshot/script.

## 3. Separate content authority from chrome continuity

Two different keys are necessary:

1. **Content key**: existing exact pathname + account(environment/id) + effective appearance client, plus a monotonic generation. Preserve useBrand's A -> B -> A invalidation and response sequence semantics.
2. **Chrome continuity key**: verified account(environment/id), authentication mode, selected client ID (even on shared platform pages), workspace kind (platform/learning/guest), and appearance scope (`sharedAppearance(pathname, clientId)`). Compare the current verified permission projection too (`global_admin`, `canAdmin`, `canCoordinate`) and any changed display identity/client metadata. A pathname change alone may match this key; a scope/identity change never does.

A single in-memory last-confirmed chrome projection may be retained within one live document and one continuity episode. It contains presentation/context needed by chrome, not page contents, and is never a multi-key cache. It must NEVER satisfy the content gate or be passed to a page as authoritative destination appearance. No persistence in local/session storage, module-global cross-document cache, server snapshot reuse or URL-only account inference.

On a normal same-scope route change, stable structural header/sidebar remain. Only after current-context verification confirms the same continuity key may previously confirmed chrome branding remain visible while the new route's appearance is pending. Before that verification, retain **neutral structure only**, not the previous account's name, client brand or role links. This is the safe smaller concession: stable shell geometry/node identity does not promise stale identity decoration during a held session check. A last known context plus unchanged URL is insufficient proof.

When exact appearance arrives, publish current identity/permission projection and brand/theme together, pre-paint. While exact appearance is pending, do not enable theme mutations using a retained preferenceVersion. Root state changes must not reset editor data or toggle the Page subtree.

## 4. Context verification and request fencing (required, not optional caching)

The current untagged `contextRequest`/`trackercontext` channel is not enough for a persistent authority owner. Introduce a context-authority coordinator with monotonic session/scope epoch and request sequence; keep this narrowly scoped to context delivery. Root owns current route verification state separately from page data state.

- On pathname transition, allocate a navigation verification generation. Issue/reuse only a context request tagged for that valid epoch; root treats identity as unresolved until its result is accepted. Do not null out every page hook on ordinary navigation: the builder depends on client/CSRF/state and must survive save URL replacement. Existing page hooks can retain data; the root's presentation authority is separately pending.
- Fence BOTH promise delivery (`then(setContext)` today) and the broadcast. Old results must not publish to root or page subscribers after a session/client mutation. Aborting is useful but generation checks are mandatory. Deduplication may join only requests in the same epoch. Cleanup of an old request must not clear the reference to a newer request.
- Confirmed client switch/sign-out/identity replacement invalidates the epoch; pending transition begins **after confirmWorkLeave accepts and before sending the mutation**. Cancelled guard leaves the old UI and editor untouched. Login/mock/account-link paths which rotate identity must invalidate too; audit the actual mutation entry points, not just trackercontext listeners.
- While a switch/logout is in flight or has uncertain failure, conceal old scoped content/chrome. Keep retry/error reachable. Do not restore old authority merely because POST rejected or threw: re-read current context and appearance first. A lost response may have committed. Do not automatically retry logout/sign-in/client selection to discover the state.
- On accepted context mismatch, null user, changed permission projection or context failure, discard the chrome projection and invalidate any in-flight branding work from the old epoch. A -> B -> A requires a new verification/brand result; it cannot revive an older A projection.
- Root must bind appearance requests to the accepted context epoch as well as route key. No response initiated under the old session can become current merely because account/path strings happen to match later. Retain existing ten-second branding deadline and stale-response checks; add bounded context failure/retry if this coordinator introduces a new wait.

The existing Context API exposes account/environment and role flags, not a distinct mock identity ID or server permission revision. Therefore it cannot prove equality of two distinct mock identities belonging to the same account. Treat every known identity mutation as a new epoch regardless of matching fields; do not invent an identity ID from a display name. Unknown external session changes can only be detected by the next context response; no polling/security guarantee beyond the current server checks is asserted. Backend authorization remains decisive on every operation.

A minimal implementation may preserve existing useContext public shape and add tagged authority metadata/subscription for the root rather than rewriting every page. It may not leave the old unguarded completion path capable of rebroadcasting stale authority. Avoid a second uncoordinated session or appearance store.

## 5. Transition state table

| Event | Chrome | Page content / recovery |
| --- | --- | --- |
| Fresh document / unresolved session | Simple centered loader, no authenticated chrome | Protected content absent; accessible stable status; no large heading/card initially |
| Same workspace, current context not verified | Same structural shell nodes, neutral presentation | Exact-route gate closed; centered content loader |
| Same verified account/client/workspace/appearance scope | Existing chrome may stay, using current verified permissions; theme mutations unavailable until exact brand | Destination DOM absent until exact route brand; loader text after about 3000ms |
| Platform <-> Learning, shared <-> client appearance, client/account/auth change | Discard prior projection immediately; neutral structure or guest layout, no previous logo/name/role links/client choices | Outgoing scoped content absent; reveal destination identity/permissions/theme/brand together |
| Same-authority appearance refresh | Existing mounted inputs and shell remain; refresh/error feedback | Preserve existing refresh semantics; no false route transition/unmount |
| Context or appearance failure/timeout | No speculative destination authority; retain only still-verified safe chrome | Useful error and explicit appropriate retry, not endless spinner or blind sign-in retry |
| Standalone error/not-found | Suppress all chrome and dialogs | Existing RecoveryFrame/action/focus, no context dependency |

Neutral means no old client logo/name, user name/avatar, role-dependent links, client option list, theme palette preview, hidden/open popover or modal carrying stale scope. Close/clear top-layer menus on invalidation; hiding an ancestor does not safely dismiss a native top-layer popover. Preserve sidebar/header outer nodes on same-workspace handoff, not their sensitive descendants. Neutral pending presentation must use non-client semantic tokens across the visible viewport/canvas; merely removing the logo while inheriting client-generated colors is not neutral. Use an explicit temporary presentation scope/cover with built-in safe tokens, without overwriting stored preferences or labeling it authoritative. Ensure mobile gutters/top-layer surfaces do not leak the outgoing palette. On ordinary same-authority refresh do not apply this neutral override unnecessarily.

## 6. Fresh-document recovery and interaction preservation

Leave loadInitialAppearance, appearanceScript, initial snapshot invalidation and the bounded 503 platform-dark fallback policy intact. Root must honor `documentRecovery` only for the matching fresh-document bootstrap, not convert a SPA brand failure into documentRecovery. Guest login fields remain mounted across fresh-document 503 retry. The approved fallback is built-in navy Dark only for the already documented condition, not authority for retaining an old client theme.

LoadingState owns a stable accessible name and delayed explanatory text, no repeated announcements/focus grabs on each render, and reduced-motion static equivalent. Do not reuse RecoveryFrame's mount-focus effect for every normal route spinner. Keep explicit errors/actions visible immediately. Existing dirty/pending work guard, sign-out/client selection confirmations, actual-page-unmount cleanup, save/submit indicators and mobile dialog keyboard behavior are unchanged. Root navigation actions must read current context/CSRF, not a closure captured in a chrome snapshot.

## 7. Required regressions before implementation handoff

Keep shell.spec.ts's RED, same sidebar node assertion and protected-content absence assertion. Extend it rather than replacing it with geometry-only checks. Add held context, context failure/retry, identity/client changes before response, late context/branding responses, A -> B -> A, role downgrade, open popover/dialog invalidation, error/not-found suppression, and unknown-route recovery. Sample frames while waits are held; checking only settled state misses leaks. Add desktop/tablet/mobile and reduced-motion/timer/error controls. Test unchanged account/client with different pathname separately from shared/client appearance transitions including `/clients`, `/accounts`, `/account/security`.

The component fixture is not proof of Next layout ownership, SSR recovery or native-history behavior. Built-Next checks must verify stable sidebar/header nodes, single main/skip link, no hydration errors, no stale first frame, and the full builder save URL/newer edit/Back/Forward/lazy bundle/guard scenarios. Preserve historical evidence and update only loading-copy selectors where explicitly obsolete, never authority or identity assertions.

Commands below are **required future implementation/QA checks**, not results of this advisory. Run from the isolated worktree, with separate evidence directories. Each real-API test invocation needs its own harness/database lifetime (do not batch setup suites). Verify free ports first: expanded harness hardcodes 3110/3111/55432; first-paint uses its separately configured harness. Never attach to main 3100/3101, reuse owner storage, or kill unrelated listeners. This advisory did not run database fixtures.

```sh
npx playwright test -c playwright.loading-animation.config.ts --output=output/loading-animation-final
npm run typecheck
npx vitest run -c vitest.appearance.config.ts
npx vitest run tests/branding.test.ts
npx playwright test -c playwright.builder-workflow.config.ts
API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build
BUILDER_GATE_EVIDENCE=docs/loading-animation/builder-gate QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser npx playwright test builder-gate.spec.ts -c playwright.qa-expanded.config.ts --output=output/loading-builder-gate
QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser npx playwright test builder-loading.spec.ts -c playwright.qa-expanded.config.ts --output=output/loading-builder-lazy
QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser QA_EVIDENCE_DIR=docs/loading-animation/scope npx playwright test scope.spec.ts -c playwright.qa-expanded.config.ts --output=output/loading-scope
QA_BUILT=1 QA_TEST_DIR=tests/assessment-builder-ui-browser npx playwright test -c playwright.qa-expanded.config.ts --output=output/loading-builder-full
QA_BUILT=1 QA_TEST_DIR=tests/shell-browser npx playwright test -c playwright.qa-expanded.config.ts --output=output/loading-shell
QA_BUILT=1 QA_TEST_DIR=tests/guest-ui-browser npx playwright test -c playwright.qa-expanded.config.ts --output=output/loading-guest
API_INTERNAL_ORIGIN=http://127.0.0.1:3281 NEXT_DIST_DIR=.next-first-paint npm run build --workspace=@tracker/web
FIRST_PAINT_BUILT=1 npx playwright test -c playwright.first-paint.config.ts --output=output/loading-first-paint
 git diff --check
```

Also repeat the current account-theme matrix, overview/recovery and theme/workspace selector suites recorded in latest-ui-integration evidence, plus newly added built shell-lifetime/recovery cases. Preserve the historical superseded strict 503 assertion as historical failure; report approved-policy results separately, never silently skip/retire it to claim full green. Inspect generated config changes after builds and preserve other agents' pre-existing work.

## Handoff and limitations

**Advisory complete: concrete mechanism supplied, not a candidate approval.** Frontend t_02ae82aa owns implementation and TDD; unresolved shell RED remains a release blocker for that implementation. The two main implementation risks are (1) stale context publication accidentally authorizing retained chrome and (2) conditional root wrappers unmounting the imperative builder. Explicit leases/recovery suppression and separate epoch-fenced content/chrome authority address those risks without moving the page lifetime.

No architectural API/backend change, new dependencies, route-group migration, global page-cache or permissions relaxation is recommended. If the implementation cannot preserve the fixed children position and generation guarantees, stop that approach and report the concrete failing case rather than falling back to retained old client visuals. Build/full regressions and final independent review are still required. No deployment, main restart, human acceptance or full-browser qualification is implied.
