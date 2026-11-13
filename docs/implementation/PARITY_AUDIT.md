# Captured-source parity audit

Scope: captured V2 implementation only. The route/command/test inventory, action reviews, focused reproductions and final execution evidence below establish local port completion. Inventory rows alone are not proof; read them with the recorded checks and evidence boundaries. Human acceptance and live deployment remain separate.

## Source routes

Source: `platform/routes/web.php`. Screens may have new URLs; old bookmarks are not claimed compatible. API paths use the Next web proxy. Private account tokens use fragments instead of path segments.

| Source operation | Handler | Target entry points |
| --- | --- | --- |
| `GET /` | `redirect/view` | `/dashboard` |
| `GET /login` | `SessionController.create` | `/login; /api/auth/*` |
| `POST /login` | `SessionController.store` | `/login; /api/auth/*` |
| `POST /logout` | `SessionController.destroy` | `/login; /api/auth/*` |
| `GET /platform-logo` | `PlatformController.logo` | `/platform; /platform/{clients,admins,appearance,audit}; /api/platform/*` |
| `GET /assessments` | `AssessmentController.index` | `/assessments; /assessments/definitions/[id]; /assessments/assignments/[id]; /api/assessments/*` |
| `POST /assessments/media` | `AssessmentMediaController.upload` | `/api/assessments/media/*` |
| `GET /assessments/media/{id}/status` | `AssessmentMediaController.status` | `/api/assessments/media/*` |
| `POST /assessments/media/{id}/retry` | `AssessmentMediaController.retry` | `/api/assessments/media/*` |
| `GET /assessments/media/{id}` | `AssessmentMediaController.show` | `/api/assessments/media/*` |
| `GET /assessments/definitions/{id}/assign` | `AssessmentAssignmentController.show` | `/assessments/definitions/[id]/assign; /api/assessments/{assignments,assignment-options,team-rules}` |
| `POST /assessments/definitions/{id}/assign` | `AssessmentAssignmentController.store` | `/assessments/definitions/[id]/assign; /api/assessments/{assignments,assignment-options,team-rules}` |
| `GET /assessments/definitions/new` | `AssessmentController.edit` | `/assessments; /assessments/definitions/[id]; /assessments/assignments/[id]; /api/assessments/*` |
| `GET /assessments/definitions/{id}` | `AssessmentController.edit` | `/assessments; /assessments/definitions/[id]; /assessments/assignments/[id]; /api/assessments/*` |
| `POST /assessments/definitions` | `AssessmentController.definition` | `/assessments; /assessments/definitions/[id]; /assessments/assignments/[id]; /api/assessments/*` |
| `POST /assessments/appeals/assign` | `AssessmentController.routeAppeal` | `/assessments; /assessments/definitions/[id]; /assessments/assignments/[id]; /api/assessments/*` |
| `GET /assessments/{id}` | `AssessmentController.show` | `/assessments; /assessments/definitions/[id]; /assessments/assignments/[id]; /api/assessments/*` |
| `POST /assessments/{id}` | `AssessmentController.act` | `/assessments; /assessments/definitions/[id]; /assessments/assignments/[id]; /api/assessments/*` |
| `GET /platform` | `PlatformController.show` | `/platform; /platform/{clients,admins,appearance,audit}; /api/platform/*` |
| `GET /platform/{section}` | `PlatformController.show` | `/platform; /platform/{clients,admins,appearance,audit}; /api/platform/*` |
| `POST /platform/actions` | `PlatformController.act` | `/platform; /platform/{clients,admins,appearance,audit}; /api/platform/*` |
| `POST /platform/appearance` | `PlatformController.saveAppearance` | `/platform; /platform/{clients,admins,appearance,audit}; /api/platform/*` |
| `GET /clients` | `ClientContextController.show` | `/clients; /api/clients/select` |
| `POST /clients` | `ClientContextController.store` | `/clients; /api/clients/select` |
| `POST /settings/appearance/preference` | `ThemePreferenceController.save` | `/settings/appearance; /api/branding/preference` |
| `VIEW /settings/appearance` | `redirect/view` | `/settings/appearance` |
| `POST /settings/appearance` | `BrandingController.save` | `/settings/appearance; /api/branding` |
| `GET /branding/{client}/logo` | `BrandingController.logo` | `/settings/appearance; /api/branding` |
| `GET /files/{id}/extraction` | `DocumentExtractionController.show` | `/enrolments/[id]/documents/[fileId]; /api/enrolments/{id}/{documents,document-reviews}/*` |
| `POST /files/{id}/extraction` | `DocumentExtractionController.request` | `/enrolments/[id]/documents/[fileId]; /api/enrolments/{id}/{documents,document-reviews}/*` |
| `POST /extractions/{id}/review` | `DocumentExtractionController.review` | `/enrolments/[id]/documents/[fileId]; /api/enrolments/{id}/{documents,document-reviews}/*` |
| `GET /reviews` | `DeliveryController.reviews` | `/learning-reviews; /enrolments/[id]/delivery; /enrolments/[id]/submissions/[submissionId]; /api/enrolments/*` |
| `GET /notifications` | `NotificationsController.show` | `/notifications; /api/notifications` |
| `POST /notifications` | `NotificationsController.preference` | `/notifications; /api/notifications` |
| `GET /administration` | `AdministrationController.show` | `/administration; /api/clients/*; /api/enrolments; /api/promotions/*` |
| `POST /administration` | `AdministrationController.act` | `/administration; /api/clients/*; /api/enrolments; /api/promotions/*` |
| `GET /enrolments/{id}/progress` | `ProgressionController.show` | `/enrolments/[id]/progress; /api/enrolments/{id}/{progress,support}` |
| `POST /enrolments/{id}/progress` | `ProgressionController.act` | `/enrolments/[id]/progress; /api/enrolments/{id}/{progress,support}` |
| `GET /enrolments/{id}/learn` | `DeliveryController.show` | `/learning-reviews; /enrolments/[id]/delivery; /enrolments/[id]/submissions/[submissionId]; /api/enrolments/*` |
| `POST /enrolments/{id}/activate` | `DeliveryController.activate` | `/learning-reviews; /enrolments/[id]/delivery; /enrolments/[id]/submissions/[submissionId]; /api/enrolments/*` |
| `POST /enrolments/{id}/lifecycle` | `DeliveryController.lifecycle` | `/learning-reviews; /enrolments/[id]/delivery; /enrolments/[id]/submissions/[submissionId]; /api/enrolments/*` |
| `GET /lessons/{id}/{index}` | `DeliveryController.lesson` | `/learning-reviews; /enrolments/[id]/delivery; /enrolments/[id]/submissions/[submissionId]; /api/enrolments/*` |
| `POST /lessons/{id}/{index}/save` | `DeliveryController.save` | `/learning-reviews; /enrolments/[id]/delivery; /enrolments/[id]/submissions/[submissionId]; /api/enrolments/*` |
| `POST /lessons/{id}/{index}/quiz` | `DeliveryController.quiz` | `/learning-reviews; /enrolments/[id]/delivery; /enrolments/[id]/submissions/[submissionId]; /api/enrolments/*` |
| `POST /lessons/{id}/{index}/submit` | `DeliveryController.submit` | `/learning-reviews; /enrolments/[id]/delivery; /enrolments/[id]/submissions/[submissionId]; /api/enrolments/*` |
| `POST /blocks/{id}/early-start` | `DeliveryController.early` | `/learning-reviews; /enrolments/[id]/delivery; /enrolments/[id]/submissions/[submissionId]; /api/enrolments/*` |
| `GET /submissions/{id}` | `DeliveryController.receipt` | `/learning-reviews; /enrolments/[id]/delivery; /enrolments/[id]/submissions/[submissionId]; /api/enrolments/*` |
| `POST /submissions/{id}/review` | `DeliveryController.review` | `/learning-reviews; /enrolments/[id]/delivery; /enrolments/[id]/submissions/[submissionId]; /api/enrolments/*` |
| `GET /settings/ai` | `AiController.settings` | `/settings/ai; /enrolments/[id]/generation/[runId]; /api/ai/*; /api/enrolments/{id}/plan/generation` |
| `POST /settings/ai` | `AiController.policy` | `/settings/ai; /enrolments/[id]/generation/[runId]; /api/ai/*; /api/enrolments/{id}/plan/generation` |
| `POST /settings/ai/{id}/reconcile` | `AiController.reconcile` | `/settings/ai; /enrolments/[id]/generation/[runId]; /api/ai/*; /api/enrolments/{id}/plan/generation` |
| `POST /enrolments/{id}/generation` | `AiController.request` | `/settings/ai; /enrolments/[id]/generation/[runId]; /api/ai/*; /api/enrolments/{id}/plan/generation` |
| `GET /generation/{id}` | `AiController.show` | `/settings/ai; /enrolments/[id]/generation/[runId]; /api/ai/*; /api/enrolments/{id}/plan/generation` |
| `GET /enrolments/{id}/onboarding` | `LearningController.onboarding` | `/enrolments/[id]/{onboarding,plan}; /api/enrolments/{id}/{onboarding,calendar,plan}` |
| `POST /enrolments/{id}/onboarding/calendar` | `LearningController.calendar` | `/enrolments/[id]/{onboarding,plan}; /api/enrolments/{id}/{onboarding,calendar,plan}` |
| `POST /enrolments/{id}/onboarding/{step}` | `LearningController.save` | `/enrolments/[id]/{onboarding,plan}; /api/enrolments/{id}/{onboarding,calendar,plan}` |
| `GET /enrolments/{id}/curriculum` | `LearningController.show` | `/enrolments/[id]/{onboarding,plan}; /api/enrolments/{id}/{onboarding,calendar,plan}` |
| `POST /enrolments/{id}/curriculum` | `LearningController.create` | `/enrolments/[id]/{onboarding,plan}; /api/enrolments/{id}/{onboarding,calendar,plan}` |
| `POST /enrolments/{id}/curriculum/edit` | `LearningController.edit` | `/enrolments/[id]/{onboarding,plan}; /api/enrolments/{id}/{onboarding,calendar,plan}` |
| `POST /enrolments/{id}/curriculum/review` | `LearningController.review` | `/enrolments/[id]/{onboarding,plan}; /api/enrolments/{id}/{onboarding,calendar,plan}` |
| `GET /dashboard` | `WorkspaceController.index` | `/dashboard; /people; /enrolments/[id]; /api/enrolments; /api/jobs; /api/files/{id}` |
| `GET /people` | `WorkspaceController.people` | `/dashboard; /people; /enrolments/[id]; /api/enrolments; /api/jobs; /api/files/{id}` |
| `GET /enrolments/{id}` | `WorkspaceController.show` | `/dashboard; /people; /enrolments/[id]; /api/enrolments; /api/jobs; /api/files/{id}` |
| `POST /enrolments/{id}/check` | `WorkspaceController.check` | `/dashboard; /people; /enrolments/[id]; /api/enrolments; /api/jobs; /api/files/{id}` |
| `POST /enrolments/{id}/files` | `WorkspaceController.upload` | `/dashboard; /people; /enrolments/[id]; /api/enrolments; /api/jobs; /api/files/{id}` |
| `GET /files/{id}` | `WorkspaceController.download` | `/dashboard; /people; /enrolments/[id]; /api/enrolments; /api/jobs; /api/files/{id}` |
| `GET /jobs/{id}` | `WorkspaceController.job` | `/dashboard; /people; /enrolments/[id]; /api/enrolments; /api/jobs; /api/files/{id}` |
| `GET /api/v1/me/training` | `SandboxApiController.summary` | `/api/v1/me/training; /api/v1/training/changes; /api/v1/members/{memberId}/summary` |
| `GET /api/v1/training/changes` | `SandboxApiController.changes` | `/api/v1/me/training; /api/v1/training/changes; /api/v1/members/{memberId}/summary` |
| `GET /api/v1/members/{memberId}/summary` | `SandboxApiController.summary` | `/api/v1/me/training; /api/v1/training/changes; /api/v1/members/{memberId}/summary` |
| `GET /password/{purpose}/{token}` | `LocalAccountController.passwordForm` | `/account/link (private fragment); /account/security; /accounts; /api/accounts/*; /api/auth/password` |
| `POST /password/{purpose}/{token}` | `LocalAccountController.passwordSave` | `/account/link (private fragment); /account/security; /accounts; /api/accounts/*; /api/auth/password` |
| `GET /account/password` | `LocalAccountController.change` | `/account/link (private fragment); /account/security; /accounts; /api/accounts/*; /api/auth/password` |
| `POST /account/password` | `LocalAccountController.change` | `/account/link (private fragment); /account/security; /accounts; /api/accounts/*; /api/auth/password` |
| `GET /accounts/links` | `LocalAccountController.links` | `/account/link (private fragment); /account/security; /accounts; /api/accounts/*; /api/auth/password` |
| `POST /accounts/actions` | `LocalAccountController.actions` | `/account/link (private fragment); /account/security; /accounts; /api/accounts/*; /api/auth/password` |
| `GET /invitations/{token}` | `LocalAccountController.invitation` | `/account/link (private fragment); /account/security; /accounts; /api/accounts/*; /api/auth/password` |
| `POST /invitations/{token}` | `LocalAccountController.accept` | `/account/link (private fragment); /account/security; /accounts; /api/accounts/*; /api/auth/password` |

