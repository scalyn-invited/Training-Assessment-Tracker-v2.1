CREATE TABLE grade_attempts (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,submission_attempt_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),status text NOT NULL CHECK(status IN ('queued','provisional','technical_failure','approved','changes_requested','superseded')),
 result text,total numeric(7,3),rubric_hash text NOT NULL,actor_id uuid NOT NULL,reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(submission_attempt_id,version),UNIQUE(organisation_id,environment,id),UNIQUE(organisation_id,environment,id,submission_attempt_id),
 FOREIGN KEY(organisation_id,environment,submission_attempt_id,enrolment_id) REFERENCES submission_attempts(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id),CHECK(total IS NULL OR total BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX one_pending_learning_grade ON grade_attempts(submission_attempt_id) WHERE status IN ('queued','provisional');
ALTER TABLE submission_attempts ADD CONSTRAINT approved_learning_grade_scope FOREIGN KEY(organisation_id,environment,approved_grade_id,id) REFERENCES grade_attempts(organisation_id,environment,id,submission_attempt_id);
CREATE TABLE grade_decisions (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,submission_attempt_id uuid NOT NULL,grade_attempt_id uuid NOT NULL UNIQUE,
 actor_id uuid NOT NULL,outcome text NOT NULL CHECK(outcome IN ('approved','changes_requested')),reason text NOT NULL,scores text NOT NULL,total numeric(7,3),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,id),UNIQUE(organisation_id,environment,id,submission_attempt_id),
 FOREIGN KEY(organisation_id,environment,grade_attempt_id,submission_attempt_id) REFERENCES grade_attempts(organisation_id,environment,id,submission_attempt_id),
 FOREIGN KEY(organisation_id,environment,submission_attempt_id,enrolment_id) REFERENCES submission_attempts(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id),CHECK(total IS NULL OR total BETWEEN 0 AND 100),CHECK(outcome<>'approved' OR total IS NOT NULL)
);
CREATE TABLE learning_appeals (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,submission_attempt_id uuid NOT NULL,grade_decision_id uuid NOT NULL UNIQUE,
 reviewer_id uuid,role_assignment_id uuid,authority_granted_at timestamptz,authority_ended_at timestamptz,resolved_by uuid,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),reason text NOT NULL,resolution text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,grade_decision_id,submission_attempt_id) REFERENCES grade_decisions(organisation_id,environment,id,submission_attempt_id),
 FOREIGN KEY(organisation_id,environment,submission_attempt_id,enrolment_id) REFERENCES submission_attempts(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(environment,reviewer_id) REFERENCES users(environment,id),FOREIGN KEY(environment,resolved_by) REFERENCES users(environment,id),
 FOREIGN KEY(organisation_id,environment,role_assignment_id) REFERENCES role_assignments(organisation_id,environment,id)
);
CREATE UNIQUE INDEX one_open_learning_appeal ON learning_appeals(submission_attempt_id) WHERE status='open';
ALTER TABLE kpi_versions ADD CONSTRAINT kpi_enrolment_scope UNIQUE(organisation_id,environment,id,enrolment_id);
CREATE TABLE kpi_observations (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,kpi_version_id uuid NOT NULL,
 submission_attempt_id uuid,grade_decision_id uuid,value numeric NOT NULL,evidence_type text NOT NULL CHECK(evidence_type IN ('demonstrated_competence','workplace_outcome')),
 evidence text NOT NULL,actor_id uuid NOT NULL,current boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,id),UNIQUE(kpi_version_id,grade_decision_id),
 FOREIGN KEY(organisation_id,environment,kpi_version_id,enrolment_id) REFERENCES kpi_versions(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(organisation_id,environment,submission_attempt_id,enrolment_id) REFERENCES submission_attempts(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(organisation_id,environment,grade_decision_id,submission_attempt_id) REFERENCES grade_decisions(organisation_id,environment,id,submission_attempt_id),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id),CHECK((grade_decision_id IS NULL)=(submission_attempt_id IS NULL))
);
CREATE TABLE kpi_snapshots (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,kpi_version_id uuid NOT NULL,
 source_ids jsonb NOT NULL,value numeric,status text NOT NULL CHECK(status IN ('insufficient_evidence','target_unknown','on_target','needs_support')),
 sample_count integer NOT NULL CHECK(sample_count>=0),actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,kpi_version_id,enrolment_id) REFERENCES kpi_versions(organisation_id,environment,id,enrolment_id),FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
CREATE FUNCTION protect_learning_grade() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'result'-'total'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'result'-'total'-'updated_at') THEN RAISE EXCEPTION 'Grading attempt identity is immutable'; END IF;
 IF OLD.status<>'queued' AND (NEW.result IS DISTINCT FROM OLD.result OR NEW.total IS DISTINCT FROM OLD.total) THEN RAISE EXCEPTION 'Grading result is immutable; create another attempt'; END IF;
 IF OLD.status='superseded' AND NEW.status<>'superseded' THEN RAISE EXCEPTION 'Superseded grading cannot be restored'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_learning_grade BEFORE UPDATE OR DELETE ON grade_attempts FOR EACH ROW EXECUTE FUNCTION protect_learning_grade();
CREATE TRIGGER immutable_learning_decision BEFORE UPDATE OR DELETE ON grade_decisions FOR EACH ROW EXECUTE FUNCTION protect_learning_snapshot();
CREATE FUNCTION protect_kpi_observation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'current') IS DISTINCT FROM (to_jsonb(OLD)-'current') OR (NOT OLD.current AND NEW.current) THEN RAISE EXCEPTION 'KPI observation is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_kpi_observation BEFORE UPDATE OR DELETE ON kpi_observations FOR EACH ROW EXECUTE FUNCTION protect_kpi_observation();
CREATE TRIGGER immutable_kpi_snapshot BEFORE UPDATE OR DELETE ON kpi_snapshots FOR EACH ROW EXECUTE FUNCTION protect_learning_snapshot();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['grade_attempts','grade_decisions','learning_appeals','kpi_observations','kpi_snapshots'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_boundary ON %I TO tracker_tenant USING (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true)) WITH CHECK (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true))',t);
  EXECUTE format('GRANT SELECT ON %I TO tracker_tenant',t);
 END LOOP;
END $$;
