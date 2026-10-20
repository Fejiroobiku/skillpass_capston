-- Tamper-evident audit log: each entry is sealed into a hash chain (see src/lib/auditChain.js).
-- The server seals existing entries the next time it runs db:migrate or writes to the log. Safe to run more than once.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS chain_pos bigint;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS prev_hash text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS hash text;
CREATE UNIQUE INDEX IF NOT EXISTS audit_log_chain_pos_key ON audit_log (chain_pos);

-- Still append-only. The one change allowed is sealing an entry once: filling in its chain fields
-- while every recorded field stays exactly the same.
CREATE OR REPLACE FUNCTION audit_log_block_changes() RETURNS trigger
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