## Domain and test evidence pointers

Domain files are in `packages/domain/src/`; tests are in `tests/`. File existence was checked. Passing results cover actual assertions, not all possible behaviors.

| Source controller | Target domain (.ts) | Target tests (.test.ts) |
| --- | --- | --- |
| SessionController | auth, mock-identity | auth, mock-signin |
| PlatformController | platform, branding | platform, branding, workspace-overview |
| AssessmentController | assessment-definitions, assessment-responses, assessment-reviews | assessment-definitions, assessment-content, assessment-responses, assessment-reviews, assessment-analysis |
| AssessmentAssignmentController | assessment-assignments | assessment-assignments |
| AssessmentMediaController | assessment-media | assessment-media |
| ClientContextController | tenancy | tenancy, auth |
| ThemePreferenceController | branding | branding |
| BrandingController | branding | branding |
| DocumentExtractionController | document-extractions, onboarding-documents | document-extractions, document-parser, document-native |
| DeliveryController | delivery, learning-grading, learning-lifecycle | delivery, learning-grading, learning-grading-ai, learning-lifecycle |
| NotificationsController | learning-notices | learning-notices, notification-mail |
| AdministrationController | tenancy, enrolments, promotions, learning-grading | tenancy, enrolments, promotions, learning-grading |
| ProgressionController | learning-kpis, learning-support | learning-kpis, learning-support, learning-support-contract |
| AiController | ai-registry, ai-gateway, programme-generation | programme-generation, programme-generation-contract, ai-live-providers, assessment-analysis |
| LearningController | onboarding, learning-calendar, learning-plans | onboarding, learning-calendar, learning-plans |
| WorkspaceController | enrolments, evidence-files, foundation-checks | workspace-overview, enrolments, evidence-files, foundation-checks |
| SandboxApiController | approved-feed, mock-identity | approved-feed, mock-identity, sandbox-directory |
| LocalAccountController | accounts | accounts, account-delivery |

