-- Passports are shared through an unguessable link instead of the apprentice's account ID,
-- and the apprentice can switch the public link off or replace it. Safe to run more than once.
-- gen_random_uuid() is built into PostgreSQL 13 and later; each existing row gets its own value.
ALTER TABLE apprentice_profiles
  ADD COLUMN IF NOT EXISTS passport_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE apprentice_profiles
  ADD COLUMN IF NOT EXISTS passport_public boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS apprentice_profiles_passport_token_key ON apprentice_profiles (passport_token);
