ALTER TABLE identities ADD CONSTRAINT identity_user_id UNIQUE(user_id,id);
ALTER TABLE sessions ADD COLUMN authentication_mode text NOT NULL DEFAULT 'local_password' CHECK(authentication_mode IN ('local_password','mock'));
ALTER TABLE sessions ADD COLUMN identity_id uuid;
ALTER TABLE sessions ADD CONSTRAINT session_identity_owner FOREIGN KEY(user_id,identity_id) REFERENCES identities(user_id,id);
ALTER TABLE sessions ADD CONSTRAINT mock_session_identity CHECK(authentication_mode<>'mock' OR (user_id IS NOT NULL AND identity_id IS NOT NULL));
