ALTER TABLE users ADD COLUMN password_enabled boolean NOT NULL DEFAULT true;
CREATE TABLE local_account_links(
 id uuid PRIMARY KEY,token_hash text NOT NULL UNIQUE,purpose text NOT NULL CHECK(purpose IN ('setup','reset','invite')),
 user_id uuid NOT NULL,issuer_id uuid NOT NULL,issuer_version integer NOT NULL,organisation_id uuid,
 environment text NOT NULL REFERENCES platform_settings(environment),
 expires_at timestamptz NOT NULL,consumed_at timestamptz,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(environment,user_id) REFERENCES users(environment,id),
 FOREIGN KEY(environment,issuer_id) REFERENCES users(environment,id),
 FOREIGN KEY(organisation_id,environment) REFERENCES platform_client_states(organisation_id,environment),
 CHECK(purpose='reset' OR organisation_id IS NOT NULL)
);
CREATE INDEX account_link_recipient ON local_account_links(user_id,purpose);
ALTER TABLE local_account_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_account_links FORCE ROW LEVEL SECURITY;
CREATE POLICY link_scope ON local_account_links TO tracker_tenant USING(
 organisation_id::text=current_setting('app.organisation_id',true) AND environment=current_setting('app.environment',true)
);
-- Raw tokens are only returned at issuance, never retained or listed.
