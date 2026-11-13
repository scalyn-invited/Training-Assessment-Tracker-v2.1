CREATE TABLE promotions (
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,user_id uuid NOT NULL,actor_id uuid NOT NULL,idempotency_key uuid NOT NULL UNIQUE,payload_hash text NOT NULL,payload text NOT NULL,
 status text NOT NULL CHECK(status IN ('prepared','queued','reconcile_queued','sending','ambiguous','duplicate_review','linked')),external_person_id text,reason text NOT NULL,dispatch_version integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organisation_id,environment,id),
 FOREIGN KEY(organisation_id,environment) REFERENCES platform_client_states(organisation_id,environment),FOREIGN KEY(environment,user_id) REFERENCES users(environment,id),FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
CREATE FUNCTION protect_promotion_payload() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'actor_id'-'status'-'external_person_id'-'dispatch_version'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'actor_id'-'status'-'external_person_id'-'dispatch_version'-'updated_at') THEN RAISE EXCEPTION 'Promotion request is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_promotion_request BEFORE UPDATE OR DELETE ON promotions FOR EACH ROW EXECUTE FUNCTION protect_promotion_payload();
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_boundary ON promotions TO tracker_tenant USING (organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true)) WITH CHECK (organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true));
-- Private payload ciphertext stays server-only; administration returns an explicit projection.
