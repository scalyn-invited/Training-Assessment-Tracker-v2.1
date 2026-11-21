# Theme selector popover — t_32d79f81

## Scope and handoff

Implementation phase complete; independent QA is `t_d0f9320a` and overall review remains with `t_21dcd42a`. No deployment, remote push or human acceptance. Workspace selection is explicitly NOT changed by this bounded card; its additional owner request was reported to the root for routing.

## Implementation

- `apps/web/app/components/brand-header.tsx`: replace the inline details disclosure with a native button and `popover="auto"` top-layer overlay. No existing popover primitive or dependency was present. Keep the original theme enumeration, pressed state, local-storage key/reset, versioned client preference POST and branding-change event.
- Native top layer avoids ancestor overflow clipping while keeping CSS token inheritance and DOM membership inside the existing Personal settings dialog. Fixed positioning clamps horizontally and chooses available space above/below the anchor; options scroll internally. Window/ancestor scroll and visual viewport resize/scroll reposition the overlay. Sidebar overflow remains `auto`.
- Native button Enter/Space activation; option Tab traversal, Up/Down and Home/End; Escape closes only the picker and restores trigger focus. Outside click dismisses; clicking another control retains its deliberate focus, while blank-area dismissal restores the trigger. Pointerdown tracks the initial toggle state to avoid reopening after blur/light-dismiss.
- Saving/error/reload controls live inside the overlay, not sidebar layout. Focus moves to its labelled group while options disable, avoiding accidental blur dismissal. Success retains the existing live-region announcement.
- `ui/theme-picker.module.css`, `ui/guest.module.css`, `platform/overview.module.css`, `globals.css`: retain existing colours, dots, typography, border/shadow treatment and remove conflicting inline/guest positioning. Touch targets have a 44px minimum.
- `playwright.theme-picker.config.ts` and `tests/theme-picker-browser/theme-picker.spec.ts`: existing esbuild + Playwright browser-component pattern, actual production shell/picker/CSS, synthetic transport only.
- Existing browser test consumers now locate the theme trigger by button role/name rather than the retired summary tag. Geometry probes target the button; lesson close assertion now checks `aria-expanded=false`. Test assertions and business flows otherwise retained. The wider selector-only suites were not all re-executed.

## Verification performed

Windows host; installed Chrome, headless; Node/npm project tooling. `npm ci --ignore-scripts`: installed successfully, audit reported zero vulnerabilities. No new dependency.

1. **RED overflow**: original sidebar scrollHeight changed from **600 to 744** on opening at 1280×600. Same test GREEN after overlay implementation; scrollHeight remains **600**.
2. **RED keyboard**: ArrowDown retained Light instead of focusing Dark; GREEN after keyboard handling.
3. **RED toggle/focus**: trigger pointer click reopened after blur; blank-area dismissal left focus outside trigger. Both GREEN after pointer ordering and focus restoration fixes.
4. **RED async**: Saving status was not visible inside overlay; disabling focused options also dismissed it. GREEN after moving status/error UI into the panel and focusing its group during save. Original client failure trace retained under `evidence/theme-popover/client-red/`.
5. `npx playwright test -c playwright.theme-picker.config.ts`: **9 passed** in final run. Covers all seven built-in themes and default reset/storage, selected state, client version/CSRF/theme payload and failure/retry, pointer/keyboard, axe WCAG A/AA, desktop resize, 375×420 and 320×568 dialog nesting, 1280×300 constrained scrolling. Short desktop proves both legitimate sidebar scrolling and internal panel scrolling remain usable.
6. `npm run typecheck`: **pass**, including after reverting generated Next test-build configuration churn.
7. `npm run build`: **pass**; final candidate also built with the isolated first-paint API origin and output directory.
8. `npx vitest run --config vitest.appearance.config.ts`: **14 passed**. `npx vitest run tests/branding.test.ts`: **6 passed**.
9. Final built-Next regression command below: **4 passed** (pre-hydration geometry, exact reload geometry matrix, configured default reset/reload, responsive temporal navy/recovery matrix). Real Next renderer and synthetic HTTP API; not production authentication qualification.
10. `git diff --check`: **pass**. Relevant TSX/CSS/test/config formatted with existing Prettier. No ESLint script exists.
11. Inspected captured desktop and 375×420 screenshots: anchored panel, readable options, visible focused default option, contained scrolling and no clipping. Fixture omits actual icon image transport; not a complete visual acceptance claim. Screenshots retained beside this report.

```sh
API_INTERNAL_ORIGIN=http://127.0.0.1:3281 NEXT_DIST_DIR=.next-first-paint npm run build --workspace=@tracker/web
FIRST_PAINT_BUILT=1 npx playwright test -c playwright.first-paint.config.ts geometry.spec.ts temporal.spec.ts precedence.spec.ts -g 'geometry|reset returns|visible frame'
```

### Intermediate harness findings

A dev-server geometry run timed out waiting for the email form. An initial production test build omitted API_INTERNAL_ORIGIN: Next baked the default local API rewrite into its output, so the reset test observed Light instead of the synthetic configured Platform Dark. Rebuilding with the isolated origin at build time (not just runtime) resolved the mismatch; final unchanged four assertions pass. These failed runs are not represented as product passes. No API mutation was made by these guest/local preference tests.

## Limits / QA guidance

- Independent QA and full existing end-to-end matrix still required; no Safari/Firefox or manual screen-reader qualification claimed. Uses the modern native Popover API.
- Component tests assert UI persistence and synthetic client requests; real client authority/persistence rules remain covered by unchanged domain tests and are a downstream QA focus.
- No theme resolver, first-paint authority, authentication, permission, branding-generation, backend or workspace-selector changes.
- Static self-review: no secrets, unsafe HTML, new storage of sensitive values, dynamic evaluation or new external integration. Existing API input/version handling retained. Independent review is downstream, not claimed complete here.
