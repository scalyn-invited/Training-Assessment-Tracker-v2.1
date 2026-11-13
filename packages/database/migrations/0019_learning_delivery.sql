CREATE TABLE learning_blocks (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,
 programme_version_id uuid NOT NULL,member_calendar_id uuid NOT NULL,number integer NOT NULL CHECK(number>0),version integer NOT NULL CHECK(version>0),
 state text NOT NULL DEFAULT 'current' CHECK(state IN ('current','superseded')),content text NOT NULL,rubric text NOT NULL,
 started_at timestamptz,early_start boolean NOT NULL DEFAULT false,actor_id uuid NOT NULL,reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(enrolment_id,number,version),UNIQUE(organisation_id,environment,id),UNIQUE(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(organisation_id,environment,programme_version_id,enrolment_id) REFERENCES programme_versions(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(environment,member_calendar_id) REFERENCES member_calendars(environment,id),FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
CREATE UNIQUE INDEX one_current_learning_block ON learning_blocks(enrolment_id,number) WHERE state='current';
CREATE TRIGGER learning_calendar_member BEFORE INSERT ON learning_blocks FOR EACH ROW EXECUTE FUNCTION check_programme_calendar_member();
CREATE TABLE work_drafts (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,learning_block_id uuid NOT NULL,
 lesson_index integer NOT NULL CHECK(lesson_index>=0),member_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),payload text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(learning_block_id,lesson_index,member_id),UNIQUE(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,learning_block_id,enrolment_id) REFERENCES learning_blocks(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(organisation_id,environment,enrolment_id,member_id) REFERENCES enrolments(organisation_id,environment,id,member_id)
);
CREATE TABLE objective_quizzes (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,learning_block_id uuid NOT NULL,
 lesson_index integer NOT NULL CHECK(lesson_index>=0),questions text NOT NULL,answer_key text NOT NULL,actor_id uuid NOT NULL,reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(learning_block_id,lesson_index),UNIQUE(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,learning_block_id,enrolment_id) REFERENCES learning_blocks(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
CREATE TABLE submission_attempts (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,learning_block_id uuid NOT NULL,
 lesson_index integer NOT NULL CHECK(lesson_index>=0),member_id uuid NOT NULL,attempt integer NOT NULL CHECK(attempt>0),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 status text NOT NULL CHECK(status IN ('submitted','queued','review_pending','technical_failure','approved','changes_requested','withdrawn')),
 payload text NOT NULL,content_hash text NOT NULL,idempotency_key uuid NOT NULL,draft_version integer NOT NULL CHECK(draft_version>0),approved_grade_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(environment,member_id,idempotency_key),UNIQUE(learning_block_id,lesson_index,attempt),UNIQUE(organisation_id,environment,id),UNIQUE(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(organisation_id,environment,learning_block_id,enrolment_id) REFERENCES learning_blocks(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(organisation_id,environment,enrolment_id,member_id) REFERENCES enrolments(organisation_id,environment,id,member_id)
);
CREATE TABLE kpi_versions (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,number integer NOT NULL CHECK(number>0),version integer NOT NULL CHECK(version>0),
 definition text NOT NULL,effective_at timestamptz NOT NULL,actor_id uuid NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(enrolment_id,number,version),UNIQUE(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,enrolment_id) REFERENCES enrolments(organisation_id,environment,id),FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
CREATE TABLE learning_notifications (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,recipient_id uuid NOT NULL,event_key text NOT NULL,kind text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','cancelled','in_app_only','sink_delivered','relay_accepted','failed','ambiguous')),
 attempts integer NOT NULL DEFAULT 0,started_at timestamptz,available_at timestamptz,error_code text,read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organisation_id,environment,event_key),UNIQUE(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,enrolment_id) REFERENCES enrolments(organisation_id,environment,id),FOREIGN KEY(environment,recipient_id) REFERENCES users(environment,id)
);
ALTER TABLE users ADD COLUMN training_email boolean NOT NULL DEFAULT true;
CREATE FUNCTION protect_learning_block() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'state'-'started_at'-'early_start'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'started_at'-'early_start'-'updated_at') THEN RAISE EXCEPTION 'Learning block content is immutable'; END IF;
 IF (OLD.state='superseded' AND NEW.state<>'superseded') OR (OLD.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at) OR (OLD.early_start AND NOT NEW.early_start) THEN RAISE EXCEPTION 'Learning block work history cannot be reversed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_learning_content BEFORE UPDATE OR DELETE ON learning_blocks FOR EACH ROW EXECUTE FUNCTION protect_learning_block();
CREATE FUNCTION protect_submission_payload() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'version'-'approved_grade_id'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'version'-'approved_grade_id'-'updated_at') THEN RAISE EXCEPTION 'Submitted work is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_submitted_work BEFORE UPDATE OR DELETE ON submission_attempts FOR EACH ROW EXECUTE FUNCTION protect_submission_payload();
CREATE TRIGGER immutable_quiz BEFORE UPDATE OR DELETE ON objective_quizzes FOR EACH ROW EXECUTE FUNCTION protect_learning_snapshot();
CREATE TRIGGER immutable_kpi_version BEFORE UPDATE OR DELETE ON kpi_versions FOR EACH ROW EXECUTE FUNCTION protect_learning_snapshot();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['learning_blocks','work_drafts','objective_quizzes','submission_attempts','kpi_versions','learning_notifications'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_boundary ON %I TO tracker_tenant USING (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true)) WITH CHECK (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true))',t);
  EXECUTE format('GRANT SELECT ON %I TO tracker_tenant',t);
 END LOOP;
END $$;
