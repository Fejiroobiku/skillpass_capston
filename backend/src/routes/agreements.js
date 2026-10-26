import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, tx } from '../db.js';
import { HttpError } from '../lib/errors.js';
import { getSettings, logAudit, notify, notifyAdmins } from '../lib/audit.js';
import { uid } from '../lib/ids.js';
import { completeAgreement, depositAmount, loadAgreement, naira, processPayments, recordDeposit, settleWorkmanship } from '../lib/escrow.js';
import { paymentGateway, paymentReference, PaymentError } from '../lib/payments.js';
import { TERMS_VERSION } from '../lib/terms.js';
import { removeFile, removeStored, sha256File, sniffFile, storeFile, tempDir } from '../lib/storage.js';
import { authenticate, requireRole } from '../middleware/auth.js';

/**
 * Job agreements between an employer and an artisan, and the escrow payments behind them.
 *
 *   employer offers terms → artisan accepts → employer pays into escrow → artisan works, with before/after photos
 *   → artisan marks it done → employer confirms (money released) or disputes (an administrator decides)
 *
 * Mounted at /api. The money rules themselves are in lib/escrow.js.
 */
const router = Router();

const money = (label) => z.number({ invalid_type_error: `Enter the ${label} in naira.` }).int(`Enter the ${label} in whole naira.`).min(0).max(100_000_000);
const acceptTerms = z.literal(true, { errorMap: () => ({ message: 'You must read and accept the Terms of Service first.' }) });

const isParty = (a, user) => a && (a.employer_id === user.id || a.artisan_id === user.id);

async function mine(db, id, user, { lock = true } = {}) {
  const a = await loadAgreement(db, id, { lock });
  if (!isParty(a, user)) throw new HttpError(404, 'Job agreement not found.');
  return a;
}

// ---- terms and payout accounts -----------------------------------------------------------------------------------

router.get('/terms', (req, res) => {
  res.json({ version: TERMS_VERSION });
});

router.post('/terms/accept', authenticate, async (req, res) => {
  z.object({ version: z.literal(TERMS_VERSION, { errorMap: () => ({ message: 'Please reload the page to see the latest Terms of Service.' }) }) }).parse(req.body);
  await tx(async (db) => {
    await db.query('UPDATE users SET terms_version = $2, terms_accepted_at = now() WHERE id = $1', [req.user.id, TERMS_VERSION]);
    await logAudit(db, { actor: req.user, action: 'terms.accepted', target: req.user.email, detail: `Terms of Service ${TERMS_VERSION}` });
  });
  res.json({ ok: true, version: TERMS_VERSION });
});

router.get('/payments/banks', authenticate, async (req, res) => {
  res.json({ banks: await paymentGateway.banks().catch(() => []) });
});

router.get('/payments/info', authenticate, (req, res) => {
  res.json({ provider: paymentGateway.name, testMode: paymentGateway.isTestMode, simulated: paymentGateway.isSimulated });
});

const payoutSchema = z.object({
  bankCode: z.string().trim().min(3, 'Choose your bank.').max(10),
  bankName: z.string().trim().min(2).max(80),
  accountNumber: z.string().trim().regex(/^\d{10}$/, 'Enter your 10-digit account number (NUBAN).'),
  accountName: z.string().trim().min(2, 'Enter the name on the account.').max(100),
});

router.put('/payout-account', authenticate, requireRole('apprentice'), async (req, res) => {
  const input = payoutSchema.parse(req.body);
  await tx(async (db) => {
    await db.query(
      `INSERT INTO payout_accounts (user_id, bank_code, bank_name, account_number, account_name, recipient_code, updated_at)
       VALUES ($1, $2, $3, $4, $5, NULL, now())
       ON CONFLICT (user_id) DO UPDATE SET bank_code = $2, bank_name = $3, account_number = $4, account_name = $5, recipient_code = NULL, updated_at = now()`,
      [req.user.id, input.bankCode, input.bankName, input.accountNumber, input.accountName]);
    await logAudit(db, { actor: req.user, action: 'payout.account_updated', target: req.user.name, detail: `${input.bankName} ····${input.accountNumber.slice(-4)}` });
  });
  res.json({ payoutAccount: { bankCode: input.bankCode, bankName: input.bankName, accountLast4: input.accountNumber.slice(-4), accountName: input.accountName } });
});

