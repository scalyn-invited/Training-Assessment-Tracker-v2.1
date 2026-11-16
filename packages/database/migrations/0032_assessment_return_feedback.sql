-- Separate explicitly member-safe feedback; never backfill from private rationale.
ALTER TABLE assessment_reviews ADD COLUMN return_feedback text;
ALTER TABLE assessment_reviews ADD CONSTRAINT return_feedback_decision_only
 CHECK (return_feedback IS NULL OR (kind='decision' AND status='rejected'));
-- Existing immutable-review trigger and tenant RLS continue to apply.