## Console and recurring work

Recovery is performed by the worker where noted. Host scheduling of heartbeat (every minute) and AI pruning (daily) remains configurable and uninstalled; see README.md. Designated local production uses PostgreSQL instead of source SQLite.

| Source command | Target implementation / evidence |
| --- | --- |
| `training:global-admin` | `npm run training:global-admin -- ...`; operator-bootstrap / production-bootstrap / operator-cli / operator browser tests |
| `training:outbox` | Worker directly claims durable committed jobs; foundation / postgres tests |
| `training:notices` | Worker: LearningNotices.recover; learning-notices tests |
| `training:promotions` | Worker: Promotions.recover; promotions tests |
| `training:scan-recover` | Worker: EvidenceFiles.recover; evidence-files tests |
| `training:extract-recover` | Worker: DocumentExtractions.recover; document-extractions tests |
| `training:health` | `npm run operations -- health`; operations tests |
| `training:heartbeat` | `npm run operations -- heartbeat`; operations tests |
| `training:retention` | `npm run operations -- retention`; operations tests |
| `training:reapply-deletions` | `npm run operations -- reapply-deletions`; operations tests |
| `training:ai-recover` | Worker: AiGateway.recover; programme-generation / assessment-analysis tests |
| `training:ai-prune` | `npm run operations -- ai-prune`; operations tests |
| `training:directory-import` | `npm run integration:local -- directory-import ...`; sandbox-directory / mock-identity tests |
| `training:mock-token` | `npm run integration:local -- mock-token ...`; sandbox-directory / mock-identity tests |
| `training:local-setup` | `npm run training:local-setup -- ...`; operator-bootstrap / production-bootstrap / operator-cli / operator browser tests |
| `training:initialize-local-production` | `npm run training:initialize-local-production -- ...`; operator-bootstrap / production-bootstrap / operator-cli / operator browser tests |
| `training:initialize-production` | `npm run training:initialize-production -- ...`; operator-bootstrap / production-bootstrap / operator-cli / operator browser tests |
| `training:assessment-assignments` | Worker: AssessmentAssignments.recover; assessment-assignments tests |

