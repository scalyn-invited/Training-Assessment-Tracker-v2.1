CREATE TABLE onboarding_versions (
 id uuid PRIMARY KEY, organisation_id uuid NOT NULL, environment text NOT NULL, enrolment_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0), last_step text NOT NULL CHECK(last_step IN ('profile','capability','assessment','schedule','measures','resources')),
 data text NOT NULL, actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(enrolment_id,version), UNIQUE(organisation_id,environment,id), UNIQUE(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(organisation_id,environment,enrolment_id) REFERENCES enrolments(organisation_id,environment,id),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
CREATE TABLE member_calendars (
 id uuid PRIMARY KEY, organisation_id uuid NOT NULL, environment text NOT NULL, member_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0), timezone text NOT NULL, daily_minutes integer NOT NULL CHECK(daily_minutes BETWEEN 15 AND 120),
 business_weekdays jsonb NOT NULL DEFAULT '[1,2,3,4,5]', weekdays jsonb NOT NULL, holidays jsonb NOT NULL DEFAULT '[]', absences jsonb NOT NULL DEFAULT '[]',
 reason text NOT NULL, actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(member_id,version), UNIQUE(environment,id), UNIQUE(organisation_id,environment,id),
 FOREIGN KEY(environment,member_id) REFERENCES users(environment,id),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id),
 FOREIGN KEY(organisation_id) REFERENCES organisations(id)
);
CREATE TABLE programme_versions (
 id uuid PRIMARY KEY, organisation_id uuid NOT NULL, environment text NOT NULL, enrolment_id uuid NOT NULL,
 onboarding_version_id uuid NOT NULL, member_calendar_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','needs_review','approved','superseded')), content text NOT NULL, reason text NOT NULL, actor_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(enrolment_id,version), UNIQUE(organisation_id,environment,id), UNIQUE(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(organisation_id,environment,enrolment_id) REFERENCES enrolments(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,onboarding_version_id,enrolment_id) REFERENCES onboarding_versions(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(environment,member_calendar_id) REFERENCES member_calendars(environment,id),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
CREATE TABLE capacity_allocations (
 id uuid PRIMARY KEY, organisation_id uuid NOT NULL, environment text NOT NULL, programme_version_id uuid NOT NULL, enrolment_id uuid NOT NULL, member_id uuid NOT NULL,
 day date NOT NULL, minutes integer NOT NULL CHECK(minutes BETWEEN 15 AND 120), active boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(programme_version_id,day,revision),
 FOREIGN KEY(organisation_id,environment,programme_version_id,enrolment_id) REFERENCES programme_versions(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(environment,member_id) REFERENCES users(environment,id)
);
CREATE INDEX capacity_member_days ON capacity_allocations(member_id,environment,day) WHERE active;
CREATE FUNCTION protect_learning_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Confirmed learning input snapshots are immutable'; END $$;
CREATE TRIGGER immutable_onboarding BEFORE UPDATE OR DELETE ON onboarding_versions FOR EACH ROW EXECUTE FUNCTION protect_learning_snapshot();
CREATE TRIGGER immutable_calendar BEFORE UPDATE OR DELETE ON member_calendars FOR EACH ROW EXECUTE FUNCTION protect_learning_snapshot();
ALTER TABLE document_extractions ADD CONSTRAINT extraction_confirmed_onboarding FOREIGN KEY(organisation_id,environment,confirmed_onboarding_id,enrolment_id) REFERENCES onboarding_versions(organisation_id,environment,id,enrolment_id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['onboarding_versions','member_calendars','programme_versions','capacity_allocations'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  EXECUTE format('CREATE POLICY tenant_boundary ON %I TO tracker_tenant USING (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true)) WITH CHECK (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true))', t);
  EXECUTE format('GRANT SELECT ON %I TO tracker_tenant',t);
 END LOOP;
END $$;