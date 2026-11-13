CREATE TABLE assessment_team_rules (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,definition_id uuid NOT NULL,group_id uuid NOT NULL,actor_id uuid NOT NULL,
 active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,result text,checked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,id),UNIQUE(definition_id,group_id,actor_id),
 FOREIGN KEY(organisation_id,environment,definition_id) REFERENCES assessment_definitions(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,group_id) REFERENCES groups(organisation_id,environment,id),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
CREATE TABLE assessment_assignments (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,definition_id uuid NOT NULL,enrolment_id uuid NOT NULL,actor_id uuid NOT NULL,
 team_rule_id uuid,version integer NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'assigned'
 CHECK(status IN ('assigned','draft','submitted','queued','review_pending','technical_failure','approved','rejected')),
 draft text,approved_review_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,id),UNIQUE(definition_id,enrolment_id),
 FOREIGN KEY(organisation_id,environment,definition_id) REFERENCES assessment_definitions(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,enrolment_id) REFERENCES enrolments(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,team_rule_id) REFERENCES assessment_team_rules(organisation_id,environment,id),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
DO $$
DECLARE target text;
BEGIN
 FOREACH target IN ARRAY ARRAY['assessment_team_rules','assessment_assignments'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',target);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',target);
 EXECUTE format('CREATE POLICY tenant_boundary ON %I TO tracker_tenant USING (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true)) WITH CHECK (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true))',target);
 EXECUTE format('GRANT SELECT ON %I TO tracker_tenant',target);
 END LOOP;
END $$;