## Completion gates

- Captured implementation scope: 78 source web operations, 18 console operations plus three class commands, 18 controller groups, 42 source test files and eight browser suites have mapped replacements below. Action reviews and focused reproductions resolved the recorded administration, directory, header, synthetic-history and browser client-selection gaps. The historical-allocation audit correction preserves the actual source runtime restriction.
- Domain/API qualification: broad regression passed 373 tests with ten environment-specific skips (.runtime/current-port-regression-latest.json). Changes made after discovery have a final 30-test affected-suite pass (.runtime/final-authority-tests.json), including the unchanged enrolment-history regression and approved feed. This is combined evidence, not a claim that the broad run used one frozen revision.
- Configured/native environments: current PostgreSQL qualification passed six tests across five files (.runtime/current-postgres-qualification.json). The four native-document checks passed again in their dedicated final run (5.15 seconds). Local, hosted and upgrade installation plus operator restart have passing local evidence recorded in FEATURE_CHECKLIST.md.
- Stack/source preservation: current production build and TypeScript pass; all 366 captured V2 hashes are unchanged. Next.js, NestJS, separate worker, PostgreSQL/PGlite, numbered SQL and dependency pins match tech-stack.md. Legacy disposable backfill invariants and the deliberate new-schema boundary are reconciled below; private V2 database migration is excluded.
- Browser gate passed: the fresh ordinary integrated journey completed successfully against the current code (5.4-minute test / 5.7 minutes overall). Prior focused shell, workspace, mock, installer, platform-account, directory, administration, header and client-selection checks have local evidence. Retain the intermittent upgrade-stage and receipt-navigation observations with their successful reruns; do not erase them or claim a proven root cause.
- Human technical/UX and owner acceptance are deferred, as authorized. No remote publication, deployment, paid/live provider calls or live adapter acceptance is claimed.

OpenAPI reconciliation (2026-11-13): all 122 current main-runtime operations and all six setup-runtime operations are represented. The three added operations are local-person POST plus platform client-account GET/POST. Restored the shared-path GET people contract after detecting its accidental overwrite; api-contract.test.ts now checks every registered operation. Three setup routes share paths with main runtime but have separate documented setup response descriptions. Added all 39 missing request envelopes, query/path parameters, multipart limits, conditional review actions and private binary responses. Corrected successful POST status documentation to Nest's default 201. Internal schema references and required path parameters were checked. Dynamic assessment/onboarding payloads point to authoritative domain validators; this is not a claim of exhaustive response-schema formalization or source behavior parity.

