CREATE TABLE ai_policies(
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL REFERENCES organisations(id),environment text NOT NULL REFERENCES platform_settings(environment),
 task text NOT NULL,version integer NOT NULL,routing jsonb NOT NULL,actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,id),UNIQUE(organisation_id,environment,task,version),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
CREATE TABLE ai_runs(
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,enrolment_id uuid NOT NULL,actor_id uuid NOT NULL,
 programme_version_id uuid,result_version_id uuid,idempotency_key text NOT NULL,payload_hash text NOT NULL,task text NOT NULL,subject_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','running','complete','failed','ambiguous','cancelled')),
 configuration jsonb NOT NULL,task_input text NOT NULL,feedback text,reserved bigint NOT NULL CHECK(reserved>=0),spent bigint NOT NULL DEFAULT 0 CHECK(spent>=0),message text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,id),UNIQUE(organisation_id,environment,actor_id,idempotency_key),
 FOREIGN KEY(organisation_id,environment,enrolment_id) REFERENCES enrolments(organisation_id,environment,id),
 FOREIGN KEY(environment,actor_id) REFERENCES users(environment,id)
);
CREATE TABLE ai_blocks(
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,ai_run_id uuid NOT NULL,block_index integer NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','complete','failed','ambiguous','cancelled')),
 calls integer NOT NULL DEFAULT 0,repairs integer NOT NULL DEFAULT 0,provider_index integer NOT NULL DEFAULT 0,dispatch_seq integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,output text,claim_token uuid,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,id),UNIQUE(ai_run_id,block_index),
 FOREIGN KEY(organisation_id,environment,ai_run_id) REFERENCES ai_runs(organisation_id,environment,id)
);
CREATE UNIQUE INDEX one_client_provider_call ON ai_blocks(organisation_id,environment) WHERE status='running';
CREATE TABLE ai_attempts(
 id uuid PRIMARY KEY,organisation_id uuid NOT NULL,environment text NOT NULL,ai_block_id uuid NOT NULL,number integer NOT NULL,
 provider text NOT NULL,model text NOT NULL,status text NOT NULL,external_id text,input_tokens bigint,output_tokens bigint,cost bigint,latency_ms integer,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organisation_id,environment,id),UNIQUE(ai_block_id,number),
 FOREIGN KEY(organisation_id,environment,ai_block_id) REFERENCES ai_blocks(organisation_id,environment,id)
);
CREATE INDEX ai_provider_minute ON ai_attempts(provider,created_at);
CREATE TABLE ai_provider_locks(provider text PRIMARY KEY);
DO $$
DECLARE target text;
BEGIN
 FOREACH target IN ARRAY ARRAY['ai_policies','ai_runs','ai_blocks','ai_attempts'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',target);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',target);
 EXECUTE format('CREATE POLICY tenant_boundary ON %I TO tracker_tenant USING (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true)) WITH CHECK (organisation_id::text=current_setting(''app.organisation_id'',true) AND environment=current_setting(''app.environment'',true))',target);
 EXECUTE format('GRANT SELECT ON %I TO tracker_tenant',target);
 END LOOP;
END $$;
