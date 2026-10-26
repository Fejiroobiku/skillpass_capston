import { pool } from '../db.js';
import { logAudit, notify, notifyAdmins, SYSTEM } from './audit.js';
import { uid } from './ids.js';
import { paymentGateway, paymentReference } from './payments.js';

/**
 * Escrow rules for job agreements. These are the money rules written in the Terms of Service (section 6):
 *
 *   1. The employer pays the whole agreed amount (materials, if the artisan buys them, plus workmanship) before work starts.
 *   2. Materials money goes to the artisan straight away, so they can buy what the job needs.
 *   3. Workmanship money is held until the employer confirms the job is done.
 *   4. If the employer neither confirms nor disputes within the review period, it is released automatically.
 *   5. During a dispute nothing moves. An administrator decides what share goes to the artisan; the rest is refunded.
 *
 * Database changes happen inside the caller's transaction and only create "pending" payment rows. The calls to the
 * payment provider happen afterwards in processPayments(), so a slow or failed provider never leaves the database
 * half-changed. A failed payout stays in the table as "failed" and administrators are told.
 */

export const naira = (n) => `₦${Number(n).toLocaleString('en-NG')}`;

export const depositAmount = (a) => (a.materials_by === 'artisan' ? a.materials_amount : 0) + a.workmanship_amount;