Action-level gaps closed locally (2026-11-13): Administration.person has its mock-mode local-person domain/API/form with synthetic restrictions and no invented live identity. Platform client accounts now support explicit mock join and version-bound Client Admin grant/revoke with independent membership defaults. Global Admin appointment submits and locks the displayed target version. Domain and browser evidence, fixes and deferred acceptance are recorded in FEATURE_CHECKLIST.md. These closures do not establish whole-port assertion equivalence.

## Source test-file mapping

These are checked target file references, not a claim that test names establish every source assertion. Current full-run evidence is in the primary checklist. Especially distinguish PostgreSQL constraint tests from full service-level waiting-lock scenarios.

| Captured source test file | Target tests (.test.ts) | Evidence boundary / remaining work |
| --- | --- | --- |
| `Feature/AdministrationTest.php` (4 cases) | tenancy, enrolments, promotions | Local-person domain/API/form and focused browser verified |
| `Feature/AiGenerationTest.php` (19 cases) | programme-generation, programme-generation-contract, assessment-analysis | Implemented domain pointers |
| `Feature/AiProviderTest.php` (4 cases) | ai-live-providers, assessment-analysis | Fake transport; no live calls |
| `Feature/AssessmentAssignmentsTest.php` (6 cases) | assessment-assignments | Implemented domain pointers |
| `Feature/AssessmentBuilderTest.php` (10 cases) | assessment-definitions, assessment-content, assessment-media | Implemented domain pointers |
| `Feature/AssessmentMatrixTest.php` (7 cases) | assessment-content, assessment-responses, assessment-scoring | Implemented domain pointers |
| `Feature/AssessmentSectionsTest.php` (7 cases) | assessment-content, assessment-responses | Implemented domain pointers |
| `Feature/AutomaticClientThemeTest.php` (2 cases) | branding | Implemented domain pointers |
| `Feature/BrandingTest.php` (5 cases) | branding | Implemented domain pointers |
| `Feature/ClientBackfillTest.php` (7 cases) | foundation, local-upgrade, local-demo-fixtures | Legacy Laravel schema mapping scripts; new stack uses fresh numbered SQL and separate fixture upgrade, not private V2 data migration |
| `Feature/ClientFoundationMigrationTest.php` (1 cases) | foundation, installation-state | Legacy additive PHP rollback differs from checksummed numbered SQL migration model |
| `Feature/ClientFoundationTest.php` (15 cases) | tenancy, platform | Implemented domain pointers |
| `Feature/ClientPermissionIntegrationTest.php` (10 cases) | tenancy, enrolments, evidence-files | Implemented domain pointers |
| `Feature/DeliveryTest.php` (9 cases) | delivery, learning-grading, learning-grading-ai, learning-lifecycle | Implemented domain pointers |
| `Feature/DocumentExtractionTest.php` (10 cases) | document-extractions | Implemented domain pointers |
| `Feature/DocumentParserTest.php` (7 cases) | document-parser, document-native | Native tool tests require separate configured run |
| `Feature/DocumentScannerTest.php` (1 cases) | file-content, evidence-files, assessment-media | Local scanner contracts; no production antivirus qualification |
| `Feature/ExampleTest.php` (1 cases) | foundation | Framework smoke check; covered by health/root browser path |
| `Feature/FoundationTest.php` (29 cases) | foundation, auth, mock-signin, mock-identity, approved-feed, sandbox-directory, evidence-files, foundation-checks | Implemented domain pointers |
| `Feature/HostedPasswordLoginTest.php` (6 cases) | auth, production-bootstrap, production-profile, installation-transport | Implemented domain pointers |
| `Feature/InitialAssessmentTest.php` (13 cases) | assessment-responses, assessment-reviews, assessment-analysis, assessment-scoring | Implemented domain pointers |
| `Feature/InstallationTest.php` (14 cases) | installer, installation-state, local-installer, local-demo-fixtures | Implemented domain pointers |
| `Feature/IntegrationBoundaryTest.php` (2 cases) | approved-feed, mock-identity, sandbox-directory, promotions | Local contracts only; no configured live primary adapter |
| `Feature/LearningTest.php` (13 cases) | onboarding, learning-calendar, learning-plans | Implemented domain pointers |
| `Feature/LocalAccountsTest.php` (20 cases) | accounts, account-delivery, operator-bootstrap | Implemented domain pointers |
| `Feature/LocalProductionTest.php` (4 cases) | production-bootstrap, production-profile, operator-cli | Designated local PostgreSQL replaces source SQLite profile |
| `Feature/NotificationAndScanTest.php` (3 cases) | learning-notices, notification-mail, evidence-files | Implemented domain pointers |
| `Feature/OperationsTest.php` (2 cases) | operations | Host scheduling remains explicitly configurable |
| `Feature/PilotWorkflowTest.php` (1 cases) | delivery, learning-grading, learning-lifecycle, learning-kpis, realistic-demo | Synthetic workflow only, not owner pilot acceptance |
| `Feature/PlatformAdministrationTest.php` (19 cases) | platform, branding, workspace-overview | Version, client-account and URL/history gaps locally closed; see checklist evidence |
| `Feature/ProgressionTest.php` (7 cases) | learning-kpis, learning-support, learning-support-contract | Implemented domain pointers |
| `Feature/RealisticDemoTest.php` (1 cases) | realistic-demo, demo-fixtures, local-demo-fixtures | Implemented domain pointers |
| `Feature/SavedBrandingTest.php` (13 cases) | branding | Implemented domain pointers |
| `Feature/ThemePreferenceTest.php` (3 cases) | branding | Implemented domain pointers |
| `Integration/AiConcurrencyTest.php` (2 cases) | postgres, assessment-analysis, programme-generation | Actual service races covered by client-services-postgres, alongside existing constraint/domain tests |
| `Integration/AssessmentConcurrencyTest.php` (5 cases) | postgres, assessment-assignments, assessment-responses, assessment-reviews | Actual service races covered by client-services-postgres, alongside existing constraint/domain tests |
| `Integration/CapacityConcurrencyTest.php` (1 cases) | client-services-postgres, postgres, learning-plans, onboarding | Actual competing service approvals admit one programme and reject the other with capacity_exceeded; four active allocations total 120 minutes |
| `Integration/ClientBackfillMariaDbTest.php` (2 cases) | foundation, local-upgrade | Legacy Laravel/MariaDB rehearsal, not a portable runtime action |
| `Integration/ClientConcurrencyTest.php` (14 cases) | postgres, tenancy, platform, branding | Actual client/platform/actor lock waits, sensitive/suspension approval denial, role/sensitive/primary-allocation/branding/theme service races covered by client-services-postgres |
| `Integration/ClientMigrationMariaDbTest.php` (3 cases) | postgres, foundation, branding | PostgreSQL foundation invariants replace MariaDB additive migration rehearsal |
| `Integration/LocalAccountConcurrencyTest.php` (3 cases) | postgres, accounts, operator-bootstrap-postgres | PostgreSQL redemption/bootstrap races plus account service tests |
| `Integration/WorkerConcurrencyTest.php` (1 cases) | postgres, foundation-checks-postgres | Actual job claims and foundation receipt worker races |