// ---- offering and accepting terms ----------------------------------------------------------------------------------

const offerSchema = z.object({
  referralId: z.string().min(1),
  materialsAmount: money('materials amount').default(0),
  workmanshipAmount: money('workmanship fee').refine((n) => n > 0, 'Enter the workmanship fee.'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a start date.'),
  scope: z.string().trim().min(10, 'Describe the work in a sentence or two, so both sides agree what is included.').max(1000),
  acceptTerms,
});

/** The employer offers terms to an artisan who sent a quote. */
router.post('/agreements', authenticate, requireRole('employer'), async (req, res) => {
  const input = offerSchema.parse(req.body);
  const id = await tx(async (db) => {
    const employer = (await db.query('SELECT approved, company FROM employer_profiles WHERE user_id = $1', [req.user.id])).rows[0];
    if (!employer?.approved) throw new HttpError(403, 'Only verified employers can hire through SkillPass.');
    const r = (await db.query(
      `SELECT r.*, j.employer_id, j.title, j.materials_by FROM referrals r JOIN job_postings j ON j.id = r.job_id WHERE r.id = $1 FOR UPDATE OF r`,
      [input.referralId])).rows[0];
    if (!r || r.employer_id !== req.user.id) throw new HttpError(404, 'Referral not found.');
    if (!['accepted', 'contacted'].includes(r.status)) throw new HttpError(409, 'You can hire someone once they have said they are interested.');
    const existing = (await db.query('SELECT status FROM job_agreements WHERE referral_id = $1', [r.id])).rows[0];
    if (existing && existing.status !== 'cancelled') throw new HttpError(409, 'You already made an offer to this artisan for this job.');
    if (existing) await db.query('DELETE FROM job_agreements WHERE referral_id = $1 AND status = $2', [r.id, 'cancelled']);
    if (r.materials_by === 'employer' && input.materialsAmount > 0) throw new HttpError(400, 'You said you will buy the materials, so the materials amount must be 0.');
    if (r.materials_by === 'artisan' && input.materialsAmount === 0) throw new HttpError(400, 'The artisan is buying the materials. Enter the materials amount.');
    if (new Date(`${input.startDate}T23:59:59Z`) < new Date()) throw new HttpError(400, 'The start date cannot be in the past.');

    const id = uid('ag');
    await db.query(
      `INSERT INTO job_agreements (id, referral_id, job_id, employer_id, artisan_id, materials_by, materials_amount, workmanship_amount, start_date, scope, terms_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, r.id, r.job_id, req.user.id, r.apprentice_id, r.materials_by, input.materialsAmount, input.workmanshipAmount, input.startDate, input.scope, TERMS_VERSION]);
    const total = input.materialsAmount + input.workmanshipAmount;
    await logAudit(db, { actor: req.user, action: 'agreement.offered', target: r.title, detail: `Workmanship ${naira(input.workmanshipAmount)}${input.materialsAmount ? ` + materials ${naira(input.materialsAmount)}` : ''} · terms ${TERMS_VERSION}` });
    await notify(db, r.apprentice_id, 'Job offer', `${employer.company} offered you “${r.title}” for ${naira(total)}. Read the terms and accept to start.`, { link: '/apprentice/work', channels: ['in_app', 'sms'] });
    return id;
  });
  res.status(201).json({ id });
});

/** The artisan accepts the employer's terms. They must have a payout account so they can be paid. */
router.post('/agreements/:id/accept', authenticate, requireRole('apprentice'), async (req, res) => {
  z.object({ acceptTerms }).parse(req.body);
  await tx(async (db) => {
    const a = await mine(db, req.params.id, req.user);
    if (a.status !== 'proposed') throw new HttpError(409, 'This offer is no longer waiting for your answer.');
    if (!(await db.query('SELECT 1 FROM payout_accounts WHERE user_id = $1', [req.user.id])).rowCount) {
      throw new HttpError(400, 'Add the bank account you want to be paid into first.', { reason: 'no_payout_account' });
    }
    await db.query(`UPDATE job_agreements SET status = 'accepted', artisan_accepted_at = now(), payment_reference = $2 WHERE id = $1`, [a.id, paymentReference('dep')]);
    await db.query(`UPDATE referrals SET status = 'contacted' WHERE id = $1`, [a.referral_id]);
    await logAudit(db, { actor: req.user, action: 'agreement.accepted', target: a.title, detail: `Both sides accepted · terms ${a.terms_version}` });
    await notify(db, a.employer_id, 'Offer accepted', `${a.artisan_name} accepted “${a.title}”. Pay ${naira(depositAmount(a))} into escrow so they can start.`, { link: '/employer/hires', channels: ['in_app', 'email'] });
  });
  res.json({ ok: true });
});

const cancelSchema = z.object({ reason: z.string().trim().min(3, 'Say briefly why.').max(300) });

/** Either side can call the deal off before any money has been paid. After that, only through a dispute. */
router.post('/agreements/:id/cancel', authenticate, requireRole('apprentice', 'employer'), async (req, res) => {
  const { reason } = cancelSchema.parse(req.body);
  await tx(async (db) => {
    const a = await mine(db, req.params.id, req.user);
    if (!['proposed', 'accepted'].includes(a.status)) {
      throw new HttpError(409, 'Money has already been paid for this job, so it can only be ended through a dispute.');
    }
    await db.query(`UPDATE job_agreements SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancel_reason = $3 WHERE id = $1`, [a.id, req.user.id, reason]);
    await logAudit(db, { actor: req.user, action: 'agreement.cancelled', target: a.title, detail: reason });
    const other = req.user.id === a.employer_id ? a.artisan_id : a.employer_id;
    await notify(db, other, 'Job called off', `${req.user.name} called off “${a.title}”: ${reason}`, { link: other === a.employer_id ? '/employer/hires' : '/apprentice/work' });
  });
  res.json({ ok: true });
});

// ---- paying into escrow ----------------------------------------------------------------------------------------------

/** The employer starts paying. Returns the checkout page: Paystack's, or SkillPass's test page when simulated. */
router.post('/agreements/:id/checkout', authenticate, requireRole('employer'), async (req, res) => {
  const a = await mine(pool, req.params.id, req.user, { lock: false });
  if (a.status !== 'accepted') throw new HttpError(409, a.status === 'proposed' ? 'Wait for the artisan to accept your offer.' : 'This job has already been paid for.');
  try {
    const { checkoutUrl } = await paymentGateway.startCheckout({
      reference: a.payment_reference, amount: depositAmount(a), email: a.employer_email,
      callbackUrl: `${config.appUrl}/pay/${encodeURIComponent(a.payment_reference)}`,
      metadata: { agreementId: a.id, job: a.title },
    });
    res.json({ checkoutUrl, reference: a.payment_reference, amount: depositAmount(a), provider: paymentGateway.name, testMode: paymentGateway.isTestMode });
  } catch (e) {
    if (e instanceof PaymentError) throw new HttpError(502, e.message);
    throw e;
  }
});

/** Look up the job behind a payment reference, for the checkout and return pages. */
router.get('/payments/:reference', authenticate, requireRole('employer'), async (req, res) => {
  const row = (await pool.query('SELECT id FROM job_agreements WHERE payment_reference = $1 AND employer_id = $2', [req.params.reference, req.user.id])).rows[0];
  if (!row) throw new HttpError(404, 'Payment not found.');
  const a = await loadAgreement(pool, row.id);
  res.json({
    agreementId: a.id, title: a.title, artisan: a.artisan_name, status: a.status, amount: depositAmount(a),
    materialsBy: a.materials_by, materialsAmount: a.materials_amount, workmanshipAmount: a.workmanship_amount,
    provider: paymentGateway.name, testMode: paymentGateway.isTestMode,
  });
});

async function settleDeposit(reference, amount) {
  const pending = await tx(async (db) => {
    const row = (await db.query('SELECT id FROM job_agreements WHERE payment_reference = $1', [reference])).rows[0];
    if (!row) throw new HttpError(404, 'Payment not found.');
    const a = await loadAgreement(db, row.id, { lock: true });
    try {
      return (await recordDeposit(db, a, amount)).pending;
    } catch (e) {
      throw new HttpError(400, e.message);
    }
  });
  await processPayments(pending);
}

/** Test checkout only: the employer presses "Pay". Refused when a real gateway is connected. */
router.post('/payments/:reference/simulate', authenticate, requireRole('employer'), async (req, res) => {
  if (!paymentGateway.isSimulated) throw new HttpError(404, 'Not found.');
  const row = (await pool.query('SELECT id FROM job_agreements WHERE payment_reference = $1 AND employer_id = $2', [req.params.reference, req.user.id])).rows[0];
  if (!row) throw new HttpError(404, 'Payment not found.');
  const a = await loadAgreement(pool, row.id);
  paymentGateway.markPaid(req.params.reference, depositAmount(a));
  await settleDeposit(req.params.reference, depositAmount(a));
  res.json({ ok: true });
});

/** After paying, the employer is sent back here. We ask the provider whether the money really arrived. */
router.post('/payments/:reference/confirm', authenticate, requireRole('employer'), async (req, res) => {
  const owned = (await pool.query('SELECT 1 FROM job_agreements WHERE payment_reference = $1 AND employer_id = $2', [req.params.reference, req.user.id])).rowCount;
  if (!owned) throw new HttpError(404, 'Payment not found.');
  let result;
  try {
    result = await paymentGateway.confirm(req.params.reference);
  } catch (e) {
    if (e instanceof PaymentError) throw new HttpError(502, e.message);
    throw e;
  }
  if (!result.paid) throw new HttpError(402, 'We have not received this payment yet. If you were charged, wait a minute and try again.');
  await settleDeposit(req.params.reference, result.amount);
  res.json({ ok: true });
});

/**
 * Paystack webhook. The signature proves Paystack sent it; we still re-check the payment with Paystack's API
 * before marking anything paid. Always answers 200 for a valid signature so Paystack does not keep retrying.
 */
router.post('/payments/paystack/webhook', async (req, res) => {
  // req.rawBody is the exact bytes Paystack signed (kept by the JSON parser in app.js).
  if (paymentGateway.name !== 'paystack' || !paymentGateway.verifyWebhook(req.rawBody, req.headers['x-paystack-signature'])) {
    throw new HttpError(401, 'Invalid signature.');
  }
  const event = req.body;
  const reference = event?.data?.reference;
  if (event.event === 'charge.success' && reference) {
    const result = await paymentGateway.confirm(reference);
    if (result.paid) await settleDeposit(reference, result.amount).catch((e) => console.error('Webhook deposit not recorded:', e.message));
  } else if (['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(event.event) && reference) {
    await pool.query(`UPDATE payments SET status = $2, completed_at = now() WHERE reference = $1 AND status <> 'succeeded'`,
      [reference, event.event === 'transfer.success' ? 'succeeded' : 'failed']);
  }
  res.json({ ok: true });
});

// ---- doing the work ------------------------------------------------------------------------------------------------------

const upload = multer({ dest: tempDir(), limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 10 } });
const optional = (schema) => z.preprocess((v) => (v === '' || v == null ? undefined : v), schema.optional());
const photoSchema = z.object({
  stage: z.enum(['before', 'after']),
  locationLabel: z.string().trim().max(120).default(''),
  lat: optional(z.coerce.number().min(-90).max(90)),
  lng: optional(z.coerce.number().min(-180).max(180)),
  locationSource: optional(z.enum(['gps', 'declared'])),
});

/** A live-camera photo of the site before work or of the finished work. Used as evidence if there is a dispute. */
router.post('/agreements/:id/photos', authenticate, requireRole('apprentice'), upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'Attach a photo in the "file" field.');
  let storedKey = null;
  let saved = false;
  try {
    const body = photoSchema.parse(req.body);
    const sniffed = await sniffFile(file.path);
    if (sniffed?.kind !== 'photo') throw new HttpError(415, 'Only JPEG, PNG or WebP photos are accepted.');
    const hash = await sha256File(file.path);
    const photo = await tx(async (db) => {
      const a = await mine(db, req.params.id, req.user);
      if (a.artisan_id !== req.user.id) throw new HttpError(403, 'Only the artisan doing the job adds photos.');
      if (!['in_progress', 'submitted'].includes(a.status) || (a.status === 'submitted' && body.stage === 'before')) {
        throw new HttpError(409, a.status === 'accepted' || a.status === 'proposed' ? 'Wait until the employer has paid into escrow before starting.' : 'Photos can no longer be added to this job.');
      }
      const dup = (await db.query('SELECT 1 FROM job_photos WHERE sha256 = $1 UNION ALL SELECT 1 FROM evidence WHERE sha256 = $1', [hash])).rowCount;
      if (dup) throw new HttpError(409, 'This photo was already used. Take a new one with the camera.');
      const stored = await storeFile(file.path, sniffed.ext);
      storedKey = stored.key;
      const id = uid('jp');
      const gps = body.locationSource === 'gps' && body.lat != null && body.lng != null;
      await db.query(
        `INSERT INTO job_photos (id, agreement_id, uploaded_by, stage, url, sha256, location_label, lat, lng, location_source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, a.id, req.user.id, body.stage, stored.url, hash, body.locationLabel, body.lat ?? null, body.lng ?? null, gps ? 'gps' : 'declared']);
      return { id, stage: body.stage };
    });
    saved = true;
    res.status(201).json({ photo });
  } finally {
    await removeFile(file.path);
    if (storedKey && !saved) await removeStored(storedKey);
  }
});

