CREATE TABLE installation (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), installed_at timestamptz NOT NULL DEFAULT now(), admin_id uuid NOT NULL REFERENCES users(id)
);
ALTER TABLE users ADD COLUMN global_admin boolean NOT NULL DEFAULT false;
CREATE TABLE identities (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), issuer text NOT NULL, subject text NOT NULL,
 active boolean NOT NULL DEFAULT true, UNIQUE(issuer,subject)
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id uuid REFERENCES users(id), csrf text NOT NULL,
 permission_version integer, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '8 hours'
);
CREATE TABLE auth_attempts (
 key_hash text PRIMARY KEY, count integer NOT NULL, reset_at timestamptz NOT NULL
);
CREATE TABLE user_mfa (
 user_id uuid PRIMARY KEY REFERENCES users(id), secret_ciphertext text, pending_ciphertext text,
 pending_expires_at timestamptz, enabled boolean NOT NULL DEFAULT false,
 last_counter bigint NOT NULL DEFAULT -1
);
CREATE TABLE recovery_codes (
 user_id uuid NOT NULL REFERENCES users(id), code_hash text NOT NULL, consumed_at timestamptz,
 PRIMARY KEY(user_id,code_hash)
);
CREATE TABLE account_audit (
 id uuid PRIMARY KEY,user_id uuid REFERENCES users(id), action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