## Additional entry points

- `app/Console/Commands/SetupToken.php` -> `npm run setup:token`; setup-token.ts and installer browser qualification.
- `app/Console/Commands/PrepareLocalUpgrade.php` -> `npm run setup:upgrade:local`; setup-upgrade-local.ts and local-upgrade browser qualification.
- `app/Console/Commands/ExtendGlobalAdminDemo.php` -> `npm run demo:global-admin -- --database ... [--check]`; realistic-demo.ts, realistic-demo tests and persistent demo browser qualification.
- `InstallationGate`/`InstallationController` -> dedicated setup API plus `/setup`, `/setup/local`, `/setup/hosted`; installer/local-installer/local-upgrade tests and browser suites.
- Livewire `JobReceipts` -> `/api/jobs` plus scoped record polling; foundation-checks.ts still returns at most five visible actor-owned records.
- Livewire `ClientDirectory` -> platform directory API/screen. Filtering/counts and source URL/history persistence (`client_search`, `status`, `sort`, page) are locally verified by the directory-history browser and domain tests.

Source helper scripts that build disposable legacy SQLite/MariaDB mapping rehearsals are implementation-specific evidence, not authorization to copy or migrate private V2 records. Their preservation/authority invariants must be covered in the new foundation; old-schema DDL itself is not reused.

## Source browser-suite mapping

| Source browser suite | V2.1 browser coverage | Remaining boundary |
| --- | --- | --- |
| action-loading.spec.js | Ordinary foundation journey, assessment-flow and onboarding-flow helpers; focused workspace lost-response retry | Different React implementation; preserve disabled/pending/retry behavior, not the old isolated HTML helper |
| appearance.spec.js | Ordinary foundation appearance section; shell theme persistence/mobile suite | Ordinary integrated rerun passed; later changes have focused evidence |
| assessment-builder.spec.js | Ordinary assessment-flow helper, including section/matrix/choice authoring, response and review | Ordinary integrated rerun passed; later changes have focused evidence |
| documents.spec.js | Ordinary assessment/onboarding document flow plus document domain/native-tool tests | Native tools are a separate configured qualification |
| foundation.spec.js | Ordinary foundation journey, focused workspace and shell suites | Actor scoping and receipt/source boundaries retained |
| learning.spec.js | Ordinary onboarding-flow helper and curriculum/delivery/review journey | Ordinary integrated rerun passed; later changes have focused evidence |
| realistic-demo.spec.js | Persistent realistic-demo browser, shell/workspace suites and domain fixture/permission tests | Live services and human pilot acceptance excluded |
| sidebar.spec.js | Focused shell browser suite | Keyboard modal navigation, role entries and responsive layout checked |

