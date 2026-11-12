ALTER TABLE users ADD COLUMN origin text NOT NULL DEFAULT 'manual';
ALTER TABLE users ADD COLUMN sync_policy text NOT NULL DEFAULT 'local_only';
ALTER TABLE users ADD COLUMN permissions_synced_at timestamptz;
ALTER TABLE users ADD COLUMN external_person_id text;
ALTER TABLE users ADD CONSTRAINT users_environment_id UNIQUE(environment,id);
ALTER TABLE client_memberships ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE client_memberships ADD CONSTRAINT memberships_tenant_id UNIQUE(organisation_id,environment,id);
ALTER TABLE client_memberships ADD CONSTRAINT memberships_tenant_actor UNIQUE(organisation_id,environment,id,user_id);
ALTER TABLE client_memberships ADD CONSTRAINT memberships_user_environment FOREIGN KEY(environment,user_id) REFERENCES users(environment,id);
ALTER TABLE sessions ADD COLUMN organisation_id uuid REFERENCES organisations(id);
CREATE TABLE platform_settings (
 environment text PRIMARY KEY CHECK(environment IN ('test','production')),version integer NOT NULL DEFAULT 0,
 display_name text,app_name text,accent text,default_theme text,logo_path text
);
INSERT INTO platform_settings(environment) VALUES('test'),('production');
CREATE TABLE platform_client_states (
 organisation_id uuid NOT NULL REFERENCES organisations(id),environment text NOT NULL REFERENCES platform_settings(environment),
 suspended boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 0,
 PRIMARY KEY(organisation_id,environment)
);
INSERT INTO platform_client_states(organisation_id,environment) SELECT DISTINCT organisation_id,environment FROM client_memberships;
CREATE TABLE groups (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL REFERENCES organisations(id),environment text NOT NULL,
 name text NOT NULL,kind text NOT NULL CHECK(kind IN ('team','cohort')),origin text NOT NULL DEFAULT 'manual',active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment) REFERENCES platform_client_states(organisation_id,environment)
);
CREATE TABLE client_team_memberships (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,group_id uuid NOT NULL,client_membership_id uuid NOT NULL,
 starts_at timestamptz NOT NULL DEFAULT now(),ends_at timestamptz,
 FOREIGN KEY(organisation_id,environment,group_id) REFERENCES groups(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,client_membership_id) REFERENCES client_memberships(organisation_id,environment,id)
);
CREATE UNIQUE INDEX current_team_membership ON client_team_memberships(group_id,client_membership_id) WHERE ends_at IS NULL;
CREATE TABLE role_assignments (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),role text NOT NULL CHECK(role IN ('admin','coordinator','member')),
 organisation_id uuid REFERENCES organisations(id),environment text NOT NULL REFERENCES platform_settings(environment),
 client_membership_id uuid,group_id uuid,scope_type text NOT NULL CHECK(scope_type IN ('platform','client','team')),
 scope_key text NOT NULL,starts_at timestamptz NOT NULL DEFAULT now(),ends_at timestamptz,
 granted_by uuid NOT NULL REFERENCES users(id),reason text NOT NULL,
 FOREIGN KEY(environment,user_id) REFERENCES users(environment,id),
 FOREIGN KEY(organisation_id,environment,client_membership_id,user_id) REFERENCES client_memberships(organisation_id,environment,id,user_id),
 FOREIGN KEY(organisation_id,environment,group_id) REFERENCES groups(organisation_id,environment,id),
 CHECK(
 (scope_type='platform' AND role='admin' AND organisation_id IS NULL AND client_membership_id IS NULL AND group_id IS NULL AND scope_key='platform')
 OR (scope_type='client' AND organisation_id IS NOT NULL AND client_membership_id IS NOT NULL AND group_id IS NULL AND scope_key='client:'||organisation_id::text)
 OR (scope_type='team' AND role='coordinator' AND organisation_id IS NOT NULL AND client_membership_id IS NOT NULL AND group_id IS NOT NULL AND scope_key='team:'||group_id::text)
 )
);
CREATE UNIQUE INDEX current_role_assignment ON role_assignments(user_id,environment,role,scope_key) WHERE ends_at IS NULL;
INSERT INTO role_assignments(id,user_id,role,environment,scope_type,scope_key,granted_by,reason)
 SELECT gen_random_uuid(),id,'admin',environment,'platform','platform',id,'V2.1 bootstrap administrator migration' FROM users WHERE global_admin;
INSERT INTO role_assignments(id,user_id,role,organisation_id,environment,client_membership_id,scope_type,scope_key,granted_by,reason)
 SELECT gen_random_uuid(),u.id,CASE WHEN split_part(split_part(u.email,'@',1),'.',3)='0' THEN 'admin'
 WHEN split_part(split_part(u.email,'@',1),'.',3) IN ('1','2') THEN 'coordinator' ELSE 'member' END,
 cm.organisation_id,cm.environment,cm.id,'client','client:'||cm.organisation_id::text,
 (SELECT admin_id FROM installation LIMIT 1),'Synthetic local demo role migration'
 FROM users u JOIN client_memberships cm ON cm.user_id=u.id
 WHERE u.is_synthetic AND u.email ~ '^demo\.[1-3]\.[0-9]@example\.invalid$' AND EXISTS(SELECT 1 FROM installation);
CREATE TABLE coordinator_allocations (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,
 member_membership_id uuid NOT NULL,coordinator_membership_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('primary','backup')),
 starts_at timestamptz NOT NULL DEFAULT now(),ends_at timestamptz,
 assigned_by uuid NOT NULL REFERENCES users(id),reason text NOT NULL,
 CHECK(member_membership_id<>coordinator_membership_id),
 FOREIGN KEY(organisation_id,environment,member_membership_id) REFERENCES client_memberships(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,coordinator_membership_id) REFERENCES client_memberships(organisation_id,environment,id)
);
CREATE UNIQUE INDEX current_allocation ON coordinator_allocations(member_membership_id,coordinator_membership_id) WHERE ends_at IS NULL;
CREATE UNIQUE INDEX current_primary_allocation ON coordinator_allocations(member_membership_id) WHERE kind='primary' AND ends_at IS NULL;
CREATE TABLE client_sensitive_grants (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,allocation_id uuid NOT NULL REFERENCES coordinator_allocations(id),
 starts_at timestamptz NOT NULL DEFAULT now(),ends_at timestamptz,granted_by uuid NOT NULL REFERENCES users(id),reason text NOT NULL
);
CREATE UNIQUE INDEX current_sensitive_grant ON client_sensitive_grants(allocation_id) WHERE ends_at IS NULL;
CREATE TABLE platform_audit_events (
 id uuid PRIMARY KEY,environment text NOT NULL,actor_id uuid REFERENCES users(id),operator_reference text,
 action text NOT NULL,target_id text NOT NULL,reason text NOT NULL,changes jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_audit_filter ON platform_audit_events(environment,created_at DESC);
DO $$
DECLARE target text;
BEGIN
 FOREACH target IN ARRAY ARRAY['groups','client_team_memberships','coordinator_allocations','client_sensitive_grants','platform_client_states'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',target);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',target);
  EXECUTE format('CREATE POLICY tenant_boundary ON %I TO tracker_tenant USING (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true)) WITH CHECK (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true))',target);
  EXECUTE format('GRANT SELECT ON %I TO tracker_tenant',target);
 END LOOP;
END $$;
ALTER TABLE role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY role_boundary ON role_assignments TO tracker_tenant USING (
 organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true)
);
GRANT SELECT ON role_assignments TO tracker_tenant;
