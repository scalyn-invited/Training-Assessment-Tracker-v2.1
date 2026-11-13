ALTER TABLE users ADD COLUMN directory_version integer NOT NULL DEFAULT 0;
CREATE TABLE directory_people (
 organisation_id uuid NOT NULL,environment text NOT NULL CHECK(environment='test'),external_person_id text NOT NULL,user_id uuid NOT NULL,
 PRIMARY KEY(organisation_id,environment,external_person_id),UNIQUE(organisation_id,environment,user_id),
 FOREIGN KEY(organisation_id,environment) REFERENCES platform_client_states(organisation_id,environment),FOREIGN KEY(environment,user_id) REFERENCES users(environment,id)
);
CREATE TABLE directory_memberships (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL CHECK(environment='test'),user_id uuid NOT NULL,group_id uuid NOT NULL,ends_at timestamptz,
 UNIQUE(organisation_id,environment,user_id,group_id),FOREIGN KEY(organisation_id,environment,user_id) REFERENCES directory_people(organisation_id,environment,user_id),FOREIGN KEY(organisation_id,environment,group_id) REFERENCES groups(organisation_id,environment,id)
);
CREATE TABLE inbound_events (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL CHECK(environment='test'),event_id uuid NOT NULL UNIQUE,payload_hash text NOT NULL,entity_id text NOT NULL,entity_version integer NOT NULL CHECK(entity_version>=1),outcome text NOT NULL CHECK(outcome IN ('applied','stale')),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organisation_id,environment) REFERENCES platform_client_states(organisation_id,environment)
);
CREATE INDEX inbound_entity_version ON inbound_events(organisation_id,environment,entity_id,entity_version);
CREATE TABLE integration_cursors (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL CHECK(environment='test'),stream text NOT NULL,cursor text NOT NULL,last_success_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,stream),FOREIGN KEY(organisation_id,environment) REFERENCES platform_client_states(organisation_id,environment)
);
CREATE TRIGGER immutable_inbound_event BEFORE UPDATE OR DELETE ON inbound_events FOR EACH ROW EXECUTE FUNCTION protect_learning_snapshot();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['directory_people','directory_memberships','inbound_events','integration_cursors'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_boundary ON %I TO tracker_tenant USING (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true)) WITH CHECK (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true))',t);
  EXECUTE format('GRANT SELECT ON %I TO tracker_tenant',t);
 END LOOP;
END $$;
