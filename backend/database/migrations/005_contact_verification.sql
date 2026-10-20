-- Phone and email verification, and password reset. Safe to run more than once.

-- The phone number in one standard form (+234XXXXXXXXXX), so 0803… and +234803… are the same number.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_e164 text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
-- Sessions signed in before a password reset stop working.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

-- Fill phone_e164 for existing accounts. If two accounts share a number, only the earliest keeps it;
-- the other must add and confirm its own number.
WITH digits AS (
  SELECT id, created_at, regexp_replace(coalesce(phone, ''), '\D', '', 'g') AS d FROM users WHERE phone_e164 IS NULL
), normal AS (
  SELECT id, created_at,
         CASE WHEN d ~ '^0[789][01][0-9]{8}$' THEN '+234' || substr(d, 2)
              WHEN d ~ '^234[789][01][0-9]{8}$' THEN '+' || d END AS e164
    FROM digits
), firsts AS (
  SELECT id, e164, row_number() OVER (PARTITION BY e164 ORDER BY created_at, id) AS n FROM normal WHERE e164 IS NOT NULL
)
UPDATE users u SET phone_e164 = f.e164
  FROM firsts f
 WHERE u.id = f.id AND f.n = 1
   AND NOT EXISTS (SELECT 1 FROM users x WHERE x.phone_e164 = f.e164);

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_e164_key ON users (phone_e164) WHERE phone_e164 IS NOT NULL;

-- The demo accounts come already verified so demonstrations are not interrupted.
UPDATE users SET phone_verified_at = coalesce(phone_verified_at, now()), email_verified_at = coalesce(email_verified_at, now())
 WHERE email LIKE '%@skillpass.ng';

-- One-time codes (phone) and links (email, password reset). Only a SHA-256 of each secret is stored.
CREATE TABLE IF NOT EXISTS contact_verifications (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('phone', 'email', 'password_reset')),
  target     text NOT NULL,          -- the number or address the code was sent to
  secret_hash text NOT NULL,
  attempts   integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_verifications_user_idx ON contact_verifications (user_id, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_verifications_secret_idx ON contact_verifications (secret_hash);
