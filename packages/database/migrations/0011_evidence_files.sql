CREATE TABLE evidence_files (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,uploaded_by uuid NOT NULL,
 storage_key text NOT NULL UNIQUE,original_name text NOT NULL,mime text NOT NULL,bytes bigint NOT NULL CHECK(bytes>0 AND bytes<=20971520),sha256 text NOT NULL,
 scan_status text NOT NULL DEFAULT 'quarantined' CHECK(scan_status IN ('quarantined','scanning','clean','rejected')),
 sensitive boolean NOT NULL DEFAULT true,purpose text NOT NULL CHECK(purpose IN ('assessment','evidence')),
 version integer NOT NULL DEFAULT 1,scan_token uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,enrolment_id) REFERENCES enrolments(organisation_id,environment,id),
 FOREIGN KEY(environment,uploaded_by) REFERENCES users(environment,id)
);
ALTER TABLE evidence_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_files FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_boundary ON evidence_files TO tracker_tenant
 USING (organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true))
 WITH CHECK (organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true));
GRANT SELECT ON evidence_files TO tracker_tenant;