Migration integrity evidence (2026-11-13): migration-integrity.test.ts directly verifies unchanged users, memberships and receipts after missing/altered migration rejection and failed additive migration rollback, including rolled-back DDL. Corrected application and replay preserve those rows. This is narrower than approved-history preservation and does not close all source migration invariants. The captured ClientBackfill test is a disposable synthetic legacy-schema rehearsal; equivalent new-stack fixture ownership, changed-manifest refusal, partial rollback, replay and permission checks are located in demo-fixtures, local-demo-fixtures, realistic-demo and demo-postgres tests. An exhaustive assertion mapping remains open.

Approved-history migration replay (2026-11-13): client-services-postgres now snapshots row counts and canonical row-content hashes for every public table after real programme approval, assessment submission/review, private onboarding, branding and AI charging. Reapplying current numbered migrations preserves the entire snapshot. This directly proves replay preservation for those populated histories; it does not implement Laravel down migrations or private database conversion.

Administration action audit closure (2026-11-13): captured assignment/deactivate wrapper safeguards now span the new API/dialog/domain: required displayed permission version, atomic target-user version check, self-deactivation denial and imported-team membership restriction. Focused domain/API 24-test and real browser recovery results, production build and source hashes are recorded in FEATURE_CHECKLIST.md. This closes the newly identified administration action gap, not the remaining whole-port audit.

## Action-branch review follow-up (2026-11-13)

The following source controller branches were read against the current API/domain paths. Test results are the recorded current full regression plus the focused parity results; these rows do not replace the remaining service-invariant audit.

| Captured branches inspected | Current implementation and evidence |
| --- | --- |
| Progression: propose, approve, suggest, observe, revise, snapshot | support/progress API discriminated actions call LearningSupport and LearningKpis; private provisional suggestions, member-visible approved/source-review proposals, effective KPI versions, latest snapshots, exact base/current authority, N+2/freeze and immutable lineage have passing learning-support and learning-kpis coverage |
| Delivery review: grade, approve, changes, manual, withdraw, appeal, uphold | Separate submission endpoints call LearningGrading/Delivery with scoped parent reads and exact versions; learning-grading/delivery tests cover independent reviewer authority, retained approved history, private drafts, pinned attempts and evidence scan rechecks |
| Delivery lifecycle: pause, preview, resume, complete | lifecycle API and LearningLifecycle preserve explicit preview, calendar/capacity checks, started history and completion gates; learning-lifecycle tests pass |
| Learning: onboarding save/assessment confirmation, calendar confirmation, create/edit plan, submit/approve | Onboarding/LearningPlans preserve exact input/calendar versions, pinned historical versions and previous content; actual competing approval service test adds PostgreSQL shared-capacity proof |
| Workspace: directory/detail versus summary, job/check, private upload/download | Enrolments and FoundationChecks implement scoped actor-owned receipts and summary boundaries; EvidenceFiles retains private quarantine, purpose/scan-state checks, access rechecks and download audit. Inactive-person directory filter restored and locally verified; production synthetic accounts are prohibited by the schema |
| Administration: person/group/assignment/enrol/deactivate, promotion send/reconcile/history, appeal routing, sensitive grant/revoke | All branches have target API/domain paths; local-person and displayed-version/imported-team/self-deactivation gaps closed by focused domain/browser checks. The shared directory now filters inactive people before both rows and counts |

Installer qualification: latest legacy upgrade passes on an isolated alternate database port, preserving original environment/key/storage and enabling sign-in. Initial runner startup failure was a confirmed occupied-port issue; it is distinct from the earlier unresolved stage failure. Hosted and fresh local requalification subsequently passed; hosted setup also passed the new response-header assertions.

Model hook audit (2026-11-13): User.updating is the only captured model mutation hook. Its training-history synthetic-classification invariant is now enforced by migration 0031 and verified through actual enrolment service creation, direct SQL rejection, unchanged history, permitted unrelated updates and real PostgreSQL. See the synthetic-history checkpoint for fixture corrections and results. Other model matches are value casts rather than mutation hooks.

### Legacy foundation rehearsal assertion reconciliation

The captured ClientBackfillTest runs a disposable pre-client Laravel schema, not a user-facing import of a private V2 database. The following maps its seven assertions to current stack behavior without claiming the PHP/MariaDB utility itself runs on PostgreSQL.

