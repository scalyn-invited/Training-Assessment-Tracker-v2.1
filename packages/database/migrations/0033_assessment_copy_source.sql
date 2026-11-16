-- Direct provenance for new copies only; legacy family membership is not a parent link.
ALTER TABLE assessment_definitions
 ADD COLUMN source_definition_id uuid,
 ADD COLUMN source_revision integer,
 ADD CONSTRAINT definition_revision_identity UNIQUE(organisation_id,environment,id,revision),
 ADD CONSTRAINT definition_copy_source FOREIGN KEY(organisation_id,environment,source_definition_id,source_revision)
 REFERENCES assessment_definitions(organisation_id,environment,id,revision),
 ADD CONSTRAINT definition_copy_pair CHECK ((source_definition_id IS NULL) = (source_revision IS NULL)),
 ADD CONSTRAINT definition_copy_not_self CHECK (source_definition_id IS NULL OR source_definition_id <> id);
CREATE FUNCTION protect_assessment_copy_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.source_definition_id IS DISTINCT FROM OLD.source_definition_id OR NEW.source_revision IS DISTINCT FROM OLD.source_revision THEN
  RAISE EXCEPTION 'Assessment copy provenance is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_assessment_copy_source BEFORE UPDATE ON assessment_definitions FOR EACH ROW EXECUTE FUNCTION protect_assessment_copy_source();
