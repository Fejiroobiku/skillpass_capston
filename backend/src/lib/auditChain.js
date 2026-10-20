import { createHmac } from 'node:crypto';
import { config } from '../config.js';

/**
 * Tamper-evident audit log.
 *
 * The database already refuses UPDATE, DELETE and TRUNCATE on audit_log, but whoever owns the database could switch
 * those triggers off. So every entry is also "sealed" into a chain: it stores the previous entry's hash and its own
 * HMAC-SHA256 over its contents plus that previous hash. Changing, removing or reordering any entry breaks every
 * hash after it, and recomputing the chain needs the server's secret key, which is not stored in the database.
 *
 * Entries are written unsealed by logAudit (inside the caller's transaction) and sealed straight afterwards in a short
 * transaction of their own, under an advisory lock, so sealing never holds up or deadlocks normal requests.
 *
 * Limits: deleting the newest entries cannot be detected from the chain alone, so the admin page shows the latest hash
 * and count, which can be written down or published. Changing SIGNING_KEY makes older seals fail verification.
 */
const LOCK_ID = 732_101;
const chainKey = () => createHmac('sha256', config.signingKey).update('skillpass-audit-chain-v1').digest();

export function entryHash(prevHash, row) {
  const fields = [prevHash ?? '', Number(row.chain_pos), row.id, new Date(row.at).toISOString(), row.actor_id ?? null, row.actor_name, row.action, row.target, row.detail];
  return createHmac('sha256', chainKey()).update(JSON.stringify(fields)).digest('hex');
}

/** Seal every unsealed entry, oldest first. Runs in its own transaction on a dedicated client. */
export async function sealPending(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
    const pending = (await client.query('SELECT * FROM audit_log WHERE hash IS NULL ORDER BY at, id')).rows;
    if (pending.length) {
      const head = (await client.query('SELECT chain_pos, hash FROM audit_log WHERE hash IS NOT NULL ORDER BY chain_pos DESC LIMIT 1')).rows[0];
      let pos = head ? Number(head.chain_pos) : 0;
      let prev = head?.hash ?? '';
      for (const row of pending) {
        pos += 1;
        const hash = entryHash(prev, { ...row, chain_pos: pos });
        await client.query('UPDATE audit_log SET chain_pos = $2, prev_hash = $3, hash = $4 WHERE id = $1', [row.id, pos, prev, hash]);
        prev = hash;
      }
    }
    await client.query('COMMIT');
    return pending.length;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

let timer = null;
/** Seal soon, after the transaction that wrote the entry has had a chance to commit. */
export function scheduleSeal(pool) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    sealPending(pool).catch((err) => console.error('Could not seal audit log entries:', err.message));
  }, 25);
  timer.unref?.();
}

/**
 * Walk the whole chain and report the first problem. Seals anything pending first, so a just-written entry
 * never shows up as a false alarm.
 */
export async function verifyChain(pool) {
  await sealPending(pool);
  const { rows } = await pool.query('SELECT * FROM audit_log ORDER BY chain_pos NULLS LAST, at, id');
  let prev = '';
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const problem = (reason) => ({ ok: false, checked: i, total: rows.length, problem: { id: row.id, position: i + 1, at: new Date(row.at).toISOString(), action: row.action, reason } });
    if (row.hash == null) return problem('This entry was added without being sealed into the chain.');
    if (Number(row.chain_pos) !== i + 1) return problem('An entry before this one is missing.');
    if ((row.prev_hash ?? '') !== prev) return problem('The link to the previous entry is broken.');
    if (entryHash(prev, row) !== row.hash) return problem('This entry was changed after it was written.');
    prev = row.hash;
  }
  return { ok: true, checked: rows.length, total: rows.length, head: prev || null };
}
