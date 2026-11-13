ALTER TABLE assessment_media DROP CONSTRAINT assessment_media_status_check;
ALTER TABLE assessment_media ADD CONSTRAINT assessment_media_status_check CHECK(status IN ('quarantined','scanning','ready','rejected','unavailable'));
ALTER TABLE assessment_media ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE assessment_media ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE assessment_media ADD COLUMN scan_token uuid;
