-- SkillPass database schema (PostgreSQL 14+)
--
-- Run this against an EMPTY database. It does not drop anything.
-- To wipe and rebuild a development database use: npm run db:reset
--
-- Integrity rules that live in the database itself (so no bug in the API can break them):
--   * evidence.sha256 is UNIQUE: the same file can never back two credentials
--   * one live credential per apprentice per skill (partial unique index)
--   * audit_log is append-only (triggers block UPDATE, DELETE and TRUNCATE) and hash-chained
--   * status columns are CHECK-constrained to the values the app understands

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

CREATE TABLE trades (
  id   text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE associations (
  id       text PRIMARY KEY,
  name     text NOT NULL,
  trade_id text NOT NULL REFERENCES trades (id)
);

-- Independent assessors who re-check sampled credentials (NSQ assessors in the pilot)
CREATE TABLE assessors (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  organisation text NOT NULL,
  nsq_id       text
);

CREATE TABLE assessor_trades (
  assessor_id text NOT NULL REFERENCES assessors (id) ON DELETE CASCADE,
  trade_id    text NOT NULL REFERENCES trades (id),
  PRIMARY KEY (assessor_id, trade_id)
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id            text PRIMARY KEY,
  email         text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('trainer', 'apprentice', 'employer', 'admin')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'withdrawn')),
  name          text NOT NULL,
  phone         text,
  phone_e164    text,              -- the same number as +234XXXXXXXXXX; one account per number
  phone_verified_at timestamptz,
  email_verified_at timestamptz,
  password_changed_at timestamptz, -- sessions issued before this stop working
  dob           date NOT NULL,
  location_name text,
  lat           double precision,
  lng           double precision,
  consent_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
CREATE INDEX users_role_idx ON users (role);
CREATE UNIQUE INDEX users_phone_e164_key ON users (phone_e164) WHERE phone_e164 IS NOT NULL;

-- One-time codes (phone) and links (email, password reset). Only a SHA-256 of each secret is stored.
CREATE TABLE contact_verifications (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('phone', 'email', 'password_reset')),
  target      text NOT NULL,
  secret_hash text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contact_verifications_user_idx ON contact_verifications (user_id, purpose, created_at DESC);
CREATE INDEX contact_verifications_secret_idx ON contact_verifications (secret_hash);

CREATE TABLE trainer_profiles (
  user_id             text PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  trade_id            text NOT NULL REFERENCES trades (id),
  workshop            text NOT NULL,
  association_id      text REFERENCES associations (id),
  membership_no       text NOT NULL DEFAULT '',
  membership_verified boolean NOT NULL DEFAULT false,
  approved            boolean NOT NULL DEFAULT false,
  joined_at           timestamptz NOT NULL DEFAULT now(),
  misconduct_at       timestamptz,
  misconduct_reason   text
);

CREATE TABLE apprentice_profiles (
  user_id    text PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  trade_id   text NOT NULL REFERENCES trades (id),
  trainer_id text REFERENCES users (id),
  started_at timestamptz NOT NULL DEFAULT now(),
  -- The passport is shared at /passport/<token>; the apprentice can switch it off or replace the token
  passport_token  text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  passport_public boolean NOT NULL DEFAULT true
);
CREATE INDEX apprentice_profiles_trainer_idx ON apprentice_profiles (trainer_id);

CREATE TABLE employer_profiles (
  user_id  text PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  company  text NOT NULL,
  trade_id text NOT NULL REFERENCES trades (id),
  approved boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- Skills and rubrics
-- ---------------------------------------------------------------------------

CREATE TABLE skills (
  id              text PRIMARY KEY,
  trade_id        text NOT NULL REFERENCES trades (id),
  name            text NOT NULL,
  level           text NOT NULL CHECK (level IN ('Foundation', 'Intermediate', 'Advanced')),
  requires_cosign boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'proposed', 'rejected')),
  proposed_by     text REFERENCES users (id)
);
CREATE INDEX skills_trade_idx ON skills (trade_id, status);

-- Observable criteria a trainer must tick before a credential can be issued.
-- A skill with no rows here falls back to the default rubric in the API.
CREATE TABLE skill_criteria (
  skill_id text NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  position integer NOT NULL,
  text     text NOT NULL,
  PRIMARY KEY (skill_id, position)
);