/** The artisan says the job is done. Needs at least one before photo and one after photo. */
router.post('/agreements/:id/submit', authenticate, requireRole('apprentice'), async (req, res) => {
  await tx(async (db) => {
    const a = await mine(db, req.params.id, req.user);
    if (a.status !== 'in_progress') throw new HttpError(409, 'This job is not in progress.');
    const stages = new Set((await db.query('SELECT stage FROM job_photos WHERE agreement_id = $1', [a.id])).rows.map((r) => r.stage));
    if (!stages.has('before') || !stages.has('after')) throw new HttpError(400, 'Add at least one photo from before you started and one of the finished work.');
    const { reviewDays } = await getSettings(db);
    await db.query(`UPDATE job_agreements SET status = 'submitted', submitted_at = now(), review_deadline = now() + make_interval(days => $2) WHERE id = $1`, [a.id, reviewDays]);
    await logAudit(db, { actor: req.user, action: 'agreement.submitted', target: a.title, detail: `Marked done · employer has ${reviewDays} days to confirm or dispute` });
    await notify(db, a.employer_id, 'Job marked as done', `${a.artisan_name} finished “${a.title}”. Check the work and confirm within ${reviewDays} days, or raise a dispute. If you do neither, ${naira(a.workmanship_amount)} is released automatically.`,
      { link: '/employer/hires', channels: ['in_app', 'sms', 'email'] });
  });
  res.json({ ok: true });
});

