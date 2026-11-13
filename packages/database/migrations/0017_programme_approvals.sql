CREATE TABLE programme_approvals (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,programme_version_id uuid NOT NULL UNIQUE,actor_id uuid NOT NULL,reason text NOT NULL,content_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organisation_id,environment,programme_version_id) REFERENCES programme_versions(organisation_id,environment,id),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
CREATE TABLE approved_changes (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,event_id uuid NOT NULL UNIQUE,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,entity_id uuid NOT NULL,entity_version integer NOT NULL,kind text NOT NULL,facts jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(entity_id,entity_version,kind),FOREIGN KEY(organisation_id,environment,enrolment_id) REFERENCES enrolments(organisation_id,environment,id)
);
CREATE FUNCTION protect_programme_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'state'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'updated_at') THEN RAISE EXCEPTION 'Programme content revisions are immutable'; END IF;
 IF NEW.state<>OLD.state AND NOT ((OLD.state='draft' AND NEW.state IN ('needs_review','superseded')) OR (OLD.state='needs_review' AND NEW.state IN ('approved','superseded')) OR (OLD.state='approved' AND NEW.state='superseded')) THEN RAISE EXCEPTION 'Invalid programme state transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_programme_content BEFORE UPDATE OR DELETE ON programme_versions FOR EACH ROW EXECUTE FUNCTION protect_programme_content();
CREATE TRIGGER immutable_programme_approval BEFORE UPDATE OR DELETE ON programme_approvals FOR EACH ROW EXECUTE FUNCTION protect_learning_snapshot();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['programme_approvals','approved_changes'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_boundary ON %I TO tracker_tenant USING (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true)) WITH CHECK (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true))',t);
  EXECUTE format('GRANT SELECT ON %I TO tracker_tenant',t);
 END LOOP;
END $$;ALTER TABLE enrolments ADD CONSTRAINT enrolment_member_scope UNIQUE(organisation_id,environment,id,member_id);
ALTER TABLE capacity_allocations ADD CONSTRAINT capacity_enrolment_member FOREIGN KEY(organisation_id,environment,enrolment_id,member_id) REFERENCES enrolments(organisation_id,environment,id,member_id);
CREATE FUNCTION check_programme_calendar_member() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM enrolments e JOIN member_calendars c ON c.member_id=e.member_id AND c.environment=e.environment WHERE e.id=NEW.enrolment_id AND e.organisation_id=NEW.organisation_id AND e.environment=NEW.environment AND c.id=NEW.member_calendar_id) THEN RAISE EXCEPTION 'Programme calendar must belong to the enrolled member'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER programme_calendar_member BEFORE INSERT ON programme_versions FOR EACH ROW EXECUTE FUNCTION check_programme_calendar_member();
