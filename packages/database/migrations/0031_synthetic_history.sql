CREATE FUNCTION preserve_training_synthetic_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_synthetic IS DISTINCT FROM OLD.is_synthetic AND EXISTS (
    SELECT 1 FROM enrolments WHERE member_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Existing training history cannot change synthetic status'
      USING ERRCODE = '23514', CONSTRAINT = 'training_synthetic_status_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER users_training_synthetic_status
BEFORE UPDATE OF is_synthetic ON users
FOR EACH ROW EXECUTE FUNCTION preserve_training_synthetic_status();
