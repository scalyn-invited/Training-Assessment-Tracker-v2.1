CREATE TABLE assessment_definitions (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,
 family_id uuid NOT NULL,revision integer NOT NULL,version integer NOT NULL DEFAULT 1,
 actor_id uuid NOT NULL,title text NOT NULL,status text NOT NULL CHECK(status IN ('draft','published')),
 questions jsonb NOT NULL,sections jsonb,rubric jsonb NOT NULL,answer_key text NOT NULL,
 published_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,id),UNIQUE(family_id,revision),
 FOREIGN KEY(organisation_id,environment) REFERENCES platform_client_states(organisation_id,environment),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
CREATE TABLE assessment_definition_saves (
 organisation_id uuid NOT NULL,environment text NOT NULL,token uuid NOT NULL,payload_hash text NOT NULL,
 definition_id uuid NOT NULL,version integer NOT NULL,
 PRIMARY KEY(organisation_id,environment,token),
 FOREIGN KEY(organisation_id,environment,definition_id) REFERENCES assessment_definitions(organisation_id,environment,id)
);
CREATE TABLE assessment_media (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,actor_id uuid NOT NULL,
 path text NOT NULL,source_hash text NOT NULL,status text NOT NULL CHECK(status IN ('quarantined','ready','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment) REFERENCES platform_client_states(organisation_id,environment),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
CREATE FUNCTION protect_published_assessment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='published' THEN RAISE EXCEPTION 'Published assessment revisions are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_assessment BEFORE UPDATE OR DELETE ON assessment_definitions FOR EACH ROW EXECUTE FUNCTION protect_published_assessment();
DO $$
DECLARE target text;
BEGIN
 FOREACH target IN ARRAY ARRAY['assessment_definitions','assessment_definition_saves','assessment_media'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',target);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',target);
 EXECUTE format('CREATE POLICY tenant_boundary ON %I TO tracker_tenant USING (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true)) WITH CHECK (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true))',target);
 EXECUTE format('GRANT SELECT ON %I TO tracker_tenant',target);
 END LOOP;
END $$;
