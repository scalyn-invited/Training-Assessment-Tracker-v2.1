# D01 final recovery/clean-state follow-up

The initial checkpoint is superseded by this follow-up and IMPLEMENTATION-HANDOFF.md. Additional desired-contract RED tests found that confirmed file evidence still left a permanent dirty warning, and that the existing learner-specific beforeunload listener did not participate in pre-context guards. Fixed the root causes rather than adding another navigation interceptor:

- Action returns an explicit success receipt. File and decision baselines advance only on a confirmed successful operation, never on cancel/error/unknown outcome. A dirty unrelated criterion still blocks unload after successful file confirmation. Untouched extraction output is not classified as human-edited evidence.
- Learner draft generation/saved counters, in-flight state and retained operation payload register in the shared page-memory guard. Dirty client-switch cancellation sends no POST; unknown autosave blocks the later context switch. Existing exact-operation retry and section/attempt logic unchanged.
- D01-clean-receipt-red.log and D01-decision-clean-red.log record the unwanted beforeunload after confirmed receipt. D01-learner-red.log records the unsafe context POST. Focused GREEN logs and FINAL-browser.log verify fixes. Typechecks pass.

Final independent evidence also extends D04 reordered/pinned renderers and D08 copy-operation replay and 375px provenance wrapping without new production behavior. D05 rerun screenshots now target implementation-screenshots, preserving the parent's evidence directory.

The actual Next integration test covers sidebar and Back/Forward cancellation plus clean navigation, with only API transport synthetic. Component tests separately exercise actual shell context handlers, reviewer fields and learner editor. This does not claim authenticated browser-to-server lifecycle, every browser engine, physical devices or all application forms. No private browser storage is added.
