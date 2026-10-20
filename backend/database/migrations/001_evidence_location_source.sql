-- Record whether an evidence file's location came from the phone's GPS or was declared
-- (the workshop address used when GPS is unavailable or refused). Safe to run more than once.
ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS location_source text NOT NULL DEFAULT 'declared'
  CHECK (location_source IN ('gps', 'declared'));