-- ---------------------------------------------------------------------------
-- Credentials and evidence
-- ---------------------------------------------------------------------------

CREATE TABLE credentials (
  id                      text PRIMARY KEY CHECK (id ~ '^SP-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  apprentice_id           text NOT NULL REFERENCES users (id),
  trainer_id              text NOT NULL REFERENCES users (id),
  skill_id                text NOT NULL REFERENCES skills (id),
  issued_at               timestamptz NOT NULL DEFAULT now(),
  status                  text NOT NULL CHECK (status IN (
                            'pending_apprentice', 'pending_cosign', 'held_review',
                            'valid', 'flagged', 'under_review', 'revoked')),
  criteria_met            text[] NOT NULL DEFAULT '{}',
  note                    text NOT NULL DEFAULT '',
  needs_cosign            boolean NOT NULL DEFAULT false,
  cosign_reason           text CHECK (cosign_reason IN ('advanced', 'probation')),
  cosign_requested_from   text REFERENCES users (id),
  cosigner_id             text REFERENCES users (id),
  apprentice_confirmed_at timestamptz,
  held_for_review         boolean NOT NULL DEFAULT false,
  held_cleared            boolean NOT NULL DEFAULT false,
  signature               text NOT NULL,
  revoke_reason           text
);
-- An apprentice can hold each skill once. Revoked credentials do not count, so a skill can be re-assessed.
CREATE UNIQUE INDEX credentials_one_live_per_skill ON credentials (apprentice_id, skill_id) WHERE status <> 'revoked';
CREATE INDEX credentials_trainer_idx ON credentials (trainer_id, issued_at);
CREATE INDEX credentials_apprentice_idx ON credentials (apprentice_id);
CREATE INDEX credentials_status_idx ON credentials (status);

-- Evidence is uploaded first (credential_id NULL) and attached when the credential is issued.
-- The hash is computed by the server from the uploaded bytes, never trusted from the client.
CREATE TABLE evidence (
  id             text PRIMARY KEY,
  credential_id  text REFERENCES credentials (id) ON DELETE CASCADE,
  uploaded_by    text NOT NULL REFERENCES users (id),
  kind           text NOT NULL CHECK (kind IN ('photo', 'video')),
  url            text NOT NULL,
  poster_url     text,
  caption        text NOT NULL DEFAULT '',
  captured_at    timestamptz NOT NULL DEFAULT now(),
  location_label text NOT NULL DEFAULT '',
  lat            double precision,
  lng            double precision,
  -- 'gps' when the phone supplied the position, 'declared' when the workshop address was used instead
  location_source text NOT NULL DEFAULT 'declared' CHECK (location_source IN ('gps', 'declared')),
  sha256         text NOT NULL UNIQUE CHECK (length(sha256) = 64),
  mime_type      text,
  size_bytes     bigint,
  challenge_code text,
  duration_sec   integer,
  source         text NOT NULL DEFAULT 'camera' CHECK (source IN ('camera', 'demo')),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evidence_credential_idx ON evidence (credential_id);
CREATE INDEX evidence_uploader_idx ON evidence (uploaded_by) WHERE credential_id IS NULL;

-- Server-issued liveness codes. The trainer must show the code in the video.
CREATE TABLE evidence_challenges (
  id         text PRIMARY KEY,
  trainer_id text NOT NULL REFERENCES users (id),
  code       text NOT NULL,
  issued_at  timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX evidence_challenges_lookup_idx ON evidence_challenges (trainer_id, code);

-- ---------------------------------------------------------------------------
-- Integrity: flags, assessments, audits, confidential reports
-- ---------------------------------------------------------------------------

CREATE TABLE flags (
  id            text PRIMARY KEY,
  credential_id text NOT NULL REFERENCES credentials (id),
  raised_by     text NOT NULL REFERENCES users (id),
  reason        text NOT NULL,
  raised_at     timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'upheld', 'dismissed'))
);
CREATE INDEX flags_credential_idx ON flags (credential_id);
CREATE INDEX flags_open_idx ON flags (status) WHERE status = 'open';

-- "Not yet competent" assessments. They feed the trainer pass-rate signal.
CREATE TABLE attempts (
  id            text PRIMARY KEY,
  trainer_id    text NOT NULL REFERENCES users (id),
  apprentice_id text NOT NULL REFERENCES users (id),
  skill_id      text NOT NULL REFERENCES skills (id),
  criteria_met  text[] NOT NULL DEFAULT '{}',
  at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attempts_trainer_idx ON attempts (trainer_id);

CREATE TABLE audit_samples (
  id            text PRIMARY KEY,
  credential_id text NOT NULL REFERENCES credentials (id),
  reviewer_id   text REFERENCES users (id),
  assessor_id   text REFERENCES assessors (id),
  reason        text CHECK (reason IN ('random', 'risk', 'probation', 'misconduct')),
  selected_at   timestamptz NOT NULL DEFAULT now(),
  result        text NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'agree', 'disagree'))
);
CREATE INDEX audit_samples_credential_idx ON audit_samples (credential_id);