| Captured assertion | Current evidence and exact boundary |
| --- | --- |
| Approved history survives mapping and repeat apply adds no writes | client-services-postgres snapshots every populated public table around migration replay, including actual approval/review history; realistic-demo snapshots repeat fixture application. This is numbered-SQL/fixture replay preservation, not Laravel schema conversion |
| Validate-only makes no writes | realistic-demo checks extendAdministrator(true) against an unchanged complete database snapshot; validation-only legacy mapping has no corresponding legacy schema in this new installation |
| Wrong database/source/manifest rejected | realistic-demo guards configuration before writes, rejects changed source/version/content/file manifests; local-demo-fixtures rejects another installation and changed fixture version |
| Non-synthetic/foreign relationships fail closed | realistic-demo rejects a real account; domain composite foreign keys and scoped access tests enforce client/environment boundaries. Synthetic-history tests additionally reject reclassification after enrolment |
| Existing foundation rows not overwritten | local-demo-fixtures refuses a foreign pre-existing client and asserts that exact row remains; deterministic fixture collision checks roll back without replacing the original three clients |
| Injected failure rolls back and can resume | demo-fixtures checks nested service/session rollback and tenant-role restoration; local-demo-fixtures checks interrupted evidence stage, zero enrolments, unchanged progress and subsequent complete resume; realistic-demo refuses an incomplete manifest without overwriting orphan evidence |
| Mapped permissions, primary management and revocation | demo-fixtures verifies scoped coordinator/primary/sensitive authority and non-authoritative cohort membership; tenancy tests verify allocation replacement, role/team removal and no restoration of historical authority on rejoin. Historical-authority tests check role, membership and allocation boundaries; actual source Access.enrolments requires historical allocation for unteamed records, unlike its unused ClientAccess helper. The runtime restriction is retained after an affected-suite regression caught the incorrect earlier interpretation |

ClientFoundationMigrationTest uses Laravel up/down methods over a legacy schema. New-stack migration-integrity instead checks atomic additive SQL, changed/missing receipt refusal, failed DDL/data rollback and replay preservation; this does not claim support for PHP down migrations. Current full regression is running after migration 0031; prior evidence remains separately identified.

Foundation assertion review (2026-11-13): read all 29 captured FoundationTest cases against current domain boundaries and test assertions. Session mode/identity, rotation, idle/absolute expiry and fresh-session throttling are in mock-signin/auth; own versus peer/administrator views and current/revoked authority are in enrolments/tenancy/historical-authority; evidence-files covers separate sensitive capability, private audited clean downloads, quarantine and scanner failure; approved-feed/mock-identity cover local-only/synthetic exclusion, immutable identity, claim validation and stale permissions. Foundation/foundation-checks assert transactional queue/audit behavior, idempotent replay, changed payload/version conflict, actor-scoped receipts, revocation before delivery, retry exhaustion and dispatch recovery. Sandbox-directory asserts whole-page atomicity/cursors, duplicate/stale/conflict handling, deactivation/re-entry, no implicit identity/role creation and explicit mappings. Production synthetic rows are prohibited by SQL rather than relying on a post-insert source filter. The source synthetic model hook gap was corrected. The proposed unteamed historical-allocation change was withdrawn after reading the actual Access.enrolments and ApprovedFeed call chain; the existing historical restriction is required. Current regression remains running; this review does not convert pending test results into passes.

Additional controller review (2026-11-13): assignment member/team creation and stop/resume/retry map to AssessmentAssignments with publication, current authority, scoped rule ownership and pinned revisions; notification listing filters recipient/record authority before 20-row pagination and retains independent email preference; branding preferences retain selected-client authority, exact versions and available canonical themes. ClientContext.store review identified missing HTTP CSRF rotation and audit; this is now atomic, documented in OpenAPI and verified by domain rollback plus actual HTTP/browser checks. Source application Access.enrolments and ApprovedFeed retain the historical unteamed allocation restriction despite the unused ClientAccess helper differing; final affected enrolment/feed tests pass after correcting that audit interpretation. Current broad result is 373 passed/10 environment skips, separate PostgreSQL is six passed, final affected regression is 30 passed, and the production build passes. Full browser rerun remains outstanding.

Final controller branch reconciliation: AssessmentController save/publish/assign and response save/submit/approve/reject/analysis/confirm/extract/appeal/uphold have domain/API paths and recorded response/review/analysis/document tests. Platform create/edit/suspend/reactivate/join/grant/revoke/appoint/remove map to versioned platform/client-account operations and focused browser checks. Session actions retain mock boundary versus local password/MFA and revocation; Sandbox summary/changes retain delegated identity and approved-only scoped projections. Local-account action branches retain recipient confirmation, current-password checks, hashed one-use links and issuer/recipient rechecks. AI request/settings/policy/reconciliation retain pinned versions, independent human decisions and ambiguous-cost handling. Image and document upload/retry/download/review paths retain private scan/hash/current-authority checks. These supplement the action table and foundation assertion review; the full current browser gate remains open until its process completes.

Final completion audit (2026-11-13): destination and pinned stack verified; captured feature and command replacements reconciled; final affected tests, production build, PostgreSQL and native-document qualifications pass; the full current ordinary browser journey passes. Fresh mobile lifecycle/review screenshots were visually inspected alongside the automated responsive/accessibility assertions. V2 preservation is checked with the captured 366-file manifest. No required local implementation or verification item remains open. Historical intermediate failures and the withdrawn ClientAccess-helper interpretation remain in the ledger for traceability. Human review, live integration, remote CI/publication and deployment are not part of this local completion claim.
