# Shared presentation controls

Source: the existing Overview, Clients, People & access, Audit and Settings Figma implementation. The global contract is in root `DESIGN.md`; migration and evidence are in `docs/implementation/GLOBAL_UI_ROUTE_INVENTORY.md`.

Use `tokens.module.css`'s `theme` class once at a migrated layout boundary. It inherits the existing theme/brand resolver; do not nest it in previews or replace theme persistence. The reference shell composes it while older routes remain isolated for bounded migration.

- `controls.tsx`: native Button, Input, Select and Textarea attributes/ref are forwarded. Buttons default to `type="button"`; explicitly use `type="submit"` in forms. Callers own validation, disabled/busy state, labels, hints, errors and draft preservation. PageHeader, Panel and Badge carry visual structure; Feedback preserves alert/status semantics without adding data flow. RouteTabs renders links with `aria-current`, not tabpanel widgets.
- `dialog.tsx`: call `dialogRef.current.showModal()`/`close()` using the existing feature workflow. Supply a unique `titleId` matching a heading. Native Escape and focus return remain; Tab containment includes inputs, selects, textareas and skips disabled/hidden controls. `onCancel`, `onClose` and other native attributes are forwarded so unsaved-work guards can remain feature-owned. Do not add automatic confirmation or dismissal.
- `directory.tsx`: retain native caption, header, body, labels and actions as children. Opt into stacked rows only where the existing feature layout calls for them. Clients composes `table stacked` into its own CSS class, retaining its column widths and mobile sort. Comparison/editor matrices must keep their own scrolling treatment. Pagination wraps caller-supplied controls; it does not calculate pages or fetch data.

Lower-specificity shell resets allow shared component styles to survive stylesheet ordering. Do not add broad global overrides to work around legacy styles. Retire each old selector only after its consumers have moved and the relevant browser checks pass.

Available primitives and variants are not a blanket verification claim. Each new consumer still needs the applicable role, validation, recovery, keyboard, theme, branding and desktop/mobile checks before its route can be marked complete.
