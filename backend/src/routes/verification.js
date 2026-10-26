import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, query, tx } from '../db.js';
import { HttpError } from '../lib/errors.js';
import { logAudit } from '../lib/audit.js';
import { uid } from '../lib/ids.js';
import { sendEmail, sendSms, showEmailLink, showSmsCode } from '../lib/messaging.js';
import { maskEmail, maskPhone } from '../lib/phone.js';
import { authenticate } from '../middleware/auth.js';

/**
 * Phone verification (required before confirming, co-signing or rating), email verification, and password reset.
 *
 * Every code and link is random, single use, short-lived, and stored only as a SHA-256 hash. Phone codes allow five
 * tries; a new one can be asked for after 60 seconds, at most five an hour.
 */
const router = Router();

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const sameHash = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const PHONE_CODE_MINUTES = 10;
const PHONE_MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 5;
const EMAIL_LINK_HOURS = 24;
const RESET_LINK_MINUTES = 60;

/** Refuse a new code or link while the last one is under a minute old, or after five in the last hour. */
async function checkSendLimits(db, userId, purpose) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n, max(created_at) AS last FROM contact_verifications
      WHERE user_id = $1 AND purpose = $2 AND created_at > now() - interval '1 hour'`,
    [userId, purpose],
  );
  const { n, last } = rows[0];
  if (last) {
    const wait = Math.ceil(RESEND_SECONDS - (Date.now() - new Date(last).getTime()) / 1000);
    if (wait > 0) throw new HttpError(429, `Please wait ${wait} seconds before asking for another one.`, { retryAfter: wait });
  }
  if (n >= MAX_SENDS_PER_HOUR) throw new HttpError(429, 'Too many requests this hour. Please try again later.');
}

async function createSecret(db, { userId, purpose, target, secret, minutes }) {
  // A new code or link replaces any earlier one that was not used.
  await db.query('UPDATE contact_verifications SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL', [userId, purpose]);
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
  await db.query(
    'INSERT INTO contact_verifications (id, user_id, purpose, target, secret_hash, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [uid('cv'), userId, purpose, target, sha256(secret), expiresAt],
  );
  return expiresAt;
}

const accountOf = async (db, id) => (await db.query(
  'SELECT id, name, email, phone_e164, phone_verified_at, email_verified_at, status FROM users WHERE id = $1',
  [id],
)).rows[0];

// ---------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------

/** Text a six-digit code to the account's phone number. */
router.post('/phone/send', authenticate, async (req, res) => {
  const me = await accountOf(pool, req.user.id);
  if (!me.phone_e164) throw new HttpError(400, 'Add a Nigerian mobile number to your account first.');
  if (me.phone_verified_at) return res.json({ alreadyVerified: true });

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = await tx(async (db) => {
    await db.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [me.id]); // one request at a time per account
    await checkSendLimits(db, me.id, 'phone');
    return createSecret(db, { userId: me.id, purpose: 'phone', target: me.phone_e164, secret: code, minutes: PHONE_CODE_MINUTES });
  });
  await sendSms(me.phone_e164, `Your SkillPass code is ${code}. It expires in ${PHONE_CODE_MINUTES} minutes. Never share it with anyone, including your assessor.`);
  res.json({ sentTo: maskPhone(me.phone_e164), expiresAt: expiresAt.toISOString(), resendAfterSeconds: RESEND_SECONDS, ...(showSmsCode() ? { devCode: code } : {}) });
});

/** Check the code. Five wrong tries and it stops working. */
router.post('/phone/verify', authenticate, async (req, res) => {
  const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'The code is six digits.') }).parse(req.body);
  const outcome = await tx(async (db) => {
    const me = await accountOf(db, req.user.id);
    if (me.phone_verified_at) return { ok: true };
    const v = (await db.query(
      `SELECT * FROM contact_verifications
        WHERE user_id = $1 AND purpose = 'phone' AND used_at IS NULL
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [me.id],
    )).rows[0];
    if (!v || new Date(v.expires_at) < new Date() || v.target !== me.phone_e164) return { error: [400, 'That code has expired. Ask for a new one.'] };
    if (v.attempts >= PHONE_MAX_ATTEMPTS) return { error: [429, 'Too many wrong tries. Ask for a new code.'] };
    if (!sameHash(sha256(code), v.secret_hash)) {
      await db.query('UPDATE contact_verifications SET attempts = attempts + 1 WHERE id = $1', [v.id]);
      const left = PHONE_MAX_ATTEMPTS - v.attempts - 1;
      return { error: [400, left > 0 ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Ask for a new code.'] };
    }
    await db.query('UPDATE contact_verifications SET used_at = now() WHERE id = $1', [v.id]);
    await db.query('UPDATE users SET phone_verified_at = now() WHERE id = $1', [me.id]);
    await logAudit(db, { actor: req.user, action: 'account.phone_verified', target: me.id, detail: `Phone ${maskPhone(me.phone_e164)} confirmed by SMS code` });
    return { ok: true };
  });
  // Wrong tries are counted even though the request fails, so the error is thrown after the commit.
  if (outcome.error) throw new HttpError(outcome.error[0], outcome.error[1]);
  res.json({ verified: true });
});

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/** Email a link that confirms the address. Not required to use SkillPass, but needed for password reset. */
router.post('/email/send', authenticate, async (req, res) => {
  const me = await accountOf(pool, req.user.id);
  if (me.email_verified_at) return res.json({ alreadyVerified: true });
  const token = randomBytes(24).toString('hex');
  await tx(async (db) => {
    await db.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [me.id]);
    await checkSendLimits(db, me.id, 'email');
    await createSecret(db, { userId: me.id, purpose: 'email', target: me.email, secret: token, minutes: EMAIL_LINK_HOURS * 60 });
  });
  const link = `${config.appUrl}/verify-email?token=${token}`;
  await sendEmail(me.email, 'Confirm your email for SkillPass', `Hello ${me.name},\n\nConfirm this email address for your SkillPass account by opening this link:\n${link}\n\nThe link works once and expires in ${EMAIL_LINK_HOURS} hours. If you did not ask for this, you can ignore this email.\n`);
  res.json({ sentTo: maskEmail(me.email), ...(showEmailLink() ? { devLink: link } : {}) });
});

