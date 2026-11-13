ALTER TABLE ai_runs ADD CONSTRAINT generation_base_scope
 FOREIGN KEY(organisation_id,environment,programme_version_id,enrolment_id)
 REFERENCES programme_versions(organisation_id,environment,id,enrolment_id);
ALTER TABLE ai_runs ADD CONSTRAINT generation_result_scope
 FOREIGN KEY(organisation_id,environment,result_version_id,enrolment_id)
 REFERENCES programme_versions(organisation_id,environment,id,enrolment_id);
CREATE UNIQUE INDEX one_pending_programme_generation ON ai_runs(enrolment_id)
 WHERE task='generate_programme' AND status IN ('queued','running','ambiguous');
