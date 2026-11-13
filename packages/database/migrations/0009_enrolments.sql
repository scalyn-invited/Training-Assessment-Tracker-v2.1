CREATE TABLE enrolments (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,
 member_id uuid NOT NULL,member_membership_id uuid NOT NULL,coordinator_id uuid NOT NULL,group_id uuid,
 title text NOT NULL,status text NOT NULL DEFAULT 'onboarding' CHECK(status IN ('onboarding','ready','active','paused','completed','cancelled')),
 version integer NOT NULL DEFAULT 1,timezone text NOT NULL DEFAULT 'Asia/Manila',
 duration_weeks integer NOT NULL DEFAULT 4 CHECK(duration_weeks IN (4,6,8,10,12)),
 daily_minutes integer NOT NULL DEFAULT 30 CHECK(daily_minutes BETWEEN 15 AND 120),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,member_membership_id,member_id) REFERENCES client_memberships(organisation_id,environment,id,user_id),
 FOREIGN KEY(environment,coordinator_id) REFERENCES users(environment,id),
 FOREIGN KEY(organisation_id,environment,group_id) REFERENCES groups(organisation_id,environment,id),
 CHECK(member_id<>coordinator_id)
);
CREATE INDEX enrolments_member ON enrolments(organisation_id,environment,member_id);
ALTER TABLE enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrolments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_boundary ON enrolments TO tracker_tenant
 USING (organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true))
 WITH CHECK (organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true));
GRANT SELECT ON enrolments TO tracker_tenant;
