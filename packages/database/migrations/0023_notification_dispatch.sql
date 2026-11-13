ALTER TABLE learning_notifications ADD COLUMN dispatch_version integer NOT NULL DEFAULT 0;
CREATE INDEX learning_notifications_dispatch ON learning_notifications(status,available_at);