-- Confidential apprentice reports about a trainer. Only administrators may read these.
CREATE TABLE concern_reports (
  id            text PRIMARY KEY,
  apprentice_id text NOT NULL REFERENCES users (id),
  trainer_id    text NOT NULL REFERENCES users (id),
  category      text NOT NULL CHECK (category IN ('payment', 'pressure', 'false_record', 'other')),
  details       text NOT NULL,
  at            timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'closed'))
);
CREATE INDEX concern_reports_trainer_idx ON concern_reports (trainer_id);

-- ---------------------------------------------------------------------------
-- Jobs, referrals, employer feedback
-- ---------------------------------------------------------------------------

CREATE TABLE job_postings (
  id            text PRIMARY KEY,
  employer_id   text NOT NULL REFERENCES users (id),
  title         text NOT NULL,
  trade_id      text NOT NULL REFERENCES trades (id),
  location_name text NOT NULL,
  lat           double precision NOT NULL,
  lng           double precision NOT NULL,
  pay           text NOT NULL DEFAULT '',
  posted_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_skills (
  job_id   text NOT NULL REFERENCES job_postings (id) ON DELETE CASCADE,
  skill_id text NOT NULL REFERENCES skills (id),
  PRIMARY KEY (job_id, skill_id)
);

CREATE TABLE referrals (
  id            text PRIMARY KEY,
  job_id        text NOT NULL REFERENCES job_postings (id),
  apprentice_id text NOT NULL REFERENCES users (id),
  status        text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'accepted', 'declined', 'contacted')),
  sent_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, apprentice_id)
);

