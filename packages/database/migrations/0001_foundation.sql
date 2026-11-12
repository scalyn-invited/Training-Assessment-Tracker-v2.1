CREATE ROLE tracker_tenant NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT tracker_tenant TO CURRENT_USER;
CREATE TABLE organisations (
 id uuid PRIMARY KEY, name text NOT NULL, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL,
 password_hash text NOT NULL, active boolean NOT NULL DEFAULT true,
 environment text NOT NULL CHECK(environment IN ('test','production')),
 is_synthetic boolean NOT NULL DEFAULT true, permission_version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(environment <> 'production' OR NOT is_synthetic)
);
CREATE TABLE client_memberships (
 id uuid PRIMARY KEY, organisation_id uuid NOT NULL REFERENCES organisations(id),
 environment text NOT NULL CHECK(environment IN ('test','production')), user_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),
 joined_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
 UNIQUE(organisation_id,environment,user_id)
);
CREATE TABLE audit_events (
 id uuid PRIMARY KEY, organisation_id uuid NOT NULL REFERENCES organisations(id),
 environment text NOT NULL CHECK(environment IN ('test','production')),
 actor_id uuid NOT NULL REFERENCES users(id), action text NOT NULL, target_id text NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE outbox_events (
 id uuid PRIMARY KEY, organisation_id uuid NOT NULL REFERENCES organisations(id),
 environment text NOT NULL CHECK(environment IN ('test','production')),
 actor_id uuid NOT NULL REFERENCES users(id), kind text NOT NULL,
 idempotency_key text NOT NULL, payload_hash text NOT NULL, payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','done','failed','uncertain')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid, lease_until timestamptz, last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,actor_id,idempotency_key)
);
CREATE INDEX outbox_due ON outbox_events(status,available_at);
CREATE TABLE worker_heartbeats (id text PRIMARY KEY, last_seen_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE client_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_scope ON client_memberships TO tracker_tenant USING (
 organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true)
) WITH CHECK (
 organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true)
);
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_scope ON audit_events TO tracker_tenant USING (
 organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true)
) WITH CHECK (
 organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true)
 AND actor_id::text=current_setting('app.actor_id',true)
);
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_scope ON outbox_events TO tracker_tenant USING (
 organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true)
 AND actor_id::text=current_setting('app.actor_id',true)
) WITH CHECK (
 organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true)
 AND actor_id::text=current_setting('app.actor_id',true)
);
GRANT USAGE ON SCHEMA public TO tracker_tenant;
GRANT SELECT ON client_memberships TO tracker_tenant;
GRANT SELECT,INSERT ON audit_events TO tracker_tenant;
GRANT SELECT,INSERT ON outbox_events TO tracker_tenant;