/** The employer is happy with the work: release the held workmanship money. */
router.post('/agreements/:id/complete', authenticate, requireRole('employer'), async (req, res) => {
  const pending = await tx(async (db) => {
    const a = await mine(db, req.params.id, req.user);
    if (a.status !== 'submitted') throw new HttpError(409, a.status === 'in_progress' ? 'The artisan has not marked the job as done yet.' : 'This job cannot be confirmed now.');
    return completeAgreement(db, a, req.user, 'confirmed by the employer');
  });
  await processPayments(pending);
  res.json({ ok: true });
});

// ---- disputes --------------------------------------------------------------------------------------------------------------

const disputeSchema = z.object({
  reason: z.enum(['poor_work', 'not_finished', 'no_show', 'materials', 'changed_scope', 'not_confirming', 'other']),
  details: z.string().trim().min(20, 'Explain what happened in a few sentences (at least 20 characters).').max(2000),
});

const REASONS = {
  poor_work: 'Poor quality work', not_finished: 'Job not finished', no_show: 'Did not show up', materials: 'Materials problem',
  changed_scope: 'Job changed from what was agreed', not_confirming: 'Employer will not confirm', other: 'Something else',
};

/** Either side raises a dispute while money is held. Nothing is released until an administrator decides. */
router.post('/agreements/:id/disputes', authenticate, requireRole('apprentice', 'employer'), async (req, res) => {
  const input = disputeSchema.parse(req.body);
  const id = await tx(async (db) => {
    const a = await mine(db, req.params.id, req.user);
    if (!['in_progress', 'submitted'].includes(a.status)) throw new HttpError(409, 'A dispute can be raised only while payment is held for this job.');
    const id = uid('jd');
    await db.query('INSERT INTO job_disputes (id, agreement_id, raised_by, reason, details) VALUES ($1, $2, $3, $4, $5)', [id, a.id, req.user.id, input.reason, input.details]);
    await db.query(`UPDATE job_agreements SET status = 'disputed' WHERE id = $1`, [a.id]);
    await logAudit(db, { actor: req.user, action: 'dispute.raised', target: a.title, detail: `${REASONS[input.reason]} · ${naira(a.workmanship_amount)} frozen` });
    const other = req.user.id === a.employer_id ? a.artisan_id : a.employer_id;
    await notify(db, other, 'Dispute raised', `${req.user.name} raised a dispute about “${a.title}”: ${REASONS[input.reason]}. Give your side within 3 days. Payment is frozen until an administrator decides.`,
      { link: other === a.employer_id ? '/employer/hires' : '/apprentice/work', channels: ['in_app', 'sms'] });
    await notifyAdmins(db, 'New job dispute', `${req.user.name} disputed “${a.title}”. ${naira(a.workmanship_amount)} is held.`, '/admin/review');
    return id;
  });
  res.status(201).json({ id });
});

