ALTER TABLE assessment_attempts ADD CONSTRAINT attempt_assignment_scope UNIQUE(organisation_id,environment,id,assignment_id);
ALTER TABLE role_assignments ADD CONSTRAINT role_tenant_id UNIQUE(organisation_id,environment,id);
CREATE TABLE assessment_reviews (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,assignment_id uuid NOT NULL,attempt_id uuid NOT NULL,actor_id uuid NOT NULL,
 sequence integer NOT NULL,kind text NOT NULL CHECK(kind IN ('decision','analysis')),status text NOT NULL CHECK(status IN ('queued','provisional','technical_failure','approved','rejected','cancelled')),
 result text,source_review_id uuid,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,id),UNIQUE(organisation_id,environment,id,assignment_id),UNIQUE(attempt_id,sequence),
 FOREIGN KEY(organisation_id,environment,attempt_id,assignment_id) REFERENCES assessment_attempts(organisation_id,environment,id,assignment_id),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id),
 FOREIGN KEY(organisation_id,environment,source_review_id) REFERENCES assessment_reviews(organisation_id,environment,id)
);
ALTER TABLE assessment_assignments ADD CONSTRAINT approved_review_scope FOREIGN KEY(organisation_id,environment,approved_review_id,id) REFERENCES assessment_reviews(organisation_id,environment,id,assignment_id);
CREATE TABLE assessment_file_confirmations (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,attempt_id uuid NOT NULL,evidence_file_id uuid NOT NULL,actor_id uuid NOT NULL,
 source_hash text NOT NULL,version integer NOT NULL,text text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,id),UNIQUE(attempt_id,version),
 FOREIGN KEY(organisation_id,environment,attempt_id) REFERENCES assessment_attempts(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,evidence_file_id) REFERENCES evidence_files(organisation_id,environment,id),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
CREATE TABLE assessment_appeals (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,assignment_id uuid NOT NULL,review_id uuid NOT NULL,reviewer_id uuid,role_assignment_id uuid,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),reason text NOT NULL,resolution text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,assignment_id) REFERENCES assessment_assignments(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,review_id,assignment_id) REFERENCES assessment_reviews(organisation_id,environment,id,assignment_id),
 FOREIGN KEY(environment,reviewer_id) REFERENCES users(environment,id),
 FOREIGN KEY(organisation_id,environment,role_assignment_id) REFERENCES role_assignments(organisation_id,environment,id)
);
CREATE UNIQUE INDEX one_open_assessment_appeal ON assessment_appeals(assignment_id) WHERE status='open';
CREATE FUNCTION protect_assessment_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status IN ('approved','rejected') THEN RAISE EXCEPTION 'Assessment decisions are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_assessment_decision BEFORE UPDATE OR DELETE ON assessment_reviews FOR EACH ROW EXECUTE FUNCTION protect_assessment_review();
CREATE TRIGGER immutable_file_confirmation BEFORE UPDATE OR DELETE ON assessment_file_confirmations FOR EACH ROW EXECUTE FUNCTION protect_assessment_attempt();
DO $$
DECLARE target text;
BEGIN
 FOREACH target IN ARRAY ARRAY['assessment_reviews','assessment_file_confirmations','assessment_appeals'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',target);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',target);
 EXECUTE format('CREATE POLICY tenant_boundary ON %I TO tracker_tenant USING (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true)) WITH CHECK (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true))',target);
 EXECUTE format('GRANT SELECT ON %I TO tracker_tenant',target);
 END LOOP;
END $$;