export async function loadAgreement(db, id, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT a.*, j.title, e.name AS employer_name, ep.company, ar.name AS artisan_name, e.email AS employer_email
       FROM job_agreements a
       JOIN job_postings j ON j.id = a.job_id
       JOIN users e ON e.id = a.employer_id
       LEFT JOIN employer_profiles ep ON ep.user_id = a.employer_id
       JOIN users ar ON ar.id = a.artisan_id
      WHERE a.id = $1 ${lock ? 'FOR UPDATE OF a' : ''}`,
    [id],
  );
  return rows[0];
}

async function addPayment(db, agreementId, kind, amount, detail, { status = 'pending', reference = paymentReference(kind.split('_')[0]) } = {}) {
  const id = uid('pay');
  await db.query(
    `INSERT INTO payments (id, agreement_id, kind, amount, provider, reference, status, detail, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $7 = 'succeeded' THEN now() END)`,
    [id, agreementId, kind, amount, paymentGateway.name, reference, status, detail],
  );
  return id;
}

/** The employer's payment arrived. Marks the job as started and queues the materials payout. Safe to call twice. */
export async function recordDeposit(db, agreement, amount) {
  if (agreement.status !== 'accepted') return { pending: [], already: true };
  const expected = depositAmount(agreement);
  if (amount < expected) throw new Error(`Payment of ${naira(amount)} is less than the ${naira(expected)} agreed.`);

  await addPayment(db, agreement.id, 'deposit', expected,
    agreement.materials_by === 'artisan'
      ? `Materials ${naira(agreement.materials_amount)} + workmanship ${naira(agreement.workmanship_amount)} into escrow`
      : 'Workmanship into escrow',
    { status: 'succeeded', reference: agreement.payment_reference });
  await db.query(`UPDATE job_agreements SET status = 'in_progress', funded_at = now() WHERE id = $1`, [agreement.id]);

  const pending = [];
  if (agreement.materials_by === 'artisan' && agreement.materials_amount > 0) {
    pending.push(await addPayment(db, agreement.id, 'materials_payout', agreement.materials_amount, 'Materials money sent to the artisan'));
  }
  await logAudit(db, { actor: SYSTEM, action: 'agreement.funded', target: agreement.title, detail: `${naira(expected)} paid into escrow by ${agreement.company ?? agreement.employer_name}` });
  const held = naira(agreement.workmanship_amount);
  await notify(db, agreement.artisan_id, 'Payment held in escrow',
    agreement.materials_by === 'artisan'
      ? `${agreement.company ?? agreement.employer_name} paid. ${naira(agreement.materials_amount)} for materials is on its way to your account; ${held} for workmanship is held until the job is confirmed. You can start.`
      : `${agreement.company ?? agreement.employer_name} paid. ${held} for workmanship is held until the job is confirmed. You can start.`,
    { link: '/apprentice/work', channels: ['in_app', 'sms'] });
  await notify(db, agreement.employer_id, 'Payment received', `${naira(expected)} for “${agreement.title}” is held safely. The artisan has been told to start.`, { link: '/employer/hires' });
  return { pending };
}

/**
 * Release held workmanship money: `artisanPct` percent to the artisan, the rest back to the employer.
 * Used when the employer confirms (100), when the review period runs out (100), and when an administrator decides a dispute.
 */
export async function settleWorkmanship(db, agreement, artisanPct, why) {
  const toArtisan = Math.round((agreement.workmanship_amount * artisanPct) / 100);
  const toEmployer = agreement.workmanship_amount - toArtisan;
  const pending = [];
  if (toArtisan > 0) pending.push(await addPayment(db, agreement.id, 'workmanship_payout', toArtisan, why));
  if (toEmployer > 0) pending.push(await addPayment(db, agreement.id, 'refund', toEmployer, why));
  return { pending, toArtisan, toEmployer };
}

/** Employer confirmed, or the review period ran out: the job is complete and workmanship is released in full. */
export async function completeAgreement(db, agreement, actor, how) {
  const { pending } = await settleWorkmanship(db, agreement, 100, how);
  await db.query(`UPDATE job_agreements SET status = 'completed', completed_at = now() WHERE id = $1`, [agreement.id]);
  await logAudit(db, { actor, action: 'agreement.completed', target: agreement.title, detail: `${naira(agreement.workmanship_amount)} released to ${agreement.artisan_name} · ${how}` });
  await notify(db, agreement.artisan_id, 'Payment released', `${naira(agreement.workmanship_amount)} for “${agreement.title}” is on its way to your account. You can now rate the employer.`, { link: '/apprentice/work', channels: ['in_app', 'sms'] });
  await notify(db, agreement.employer_id, 'Job complete', `“${agreement.title}” is complete and ${agreement.artisan_name} has been paid. Please rate their work.`, { link: '/employer/hires' });
  return pending;
}

/** Jobs whose review period ran out without a confirmation or dispute are completed automatically. */
export async function releaseOverdue(db) {
  const { rows } = await db.query(
    `SELECT id FROM job_agreements WHERE status = 'submitted' AND review_deadline < now() ORDER BY review_deadline LIMIT 50`);
  const pending = [];
  for (const { id } of rows) {
    const a = await loadAgreement(db, id, { lock: true });
    if (a?.status !== 'submitted' || a.review_deadline > new Date()) continue;
    pending.push(...await completeAgreement(db, a, SYSTEM, 'released automatically: the employer did not respond within the review period'));
  }
  return pending;
}

/** Send queued payouts and refunds to the payment provider. Runs after the database change has committed. */
export async function processPayments(ids) {
  for (const id of ids) {
    const p = (await pool.query(
      `SELECT p.*, a.artisan_id, a.payment_reference, a.employer_id, j.title
         FROM payments p JOIN job_agreements a ON a.id = p.agreement_id JOIN job_postings j ON j.id = a.job_id
        WHERE p.id = $1 AND p.status = 'pending'`, [id])).rows[0];
    if (!p) continue;
    try {
      let result;
      if (p.kind === 'refund') {
        result = await paymentGateway.refund({ depositReference: p.payment_reference, amount: p.amount });
      } else {
        const acct = (await pool.query('SELECT * FROM payout_accounts WHERE user_id = $1', [p.artisan_id])).rows[0];
        if (!acct) throw new Error('The artisan has no payout account.');
        result = await paymentGateway.payout({
          account: { bankCode: acct.bank_code, accountNumber: acct.account_number, accountName: acct.account_name, recipientCode: acct.recipient_code },
          amount: p.amount, reference: p.reference, reason: `SkillPass: ${p.title}`.slice(0, 100),
        });
        if (result.recipientCode && result.recipientCode !== acct.recipient_code) {
          await pool.query('UPDATE payout_accounts SET recipient_code = $2 WHERE user_id = $1', [p.artisan_id, result.recipientCode]);
        }
      }
      if (result.status === 'succeeded') await pool.query(`UPDATE payments SET status = 'succeeded', completed_at = now() WHERE id = $1`, [id]);
    } catch (e) {
      await pool.query(`UPDATE payments SET status = 'failed', detail = detail || $2 WHERE id = $1`, [id, ` · failed: ${String(e.message).slice(0, 200)}`]);
      await notifyAdmins(pool, 'Payment failed', `A ${p.kind.replace('_', ' ')} of ${naira(p.amount)} for “${p.title}” failed: ${e.message}`, '/admin/review');
    }
  }
}
