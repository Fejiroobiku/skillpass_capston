import { Router } from 'express';
import { z } from 'zod';
import { tx } from '../db.js';
import { HttpError } from '../lib/errors.js';
import { logAudit, notify } from '../lib/audit.js';
import { uid } from '../lib/ids.js';
import { rankMatches } from '../lib/matching.js';
import { authenticate, requireRole } from '../middleware/auth.js';

// Mounted at /api, so authentication is applied per route rather than for the whole router.
const router = Router();

const jobSchema = z.object({
  title: z.string().trim().min(3, 'Give the job a title.').max(150),
  skillIds: z.array(z.string()).min(1, 'Choose at least one required skill.').max(10),
  location: z.object({ name: z.string().trim().min(1).max(120), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  pay: z.string().trim().max(80).default(''),
  // Who buys the materials, and the employer's budget for materials and for workmanship (labour), in whole naira.
  materialsBy: z.enum(['employer', 'artisan']).default('employer'),
  materialsBudget: z.number().int().min(0).max(100_000_000).nullable().default(null),
  workmanshipBudget: z.number().int().min(0).max(100_000_000).nullable().default(null),
}).refine((j) => j.materialsBy === 'artisan' || !j.materialsBudget, { message: 'You are buying the materials, so leave the materials budget empty.', path: ['materialsBudget'] });

const naira = (n) => `₦${Number(n).toLocaleString('en-NG')}`;
/** A short price line for lists and SMS, built from the budgets when the employer did not write one. */
const payLine = (j) => j.pay || (j.workmanshipBudget
  ? `${naira(j.workmanshipBudget)} workmanship${j.materialsBy === 'artisan' && j.materialsBudget ? ` + ${naira(j.materialsBudget)} materials` : ''}`
  : 'Open to quotes');

const quoteSchema = z.object({
  workmanship: z.number({ invalid_type_error: 'Enter your price for the work in naira.' }).int().min(1, 'Enter your price for the work.').max(100_000_000),
  materials: z.number().int().min(0).max(100_000_000).nullable().default(null),
  availableFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date you can start.'),
  note: z.string().trim().max(500).default(''),
});

/** Verified skills of every apprentice in a trade, for ranking. */
async function candidates(db, tradeId) {
  const { rows } = await db.query(
    `SELECT u.id, u.lat, u.lng,
            COALESCE(array_agg(c.skill_id) FILTER (WHERE c.status = 'valid'), '{}') AS verified
       FROM apprentice_profiles ap JOIN users u ON u.id = ap.user_id
       LEFT JOIN credentials c ON c.apprentice_id = u.id
      WHERE ap.trade_id = $1 AND u.status = 'active' GROUP BY u.id`,
    [tradeId],
  );
  return rows.map((r) => ({ id: r.id, location: { lat: r.lat ?? 0, lng: r.lng ?? 0 }, verified: new Set(r.verified) }));
}

router.post('/jobs', authenticate, requireRole('employer'), async (req, res) => {
  const input = jobSchema.parse(req.body);
  const job = await tx(async (db) => {
    const employer = (await db.query('SELECT trade_id FROM employer_profiles WHERE user_id = $1', [req.user.id])).rows[0];
    const skills = (await db.query(`SELECT id FROM skills WHERE id = ANY($1) AND trade_id = $2 AND status = 'active'`, [input.skillIds, employer.trade_id])).rowCount;
    if (skills !== new Set(input.skillIds).size) throw new HttpError(400, 'Choose skills from your own trade.');

    const id = uid('j');
    const pay = payLine(input);
    await db.query(
      `INSERT INTO job_postings (id, employer_id, title, trade_id, location_name, lat, lng, pay, materials_by, materials_budget, workmanship_budget)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, req.user.id, input.title, employer.trade_id, input.location.name, input.location.lat, input.location.lng, pay,
        input.materialsBy, input.materialsBy === 'artisan' ? input.materialsBudget : null, input.workmanshipBudget],
    );
    for (const s of new Set(input.skillIds)) await db.query('INSERT INTO job_skills (job_id, skill_id) VALUES ($1, $2)', [id, s]);

    await logAudit(db, { actor: req.user, action: 'job.posted', target: input.title, detail: `${input.skillIds.length} required skills · ${input.location.name}` });
    const n = rankMatches({ skillIds: input.skillIds, location: input.location }, await candidates(db, employer.trade_id)).length;
    await notify(db, req.user.id, `${n} match${n === 1 ? '' : 'es'} for your job`, `${input.title} has ${n} verified artisan${n === 1 ? '' : 's'}.`, { link: '/employer/jobs' });

    const row = (await db.query('SELECT posted_at FROM job_postings WHERE id = $1', [id])).rows[0];
    return {
      id, employerId: req.user.id, title: input.title, trade: employer.trade_id, skillIds: [...new Set(input.skillIds)], location: input.location,
      postedAt: row.posted_at.toISOString(), pay, materialsBy: input.materialsBy,
      materialsBudget: input.materialsBy === 'artisan' ? input.materialsBudget : null, workmanshipBudget: input.workmanshipBudget,
    };
  });
  res.status(201).json({ job });
});

/** Send a job to a matched apprentice. Only verified employers can contact apprentices. */
router.post('/jobs/:id/referrals', authenticate, requireRole('employer'), async (req, res) => {
  const { apprenticeId } = z.object({ apprenticeId: z.string().min(1) }).parse(req.body);
  const referral = await tx(async (db) => {
    const employer = (await db.query('SELECT approved FROM employer_profiles WHERE user_id = $1', [req.user.id])).rows[0];
    if (!employer?.approved) throw new HttpError(403, 'Only verified employers can send job referrals.');
    const job = (await db.query(
      `SELECT j.*, COALESCE(array_agg(js.skill_id) FILTER (WHERE js.skill_id IS NOT NULL), '{}') AS skill_ids
         FROM job_postings j LEFT JOIN job_skills js ON js.job_id = j.id WHERE j.id = $1 GROUP BY j.id`, [req.params.id])).rows[0];
    if (!job || job.employer_id !== req.user.id) throw new HttpError(404, 'Job not found.');

    const match = rankMatches({ skillIds: job.skill_ids, location: { lat: job.lat, lng: job.lng } }, await candidates(db, job.trade_id)).find((m) => m.id === apprenticeId);
    if (!match) throw new HttpError(400, 'This artisan has no verified skills for this job.');
    if ((await db.query('SELECT 1 FROM referrals WHERE job_id = $1 AND apprentice_id = $2', [job.id, apprenticeId])).rowCount) throw new HttpError(409, 'This artisan already has this job.');

    const id = uid('r');
    await db.query('INSERT INTO referrals (id, job_id, apprentice_id) VALUES ($1, $2, $3)', [id, job.id, apprenticeId]);
    const name = (await db.query('SELECT name FROM users WHERE id = $1', [apprenticeId])).rows[0].name;
    await logAudit(db, { actor: req.user, action: 'referral.sent', target: name, detail: job.title });
    await notify(db, apprenticeId, 'New job referral', `${job.title} in ${job.location_name} (${job.pay}).`, { link: '/apprentice/jobs', channels: ['in_app', 'sms'] });
    const row = (await db.query('SELECT sent_at FROM referrals WHERE id = $1', [id])).rows[0];
    return { id, jobId: job.id, apprenticeId, status: 'sent', sentAt: row.sent_at.toISOString() };
  });
  res.status(201).json({ referral });
});

/**
 * The artisan says they are interested (with a quote: their price for the work, materials if they buy them, and when
 * they can start) or declines. The employer can then mark an interested artisan as contacted, or hire them through a
 * job agreement (routes/agreements.js).
 */
router.patch('/referrals/:id', authenticate, requireRole('apprentice', 'employer'), async (req, res) => {
  const { status, quote } = z.object({ status: z.enum(['accepted', 'declined', 'contacted']), quote: quoteSchema.optional() }).parse(req.body);
  await tx(async (db) => {
    const r = (await db.query(
      `SELECT r.*, j.employer_id, j.title, j.materials_by FROM referrals r JOIN job_postings j ON j.id = r.job_id WHERE r.id = $1 FOR UPDATE OF r`, [req.params.id])).rows[0];
    const mine = r && (req.user.role === 'apprentice' ? r.apprentice_id === req.user.id : r.employer_id === req.user.id);
    if (!mine) throw new HttpError(404, 'Referral not found.');
    if (req.user.role === 'apprentice' && !(r.status === 'sent' && ['accepted', 'declined'].includes(status))) throw new HttpError(409, 'You can accept or decline a referral once.');
    if (req.user.role === 'employer' && !(r.status === 'accepted' && status === 'contacted')) throw new HttpError(409, 'You can mark a referral as contacted after the artisan accepts it.');
    if (quote && status !== 'accepted') throw new HttpError(400, 'A quote is sent together with saying you are interested.');
    if (quote && r.materials_by === 'artisan' && !quote.materials) throw new HttpError(400, 'This job needs you to buy the materials. Enter what the materials will cost.');
    if (quote && r.materials_by === 'employer' && quote.materials) throw new HttpError(400, 'The employer is buying the materials for this job, so leave materials empty.');
    await db.query('UPDATE referrals SET status = $2 WHERE id = $1', [r.id, status]);
    if (quote) {
      await db.query(
        `UPDATE referrals SET quote_workmanship = $2, quote_materials = $3, available_from = $4, quote_note = $5, quoted_at = now() WHERE id = $1`,
        [r.id, quote.workmanship, quote.materials, quote.availableFrom, quote.note]);
    }
    if (status === 'accepted') {
      const name = (await db.query('SELECT name FROM users WHERE id = $1', [r.apprentice_id])).rows[0].name;
      await notify(db, r.employer_id, quote ? 'New quote' : 'Artisan interested',
        quote
          ? `${name} quoted ${naira(quote.workmanship)} workmanship${quote.materials ? ` + ${naira(quote.materials)} materials` : ''} for ${r.title}, from ${quote.availableFrom}.`
          : `${name} is interested in ${r.title}.`,
        { link: '/employer/hires' });
    }
  });
  res.json({ ok: true });
});

export default router;
