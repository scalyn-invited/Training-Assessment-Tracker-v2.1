CREATE TABLE assessment_attempts (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,assignment_id uuid NOT NULL,
 number integer NOT NULL,draft_version integer NOT NULL,idempotency_key uuid NOT NULL,snapshot text NOT NULL,content_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organisation_id,environment,id),UNIQUE(assignment_id,number),UNIQUE(environment,idempotency_key),
 FOREIGN KEY(organisation_id,environment,assignment_id) REFERENCES assessment_assignments(organisation_id,environment,id)
);
CREATE FUNCTION protect_assessment_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Submitted assessment attempts are immutable'; END $$;
CREATE TRIGGER immutable_assessment_attempt BEFORE UPDATE OR DELETE ON assessment_attempts FOR EACH ROW EXECUTE FUNCTION protect_assessment_attempt();
ALTER TABLE assessment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_boundary ON assessment_attempts TO tracker_tenant
 USING (organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true))
 WITH CHECK (organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true));
GRANT SELECT ON assessment_attempts TO tracker_tenant;
