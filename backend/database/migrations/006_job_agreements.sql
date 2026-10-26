-- Terms of Service, job prices (materials vs workmanship), quotes, job agreements, escrow payments,
-- before/after job photos, disputes and artisans rating employers. Safe to run more than once.

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