/** Opened from the email. Works whether or not the person is signed in on this device. */
router.post('/email/verify', async (req, res) => {
  const { token } = z.object({ token: z.string().regex(/^[0-9a-f]{48}$/, 'This link is not valid.') }).parse(req.body);
  const ok = await tx(async (db) => {
    const v = (await db.query(
      `SELECT v.*, u.email FROM contact_verifications v JOIN users u ON u.id = v.user_id
        WHERE v.secret_hash = $1 AND v.purpose = 'email' AND v.used_at IS NULL AND v.expires_at > now() AND u.status = 'active'
        FOR UPDATE OF v`,
      [sha256(token)],
    )).rows[0];
    if (!v || v.target !== v.email) return false;
    await db.query('UPDATE contact_verifications SET used_at = now() WHERE id = $1', [v.id]);
    await db.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [v.user_id]);
    await logAudit(db, { actor: { id: v.user_id, name: 'Account holder' }, action: 'account.email_verified', target: v.user_id, detail: 'Email confirmed by link' });
    return true;
  });
  if (!ok) throw new HttpError(400, 'This link has expired or was already used. Ask for a new one from your profile.');
  res.json({ verified: true });
});

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

/**
 * Always answers the same way, so nobody can use it to find out which emails have accounts.
 * A reset link is only sent to a confirmed email address.
 */
router.post('/password/forgot', async (req, res) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address.') }).parse(req.body);
  const answer = { message: 'If that email belongs to a SkillPass account with a confirmed email address, a reset link is on its way.' };
  const me = (await query(`SELECT id, name, email, email_verified_at FROM users WHERE lower(email) = $1 AND status = 'active'`, [email])).rows[0];
  if (!me || !me.email_verified_at) return res.json(answer);

  const token = randomBytes(24).toString('hex');
  try {
    await tx(async (db) => {
      await db.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [me.id]);
      await checkSendLimits(db, me.id, 'password_reset');
      await createSecret(db, { userId: me.id, purpose: 'password_reset', target: me.email, secret: token, minutes: RESET_LINK_MINUTES });
    });
  } catch (err) {
    if (err instanceof HttpError && err.status === 429) return res.json(answer); // same answer, nothing sent
    throw err;
  }
  const link = `${config.appUrl}/reset-password?token=${token}`;
  await sendEmail(me.email, 'Reset your SkillPass password', `Hello ${me.name},\n\nSomeone asked to reset the password for your SkillPass account. To choose a new password, open:\n${link}\n\nThe link works once and expires in ${RESET_LINK_MINUTES} minutes. If this was not you, ignore this email; your password stays the same.\n`);
  res.json({ ...answer, ...(showEmailLink() ? { devLink: link } : {}) });
});

router.post('/password/reset', async (req, res) => {
  const { token, password } = z.object({
    token: z.string().regex(/^[0-9a-f]{48}$/, 'This link is not valid.'),
    password: z.string().min(8, 'Use at least 8 characters for your password.').max(200),
  }).parse(req.body);
  const hash = await bcrypt.hash(password, config.bcryptRounds);
  const ok = await tx(async (db) => {
    const v = (await db.query(
      `SELECT v.* FROM contact_verifications v JOIN users u ON u.id = v.user_id
        WHERE v.secret_hash = $1 AND v.purpose = 'password_reset' AND v.used_at IS NULL AND v.expires_at > now() AND u.status = 'active'
        FOR UPDATE OF v`,
      [sha256(token)],
    )).rows[0];
    if (!v) return false;
    await db.query('UPDATE contact_verifications SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL', [v.user_id, 'password_reset']);
    // password_changed_at ends every session that was signed in before the reset.
    await db.query('UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1', [v.user_id, hash]);
    await logAudit(db, { actor: { id: v.user_id, name: 'Account holder' }, action: 'account.password_reset', target: v.user_id, detail: 'Password changed with an email reset link; other sessions signed out' });
    return true;
  });
  if (!ok) throw new HttpError(400, 'This reset link has expired or was already used. Ask for a new one.');
  res.json({ reset: true });
});

export default router;
