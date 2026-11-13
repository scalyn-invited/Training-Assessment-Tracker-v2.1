ALTER TABLE outbox_events ADD CONSTRAINT outbox_scope_identity UNIQUE(organisation_id,environment,actor_id,id);
CREATE TABLE foundation_checks (
 id uuid PRIMARY KEY, organisation_id uuid NOT NULL, environment text NOT NULL, actor_id uuid NOT NULL,
 enrolment_id uuid NOT NULL, enrolment_version integer NOT NULL CHECK(enrolment_version>0),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 128),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','cancelled','failed')),
 error_code text, receipt_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(actor_id,idempotency_key),
 FOREIGN KEY(organisation_id,environment,actor_id,id) REFERENCES outbox_events(organisation_id,environment,actor_id,id),
 FOREIGN KEY(organisation_id,environment,enrolment_id) REFERENCES enrolments(organisation_id,environment,id),
 CHECK((status='delivered')=(receipt_at IS NOT NULL))
);
CREATE INDEX foundation_checks_recent ON foundation_checks(organisation_id,environment,actor_id,created_at DESC,id);
CREATE FUNCTION protect_foundation_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Foundation check attribution is retained'; END IF;
 IF ROW(NEW.id,NEW.organisation_id,NEW.environment,NEW.actor_id,NEW.enrolment_id,NEW.enrolment_version,NEW.idempotency_key,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.organisation_id,OLD.environment,OLD.actor_id,OLD.enrolment_id,OLD.enrolment_version,OLD.idempotency_key,OLD.created_at)
 OR (OLD.status<>'pending' AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'Foundation check attribution and terminal receipts are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER foundation_check_immutable BEFORE UPDATE OR DELETE ON foundation_checks FOR EACH ROW EXECUTE FUNCTION protect_foundation_check();
ALTER TABLE foundation_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE foundation_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY foundation_check_scope ON foundation_checks TO tracker_tenant USING (
 organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true)
 AND actor_id::text=current_setting('app.actor_id',true));
GRANT SELECT ON foundation_checks TO tracker_tenant;
