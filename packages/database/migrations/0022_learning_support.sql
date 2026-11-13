CREATE TABLE adaptation_proposals (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,learning_block_id uuid,member_calendar_id uuid NOT NULL,
 evidence_block integer NOT NULL CHECK(evidence_block BETWEEN 1 AND 12),source_ids jsonb NOT NULL,policy_version text NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','provisional','approved','source_review_required','stale','failed','ambiguous','final_support')),
 replacement text,reason text NOT NULL,actor_id uuid NOT NULL,approved_by uuid,approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,enrolment_id) REFERENCES enrolments(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,learning_block_id,enrolment_id) REFERENCES learning_blocks(organisation_id,environment,id,enrolment_id),
 FOREIGN KEY(environment,member_calendar_id) REFERENCES member_calendars(environment,id),FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id),FOREIGN KEY(environment,approved_by) REFERENCES users(environment,id),
 CHECK((status='final_support')=(learning_block_id IS NULL)),CHECK((approved_by IS NULL)=(approved_at IS NULL))
);
CREATE TRIGGER adaptation_calendar_member BEFORE INSERT ON adaptation_proposals FOR EACH ROW EXECUTE FUNCTION check_programme_calendar_member();
CREATE TABLE kpi_suggestions (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,source_ids jsonb NOT NULL,actions text,
 status text NOT NULL CHECK(status IN ('queued','provisional','failed','ambiguous')),actor_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment,enrolment_id) REFERENCES enrolments(organisation_id,environment,id),FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
CREATE FUNCTION protect_adaptation_proposal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'replacement'-'reason'-'approved_by'-'approved_at'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'replacement'-'reason'-'approved_by'-'approved_at'-'updated_at') THEN RAISE EXCEPTION 'Adaptation sources are immutable'; END IF;
 IF OLD.status<>'queued' AND (NEW.replacement IS DISTINCT FROM OLD.replacement OR NEW.reason IS DISTINCT FROM OLD.reason) THEN RAISE EXCEPTION 'Adaptation result is immutable'; END IF;
 IF (NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at) AND NOT (OLD.status='provisional' AND NEW.status='approved' AND OLD.approved_by IS NULL AND NEW.approved_by IS NOT NULL AND NEW.approved_at IS NOT NULL) THEN RAISE EXCEPTION 'Adaptation approval is immutable'; END IF;
 IF NEW.status IN ('approved','source_review_required') AND (NEW.approved_by IS NULL OR NEW.replacement IS NULL) THEN RAISE EXCEPTION 'Adaptation approval requires a result and reviewer'; END IF;
 IF OLD.status=NEW.status THEN RETURN NEW; END IF;
 IF NOT ((OLD.status='queued' AND NEW.status IN ('provisional','stale','failed','ambiguous')) OR (OLD.status='provisional' AND NEW.status IN ('approved','stale')) OR (OLD.status='approved' AND NEW.status='source_review_required')) THEN RAISE EXCEPTION 'Invalid adaptation transition'; END IF;
 IF OLD.approved_by IS NOT NULL AND (NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at) THEN RAISE EXCEPTION 'Adaptation approval is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_adaptation BEFORE UPDATE OR DELETE ON adaptation_proposals FOR EACH ROW EXECUTE FUNCTION protect_adaptation_proposal();
CREATE FUNCTION protect_kpi_suggestion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'actions'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'actions'-'updated_at') OR (OLD.status<>'queued' AND (NEW.actions IS DISTINCT FROM OLD.actions OR NEW.status<>OLD.status)) THEN RAISE EXCEPTION 'Support suggestion is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_suggestion BEFORE UPDATE OR DELETE ON kpi_suggestions FOR EACH ROW EXECUTE FUNCTION protect_kpi_suggestion();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['adaptation_proposals','kpi_suggestions'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_boundary ON %I TO tracker_tenant USING (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true)) WITH CHECK (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true))',t);
 EXECUTE format('GRANT SELECT ON %I TO tracker_tenant',t);
 END LOOP;
END $$;