CREATE TABLE feedback (
  id            text PRIMARY KEY,
  apprentice_id text NOT NULL REFERENCES users (id),
  employer_id   text NOT NULL REFERENCES users (id),
  referral_id   text UNIQUE REFERENCES referrals (id),
  rating        smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feedback_credentials (
  feedback_id   text NOT NULL REFERENCES feedback (id) ON DELETE CASCADE,
  credential_id text NOT NULL REFERENCES credentials (id),
  PRIMARY KEY (feedback_id, credential_id)
);

-- ---------------------------------------------------------------------------
-- Notifications, pilot metrics, settings
-- ---------------------------------------------------------------------------

CREATE TABLE notifications (
  id           text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  channel      text NOT NULL CHECK (channel IN ('in_app', 'sms', 'email')),
  title        text NOT NULL,
  body         text NOT NULL,
  at           timestamptz NOT NULL DEFAULT now(),
  read         boolean NOT NULL DEFAULT false,
  link         text,
  delivered_at timestamptz   -- set by the SMS / email gateway once one is connected
);
CREATE INDEX notifications_user_idx ON notifications (user_id, at DESC);

CREATE TABLE sus_responses (
  id      text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role    text NOT NULL,
  score   numeric(5, 2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE verification_events (
  id            text PRIMARY KEY,
  credential_id text NOT NULL REFERENCES credentials (id),
  seconds       integer NOT NULL CHECK (seconds >= 0),
  trust_rating  smallint CHECK (trust_rating BETWEEN 1 AND 5),
  -- SHA-256 of a random token held by the browser that recorded the check; only it can add the rating
  rating_token_hash text,
  at            timestamptz NOT NULL DEFAULT now()
);

-- Exactly one row. The administrator edits the integrity rules from the settings page.
CREATE TABLE settings (
  id                smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  daily_limit       integer NOT NULL DEFAULT 5 CHECK (daily_limit > 0),
  audit_rate_pct    integer NOT NULL DEFAULT 10 CHECK (audit_rate_pct BETWEEN 0 AND 100),
  probation_count   integer NOT NULL DEFAULT 5 CHECK (probation_count >= 0),
  cluster_threshold integer NOT NULL DEFAULT 4 CHECK (cluster_threshold > 0),
  fast_minutes      integer NOT NULL DEFAULT 15 CHECK (fast_minutes > 0),
  sms_enabled       boolean NOT NULL DEFAULT true,
  email_enabled     boolean NOT NULL DEFAULT true
);


-- ---------------------------------------------------------------------------
-- Terms of Service, job agreements, escrow, job photos, disputes, employer ratings
-- (identical to migrations/006_job_agreements.sql)
-- ---------------------------------------------------------------------------


-- Which version of the Terms of Service each person accepted, and when.
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

-- Where an artisan's payments are sent. recipient_code is Paystack's id for this account once created.
CREATE TABLE IF NOT EXISTS payout_accounts (
  user_id        text PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  bank_code      text NOT NULL,
  bank_name      text NOT NULL,
  account_number text NOT NULL CHECK (account_number ~ '^[0-9]{10}$'),
  account_name   text NOT NULL,
  recipient_code text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- A job states who buys the materials and the employer's budget for materials and for workmanship (labour).
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS materials_by text NOT NULL DEFAULT 'employer';
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS materials_budget integer;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS workmanship_budget integer;
DO $$ BEGIN
  ALTER TABLE job_postings ADD CONSTRAINT job_postings_materials_by_check CHECK (materials_by IN ('employer', 'artisan'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE job_postings ADD CONSTRAINT job_postings_amounts_check CHECK (coalesce(materials_budget, 0) >= 0 AND coalesce(workmanship_budget, 0) >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The artisan's quote, sent when they say they are interested.
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS quote_workmanship integer;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS quote_materials integer;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS available_from date;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS quote_note text NOT NULL DEFAULT '';
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS quoted_at timestamptz;

-- The deal both sides accept. Amounts are whole naira.
--   proposed     employer offered these terms, waiting for the artisan
--   accepted     both accepted, waiting for the employer to pay into escrow
--   in_progress  paid: materials money sent to the artisan (if they buy materials), workmanship held
--   submitted    artisan marked the job done with before and after photos; employer has review_deadline to respond
--   completed    workmanship released to the artisan
--   disputed     someone raised a dispute; held money is frozen until an administrator decides
--   resolved     administrator decided how the held money is shared
--   cancelled    called off before any money was paid
CREATE TABLE IF NOT EXISTS job_agreements (
  id                   text PRIMARY KEY,
  referral_id          text NOT NULL UNIQUE REFERENCES referrals (id),
  job_id               text NOT NULL REFERENCES job_postings (id),
  employer_id          text NOT NULL REFERENCES users (id),
  artisan_id           text NOT NULL REFERENCES users (id),
  materials_by         text NOT NULL CHECK (materials_by IN ('employer', 'artisan')),
  materials_amount     integer NOT NULL DEFAULT 0 CHECK (materials_amount >= 0),
  workmanship_amount   integer NOT NULL CHECK (workmanship_amount > 0),
  start_date           date,
  scope                text NOT NULL DEFAULT '',
  terms_version        text NOT NULL,
  status               text NOT NULL DEFAULT 'proposed'
                       CHECK (status IN ('proposed', 'accepted', 'in_progress', 'submitted', 'completed', 'disputed', 'resolved', 'cancelled')),
  employer_accepted_at timestamptz NOT NULL DEFAULT now(),
  artisan_accepted_at  timestamptz,
  payment_reference    text UNIQUE,
  funded_at            timestamptz,
  submitted_at         timestamptz,
  review_deadline      timestamptz,
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  cancelled_by         text REFERENCES users (id),
  cancel_reason        text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (materials_by = 'artisan' OR materials_amount = 0)
);
CREATE INDEX IF NOT EXISTS job_agreements_employer_idx ON job_agreements (employer_id);
CREATE INDEX IF NOT EXISTS job_agreements_artisan_idx ON job_agreements (artisan_id);

-- Every movement of money: the employer's deposit into escrow, and each payout or refund from it.
CREATE TABLE IF NOT EXISTS payments (
  id           text PRIMARY KEY,
  agreement_id text NOT NULL REFERENCES job_agreements (id),
  kind         text NOT NULL CHECK (kind IN ('deposit', 'materials_payout', 'workmanship_payout', 'refund')),
  amount       integer NOT NULL CHECK (amount > 0),
  provider     text NOT NULL CHECK (provider IN ('simulated', 'paystack')),
  reference    text NOT NULL UNIQUE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  detail       text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS payments_agreement_idx ON payments (agreement_id);

-- Live-camera photos of the site before work starts and of the finished work.
CREATE TABLE IF NOT EXISTS job_photos (
  id              text PRIMARY KEY,
  agreement_id    text NOT NULL REFERENCES job_agreements (id) ON DELETE CASCADE,
  uploaded_by     text NOT NULL REFERENCES users (id),
  stage           text NOT NULL CHECK (stage IN ('before', 'after')),
  url             text NOT NULL,
  sha256          text NOT NULL UNIQUE CHECK (length(sha256) = 64),
  location_label  text NOT NULL DEFAULT '',
  lat             double precision,
  lng             double precision,
  location_source text NOT NULL DEFAULT 'declared' CHECK (location_source IN ('gps', 'declared')),
  captured_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_photos_agreement_idx ON job_photos (agreement_id);

-- A disagreement about a job. Held money stays frozen until an administrator decides.
CREATE TABLE IF NOT EXISTS job_disputes (
  id                text PRIMARY KEY,
  agreement_id      text NOT NULL REFERENCES job_agreements (id),
  raised_by         text NOT NULL REFERENCES users (id),
  reason            text NOT NULL CHECK (reason IN ('poor_work', 'not_finished', 'no_show', 'materials', 'changed_scope', 'not_confirming', 'other')),
  details           text NOT NULL,
  response          text,
  responded_at      timestamptz,
  raised_at         timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  artisan_share_pct integer CHECK (artisan_share_pct BETWEEN 0 AND 100),
  decision_note     text,
  resolved_by       text REFERENCES users (id),
  resolved_at       timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS job_disputes_one_open ON job_disputes (agreement_id) WHERE status = 'open';

-- Artisans rate employers too, so an employer who will not pay or treats workers badly builds a record.
CREATE TABLE IF NOT EXISTS employer_ratings (
  id           text PRIMARY KEY,
  agreement_id text NOT NULL UNIQUE REFERENCES job_agreements (id),
  artisan_id   text NOT NULL REFERENCES users (id),
  employer_id  text NOT NULL REFERENCES users (id),
  rating       smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employer_ratings_employer_idx ON employer_ratings (employer_id);

-- How many days the employer has to confirm the work or raise a dispute before payment is released automatically.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS review_days integer NOT NULL DEFAULT 3;
DO $$ BEGIN
  ALTER TABLE settings ADD CONSTRAINT settings_review_days_check CHECK (review_days BETWEEN 1 AND 14);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Audit log: append-only
-- ---------------------------------------------------------------------------

CREATE TABLE audit_log (
  id         text PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  actor_id   text,                -- NULL for system actions
  actor_name text NOT NULL,       -- name as it was when the action happened
  action     text NOT NULL,
  target     text NOT NULL,
  detail     text NOT NULL DEFAULT '',
  -- Hash chain (src/lib/auditChain.js): position, the previous entry's hash, and this entry's HMAC
  chain_pos  bigint UNIQUE,
  prev_hash  text,
  hash       text
);
CREATE INDEX audit_log_target_idx ON audit_log (target, at);
CREATE INDEX audit_log_at_idx ON audit_log (at DESC);

-- The one change allowed is sealing an entry into the hash chain once, with every recorded field unchanged.
CREATE FUNCTION audit_log_block_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.hash IS NULL AND NEW.hash IS NOT NULL
       AND NEW.id = OLD.id AND NEW.at = OLD.at AND NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id
       AND NEW.actor_name = OLD.actor_name AND NEW.action = OLD.action
       AND NEW.target = OLD.target AND NEW.detail = OLD.detail THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_block_changes();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_block_changes();
