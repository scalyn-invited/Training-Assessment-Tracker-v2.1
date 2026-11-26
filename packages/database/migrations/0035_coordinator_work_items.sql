CREATE TABLE coordinator_work_items (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  environment text NOT NULL,
  enrolment_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('assign_assessment', 'check_evidence')),
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  FOREIGN KEY (organisation_id, environment, enrolment_id)
    REFERENCES enrolments (organisation_id, environment, id)
);
CREATE INDEX coordinator_open_tasks ON coordinator_work_items
  (organisation_id, environment, enrolment_id, due_at) WHERE completed_at IS NULL;
ALTER TABLE coordinator_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE coordinator_work_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_boundary ON coordinator_work_items TO tracker_tenant
  USING (organisation_id::text=current_setting('app.organisation_id',true)
    AND environment=current_setting('app.environment',true));
GRANT SELECT ON coordinator_work_items TO tracker_tenant;
