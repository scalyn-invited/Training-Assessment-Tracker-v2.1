# Workspace popover — t_6bd6979d

## Candidate and scope
Implementation commit: `d08d2fcde3de64ce3b579f64e33fe8bbb6a3830a` (documentation/evidence follow-up only thereafter).
Initial worktree HEAD was `ff1d19f`, not the completed dependency. Fast-forwarded to exact reviewed selector correction `ed826d2a87dd868b474e854c6c06433aeb4cc799`, including theme product `9b8fe827cb711c9efba01ee03e53a10deaf4af4e`. The required independent QA commit `4973daae85fc59313f06031230816139dbe31f0e` was a sibling, not an ancestor: merged locally at `9e875d1a268fd13c079fc45d368ca1fdf0894e98`. No unrelated working changes existed; no remote operations.

Replaced only Workspace's inline details with a native auto popover, using a small workspace-specific component and the theme picker's proven viewport positioning and focus/dismissal patterns. Original labels, order, hrefs, predicates and Platform aria-current remain unchanged. No application-menu roles, new keyboard conventions, backend changes or permission changes. Native anchors/Next Link and document navigation guards remain authoritative. Cancelled guarded navigation leaves the link and draft available. Existing mobile sidebar/header, personal settings and learning menu workflow remain unchanged.

Positioned fixed in the browser top layer, clamped against visual viewport with 8px gaps and available-height internal scrolling. Sidebar overflow is not suppressed. The trigger retains original two-line Workspace/current-name content. Uses existing surface/text/border tokens and compact radii; no new palette or dependencies. Read root guidance, Next Link docs and UX Engine design-system, visual-character, responsive and state-completeness skills from the installed Downloads package (the path described in DESIGN.md was absent in this worktree).

## RED → GREEN and verification
Evidence is under `docs/implementation/evidence/workspace-popover/`.

- `npm ci --ignore-scripts`: 275 packages installed, audit zero vulnerabilities.
- `npx playwright test -c playwright.theme-picker.config.ts workspace.spec.ts --output output/workspace-red`: original implementation failed the geometry assertion. At 1280x460 sidebar height grew **460 → 663**, navigation y **166 → 401**, width stayed247. Original screenshot, failure context and trace retained in `workspace-red.tar.gz`; `workspace-red.log` records expected failure.
- Same unchanged regression passed after implementation.
- `npx playwright test -c playwright.theme-picker.config.ts workspace.spec.ts theme-picker.spec.ts --output output/workspace-green`: **21 passed** (12 workspace, 9 original theme). `workspace-green.log` and archive.
- `npx playwright test -c playwright.workspace-popover.config.ts`: **1 integrated journey passed**, repeated after adding real dirty-work cancellation/confirmation. Final `workspace-real-final.log` and `workspace-real.tar.gz`.
- `npm run typecheck`: passed server and web.
- `npx vitest run --config vitest.appearance.config.ts`: **14 passed**.
- `npx vitest run tests/branding.test.ts`: **6 passed**.
- `npm run build`: passed server compile and Next production build. Browser journeys use development renderer, not this built server.
- Prettier applied to changed TS/TSX/CSS; `git diff --check` passed. Build/dev regenerated Next environment/type configuration; inspected and restored these generated-only changes.

### Coverage
Component tests exercise real production shell/CSS with synthetic context: desktop1280x600, short1280x300, narrow320x300,390x420 and breakpoint800x300. Assert top-layer bounds, normal Tab/Shift+Tab, Enter/Space, Escape return, trigger toggle, outside-click preservation of actual clicked control focus, last link reachable at constrained height and open-panel axe WCAG A/AA. Both theme and workspace popovers dismiss each other without focus theft. Contract matrix checks Global Admin, member, client admin, white-label and non-white-label visibility and all destinations/order, including external Cerebru href. The external site was not visited.

Integrated fresh Next/API/PGlite journey saves and reloads all seven real client themes, resets client default, checks existing theme dialog and sidebar geometry/focus at four sizes, then actually follows Platform administration, Learning workspace, Choose your client and Manage account access to their routes. Workspace panel geometry stays within viewport and sidebar scroll dimensions are unchanged at all five workspace sizes. Real Notifications preference dirty-work guard rejects navigation on Cancel without losing checked draft, then navigates to dashboard on confirmation. No browser pageerror events. Existing legitimate short-height learning sidebar remains scrollable and Account security is brought into viewport in the inherited theme probe.

Screenshots `workspace-1280x600.png` and `workspace-320x300.png` visually inspected: readable existing tokens, trigger, links and focus outline, no panel clipping; overlay covers navigation rather than displacing it. All five workspace screenshots retained. Native Next dev indicator is visible in some screenshots; not product UI.

## Isolation and limitations
Windows Chrome headless, Node24.19.0. Fresh timestamped ephemeral PGlite and private storage under this worktree; ports **3490/3491/55449**, `.next-workspace` isolated output, `reuseExistingServer:false`. Launcher excludes operator .env and clears database/encryption/scan overrides; live email/SMTP/AI explicitly disabled. No V2 writes, deployment, push or live service actions. Initial readiness ECONNREFUSED warnings precede API startup and passing tests, retained in logs.

No Firefox/Safari, manual screen reader, native touch/pinch zoom or PostgreSQL qualification. Permission visibility matrix is component-fixture evidence, not new real-role backend qualification. Existing appearance policy/branding and theme persistence passed; full temporal first-paint/all-route suites and original guest journey were not rerun here (downstream independent QA explicitly owns the guest correction requalification). No whole-app accessibility, human acceptance, production readiness or main-app integration claim.

## Handoff
Implementation phase complete; release precreated independent QA `t_24b58504` on this exact local candidate and documentation follow-up. Overall acceptance remains with root `t_21dcd42a`. No further feature started.
