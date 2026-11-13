ALTER TABLE users ADD COLUMN linked_at timestamptz;
ALTER TABLE users ADD COLUMN export_training_history boolean NOT NULL DEFAULT false;
