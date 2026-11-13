CREATE TABLE operational_heartbeats(component text PRIMARY KEY,seen_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE legal_holds(
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,actor_id uuid NOT NULL,
 reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),released_at timestamptz,
 FOREIGN KEY(organisation_id,environment,enrolment_id) REFERENCES enrolments(organisation_id,environment,id),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
CREATE TABLE deletion_ledger(
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,kind text NOT NULL CHECK(kind='evidence_file'),
 target_id uuid NOT NULL,object_hash text NOT NULL,policy_version text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(kind,target_id),
 FOREIGN KEY(organisation_id,environment,target_id) REFERENCES evidence_files(organisation_id,environment,id)
);
CREATE FUNCTION protect_deletion_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Deletion receipts are immutable'; END $$;
CREATE TRIGGER immutable_deletion_receipt BEFORE UPDATE OR DELETE ON deletion_ledger FOR EACH ROW EXECUTE FUNCTION protect_deletion_receipt();
DO $$ DECLARE target text; BEGIN
 FOREACH target IN ARRAY ARRAY['legal_holds','deletion_ledger'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',target);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',target);
 EXECUTE format('CREATE POLICY tenant_boundary ON %I TO tracker_tenant USING (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true)) WITH CHECK (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true))',target);
 EXECUTE format('GRANT SELECT ON %I TO tracker_tenant',target);
 END LOOP;
END $$;
ALTER TABLE evidence_files DROP CONSTRAINT evidence_files_scan_status_check;
ALTER TABLE evidence_files ADD CONSTRAINT evidence_files_scan_status_check CHECK(scan_status IN ('quarantined','scanning','clean','rejected','deleted'));
ALTER TABLE evidence_files DROP CONSTRAINT evidence_files_bytes_check;
ALTER TABLE evidence_files ADD CONSTRAINT evidence_files_bytes_check CHECK(bytes>=0 AND bytes<=20971520 AND (bytes>0 OR scan_status='deleted'));
ALTER TABLE document_extractions DROP CONSTRAINT document_extractions_status_check;
ALTER TABLE document_extractions ADD CONSTRAINT document_extractions_status_check CHECK(status IN ('waiting_scan','queued','running','ready','confirmed','failed','purged'));
ALTER TABLE document_extractions ALTER COLUMN warnings DROP NOT NULL;
ALTER TABLE assessment_file_confirmations ALTER COLUMN text DROP NOT NULL;
DROP TRIGGER immutable_file_confirmation ON assessment_file_confirmations;
CREATE FUNCTION protect_file_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.text IS NULL AND (to_jsonb(NEW)-'text')=(to_jsonb(OLD)-'text') AND EXISTS(
 SELECT 1 FROM deletion_ledger d JOIN evidence_files f ON f.id=d.target_id
 WHERE d.kind='evidence_file' AND f.id=OLD.evidence_file_id AND f.scan_status='deleted'
 AND d.organisation_id=OLD.organisation_id AND d.environment=OLD.environment
 ) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Assessment file confirmations are immutable';
END $$;
CREATE TRIGGER immutable_file_confirmation BEFORE UPDATE OR DELETE ON assessment_file_confirmations FOR EACH ROW EXECUTE FUNCTION protect_file_confirmation();
ALTER TABLE ai_runs ALTER COLUMN task_input DROP NOT NULL;
