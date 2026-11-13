CREATE TABLE calendar_changes (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,
 enrolment_version integer NOT NULL CHECK(enrolment_version>0),preview text NOT NULL,status text NOT NULL DEFAULT 'preview' CHECK(status IN ('preview','approved')),
 actor_id uuid NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,enrolment_id) REFERENCES enrolments(organisation_id,environment,id),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
CREATE FUNCTION protect_calendar_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'updated_at') OR (OLD.status='approved' AND NEW.status<>'approved') THEN RAISE EXCEPTION 'Calendar preview is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_calendar_change BEFORE UPDATE OR DELETE ON calendar_changes FOR EACH ROW EXECUTE FUNCTION protect_calendar_change();
ALTER TABLE calendar_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_boundary ON calendar_changes TO tracker_tenant USING (organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true)) WITH CHECK (organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true));
GRANT SELECT ON calendar_changes TO tracker_tenant;
