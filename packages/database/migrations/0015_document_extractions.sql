ALTER TABLE evidence_files ADD CONSTRAINT evidence_enrolment_scope UNIQUE(organisation_id,environment,id,enrolment_id);
ALTER TABLE assessment_assignments ADD CONSTRAINT assignment_enrolment_scope UNIQUE(organisation_id,environment,id,enrolment_id);
CREATE TABLE document_extractions (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,evidence_file_id uuid NOT NULL,actor_id uuid NOT NULL,
 assessment_assignment_id uuid,assessment_attempt_id uuid,attempt integer NOT NULL,version integer NOT NULL DEFAULT 1,
 status text NOT NULL CHECK(status IN ('waiting_scan','queued','running','ready','confirmed','failed')),source_hash text NOT NULL,
 lease uuid,started_at timestamptz,dispatch_seq integer NOT NULL DEFAULT 0,error_code text,extracted_text text,engine text,page_count integer,warnings jsonb NOT NULL DEFAULT '[]',review_data text,confirmed_onboarding_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,id),UNIQUE(evidence_file_id,attempt),
 CHECK((assessment_assignment_id IS NULL)=(assessment_attempt_id IS NULL)),
 FOREIGN KEY(organisation_id,environment,evidence_file_id,enrolment_id) REFERENCES evidence_files(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(organisation_id,environment,assessment_assignment_id,enrolment_id) REFERENCES assessment_assignments(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(organisation_id,environment,assessment_attempt_id,assessment_assignment_id) REFERENCES assessment_attempts(organisation_id,environment,id,assignment_id),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
ALTER TABLE document_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_extractions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_boundary ON document_extractions TO tracker_tenant USING (organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true)) WITH CHECK (organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true));
GRANT SELECT ON document_extractions TO tracker_tenant;
