ALTER TABLE local_account_links ADD COLUMN bootstrap boolean NOT NULL DEFAULT false;
ALTER TABLE local_account_links DROP CONSTRAINT local_account_links_check;
ALTER TABLE local_account_links ADD CONSTRAINT account_link_bootstrap_shape CHECK (
 (bootstrap AND purpose='setup' AND organisation_id IS NULL AND issuer_id=user_id)
 OR (NOT bootstrap AND (purpose='reset' OR organisation_id IS NOT NULL))
);
