CREATE TABLE client_brandings (
 organisation_id uuid NOT NULL,environment text NOT NULL,version integer NOT NULL DEFAULT 1,
 mode text NOT NULL CHECK(mode IN ('cerebru','co-branded','white-label')),
 client_name text NOT NULL,app_name text NOT NULL,accent text NOT NULL,default_theme text,
 logo_path text,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organisation_id,environment),
 FOREIGN KEY(organisation_id,environment) REFERENCES platform_client_states(organisation_id,environment)
);
CREATE TABLE client_theme_preferences (
 organisation_id uuid NOT NULL,environment text NOT NULL,user_id uuid NOT NULL,theme text,version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(organisation_id,environment,user_id),
 FOREIGN KEY(organisation_id,environment) REFERENCES platform_client_states(organisation_id,environment),
 FOREIGN KEY(environment,user_id) REFERENCES users(environment,id)
);
DO $$
DECLARE target text;
BEGIN
 FOREACH target IN ARRAY ARRAY['client_brandings','client_theme_preferences'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',target);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',target);
 EXECUTE format('CREATE POLICY tenant_boundary ON %I TO tracker_tenant USING (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true)) WITH CHECK (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true))',target);
 EXECUTE format('GRANT SELECT ON %I TO tracker_tenant',target);
 END LOOP;
END $$;
