-- Only the browser that recorded a verification may rate it, and only once.
-- The browser keeps a random token; the database keeps its SHA-256. Safe to run more than once.
ALTER TABLE verification_events ADD COLUMN IF NOT EXISTS rating_token_hash text;
