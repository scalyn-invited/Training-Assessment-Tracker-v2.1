-- Explicit authoring scope: never create or charge a learner record.
ALTER TABLE ai_runs ADD CONSTRAINT ai_runs_authoring_organisation FOREIGN KEY(organisation_id) REFERENCES organisations(id);
ALTER TABLE ai_runs ADD CONSTRAINT ai_runs_authoring_environment FOREIGN KEY(environment) REFERENCES platform_settings(environment);
ALTER TABLE ai_runs ALTER COLUMN enrolment_id DROP NOT NULL;
ALTER TABLE ai_runs ADD COLUMN scope text NOT NULL DEFAULT 'enrolment';
ALTER TABLE ai_runs ADD CONSTRAINT ai_run_scope CHECK (
 (scope='enrolment' AND enrolment_id IS NOT NULL AND task <> 'generate_assessment_topic') OR
 (scope='assessment_authoring' AND enrolment_id IS NULL AND task='generate_assessment_topic' AND programme_version_id IS NULL AND result_version_id IS NULL)
);
CREATE UNIQUE INDEX one_active_authoring_request ON ai_runs(organisation_id,environment)
 WHERE scope='assessment_authoring' AND status IN ('queued','running','ambiguous');