/** The other side gives their account of what happened. */
router.post('/disputes/:id/respond', authenticate, requireRole('apprentice', 'employer'), async (req, res) => {
  const { details } = z.object({ details: z.string().trim().min(20, 'Explain your side in a few sentences (at least 20 characters).').max(2000) }).parse(req.body);
  await tx(async (db) => {
    const d = (await db.query('SELECT * FROM job_disputes WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    const a = d && await loadAgreement(db, d.agreement_id);
    if (!isParty(a, req.user)) throw new HttpError(404, 'Dispute not found.');
    if (d.raised_by === req.user.id) throw new HttpError(403, 'The other side responds to a dispute. You can add details by contacting the administrator.');
    if (d.status !== 'open') throw new HttpError(409, 'This dispute has already been decided.');
    if (d.response) throw new HttpError(409, 'You have already given your side.');
    await db.query('UPDATE job_disputes SET response = $2, responded_at = now() WHERE id = $1', [d.id, details]);
    await logAudit(db, { actor: req.user, action: 'dispute.responded', target: a.title, detail: 'Other side gave their account' });
  });
  res.json({ ok: true });
});

const decisionSchema = z.object({
  artisanSharePct: z.number().int().min(0).max(100),
  note: z.string().trim().min(10, 'Explain the decision so both sides understand it.').max(1000),
});

/** An administrator decides how the held workmanship money is shared. Final for SkillPass (see Terms, section 8). */
router.post('/admin/disputes/:id/resolve', authenticate, requireRole('admin'), async (req, res) => {
  const input = decisionSchema.parse(req.body);
  const pending = await tx(async (db) => {
    const d = (await db.query('SELECT * FROM job_disputes WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!d) throw new HttpError(404, 'Dispute not found.');
    if (d.status !== 'open') throw new HttpError(409, 'This dispute has already been decided.');
    const a = await loadAgreement(db, d.agreement_id, { lock: true });
    const { pending, toArtisan, toEmployer } = await settleWorkmanship(db, a, input.artisanSharePct,
      `${input.artisanSharePct}% of workmanship to the artisan after dispute decision`);
    await db.query(`UPDATE job_disputes SET status = 'resolved', artisan_share_pct = $2, decision_note = $3, resolved_by = $4, resolved_at = now() WHERE id = $1`,
      [d.id, input.artisanSharePct, input.note, req.user.id]);
    await db.query(`UPDATE job_agreements SET status = 'resolved', completed_at = now() WHERE id = $1`, [a.id]);
    await logAudit(db, { actor: req.user, action: 'dispute.resolved', target: a.title, detail: `${naira(toArtisan)} to ${a.artisan_name}, ${naira(toEmployer)} refunded · ${input.note}` });
    const msg = `Decision on “${a.title}”: ${naira(toArtisan)} goes to ${a.artisan_name} and ${naira(toEmployer)} is refunded to the employer. ${input.note}`;
    await notify(db, a.artisan_id, 'Dispute decided', msg, { link: '/apprentice/work', channels: ['in_app', 'sms'] });
    await notify(db, a.employer_id, 'Dispute decided', msg, { link: '/employer/hires', channels: ['in_app', 'email'] });
    return pending;
  });
  await processPayments(pending);
  res.json({ ok: true });
});

// ---- the artisan rates the employer ---------------------------------------------------------------------------------------

router.post('/agreements/:id/rate-employer', authenticate, requireRole('apprentice'), async (req, res) => {
  const input = z.object({
    rating: z.number().int().min(1, 'Choose a rating from 1 to 5.').max(5, 'Choose a rating from 1 to 5.'),
    comment: z.string().trim().max(500).default(''),
  }).parse(req.body);
  await tx(async (db) => {
    const a = await mine(db, req.params.id, req.user);
    if (!['completed', 'resolved'].includes(a.status)) throw new HttpError(409, 'You can rate the employer once the job is finished and paid.');
    if ((await db.query('SELECT 1 FROM employer_ratings WHERE agreement_id = $1', [a.id])).rowCount) throw new HttpError(409, 'You have already rated this employer for this job.');
    await db.query('INSERT INTO employer_ratings (id, agreement_id, artisan_id, employer_id, rating, comment) VALUES ($1, $2, $3, $4, $5, $6)',
      [uid('er'), a.id, req.user.id, a.employer_id, input.rating, input.comment]);
    await logAudit(db, { actor: req.user, action: 'employer.rated', target: a.company ?? a.employer_name, detail: `Rated ${input.rating}/5 for ${a.title}` });
    await notify(db, a.employer_id, 'New rating', `${a.artisan_name} rated you ${input.rating}/5 for “${a.title}”.`, { link: '/employer/hires' });
  });
  res.status(201).json({ ok: true });
});

export default router;
