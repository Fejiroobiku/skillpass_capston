import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError } from '../lib/errors.js';
import { logAudit } from '../lib/audit.js';
import { loadTrust } from '../lib/integrity.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => config.env === 'test' }));

const TOKEN_PATTERN = /^[0-9a-f]{32}$/;
const newToken = () => randomUUID().replace(/-/g, '');
const notFound = () => new HttpError(404, 'Passport not found.');

/** An apprentice's skills passport: skills, the trainers who signed them and employer ratings. Never contact details. */
async function buildPassport(apprenticeId) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.location_name, ap.trade_id, ap.started_at, tr.name AS trade_name,
            tu.id AS trainer_id, tu.name AS trainer_name, tp.workshop
       FROM users u
       JOIN apprentice_profiles ap ON ap.user_id = u.id
       JOIN trades tr ON tr.id = ap.trade_id
       LEFT JOIN users tu ON tu.id = ap.trainer_id
       LEFT JOIN trainer_profiles tp ON tp.user_id = ap.trainer_id
      WHERE u.id = $1 AND u.status = 'active'`,
    [apprenticeId],
  );
  const a = rows[0];
  if (!a) return null;

  const credentials = (await query(
    `SELECT id, skill_id, trainer_id, status, issued_at FROM credentials
      WHERE apprentice_id = $1 AND status <> 'pending_apprentice' ORDER BY issued_at`,
    [a.id],
  )).rows;
  const skills = (await query(`SELECT id, name, level FROM skills WHERE trade_id = $1 AND status = 'active' ORDER BY id`, [a.trade_id])).rows;
  const ratings = (await query(
    `SELECT f.id, f.rating, f.comment, f.created_at, ep.company
       FROM feedback f JOIN employer_profiles ep ON ep.user_id = f.employer_id
      WHERE f.apprentice_id = $1 ORDER BY f.created_at DESC`,
    [a.id],
  )).rows;

  const trainerIds = new Set(credentials.map((c) => c.trainer_id));
  if (a.trainer_id) trainerIds.add(a.trainer_id);
  const trainers = {};
  for (const id of trainerIds) {
    const t = await loadTrust({ query }, id);
    const info = (await query('SELECT u.name, tp.misconduct_at FROM users u JOIN trainer_profiles tp ON tp.user_id = u.id WHERE u.id = $1', [id])).rows[0];
    trainers[id] = { id, name: info.name, trustScore: t.score, underReview: info.misconduct_at != null };
  }

  return {
    apprentice: { id: a.id, name: a.name, location: a.location_name ?? '', trade: a.trade_id, tradeName: a.trade_name, startedAt: a.started_at.toISOString() },
    trainer: a.trainer_id ? { ...trainers[a.trainer_id], workshop: a.workshop } : null,
    skills,
    credentials: credentials.map((c) => ({ id: c.id, skillId: c.skill_id, trainerId: c.trainer_id, status: c.status, issuedAt: c.issued_at.toISOString() })),
    trainers,
    ratings: ratings.map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, company: r.company, createdAt: r.created_at.toISOString() })),
  };
}

const shareOf = async (apprenticeId) => {
  const r = (await query('SELECT passport_token, passport_public FROM apprentice_profiles WHERE user_id = $1', [apprenticeId])).rows[0];
  return { token: r.passport_token, public: r.passport_public };
};

// ---------------------------------------------------------------------------
// The apprentice's own passport and sharing controls
// ---------------------------------------------------------------------------

router.get('/me', authenticate, requireRole('apprentice'), async (req, res) => {
  const passport = await buildPassport(req.user.id);
  if (!passport) throw notFound();
  res.json({ passport, share: await shareOf(req.user.id) });
});

/** Switch the public link on or off. Off means the link and its QR code show "Passport not found". */
router.patch('/me', authenticate, requireRole('apprentice'), async (req, res) => {
  const { public: isPublic } = z.object({ public: z.boolean() }).parse(req.body);
  await query('UPDATE apprentice_profiles SET passport_public = $2 WHERE user_id = $1', [req.user.id, isPublic]);
  await logAudit({ query }, { actor: req.user, action: isPublic ? 'passport.shared' : 'passport.hidden', target: req.user.id, detail: isPublic ? 'Public passport link switched on' : 'Public passport link switched off' });
  res.json({ share: await shareOf(req.user.id) });
});

/** Replace the link, for example after sharing it with the wrong person. Old links and QR codes stop working. */
router.post('/me/new-link', authenticate, requireRole('apprentice'), async (req, res) => {
  await query('UPDATE apprentice_profiles SET passport_token = $2 WHERE user_id = $1', [req.user.id, newToken()]);
  await logAudit({ query }, { actor: req.user, action: 'passport.link_replaced', target: req.user.id, detail: 'Old passport link and QR code stopped working' });
  res.json({ share: await shareOf(req.user.id) });
});

// ---------------------------------------------------------------------------
// Signed-in people who may see a passport without its link: the apprentice's own trainer and administrators
// ---------------------------------------------------------------------------

router.get('/people/:apprenticeId', authenticate, async (req, res) => {
  const { apprenticeId } = req.params;
  const own = (await query('SELECT trainer_id FROM apprentice_profiles WHERE user_id = $1', [apprenticeId])).rows[0];
  const allowed = own && (req.user.role === 'admin' || req.user.id === apprenticeId || (req.user.role === 'trainer' && own.trainer_id === req.user.id));
  if (!allowed) throw notFound();
  const passport = await buildPassport(apprenticeId);
  if (!passport) throw notFound();
  res.json({ passport });
});

// ---------------------------------------------------------------------------
// Public: anyone with the link. The link is random (128 bits), so passports cannot be found by guessing IDs.
// ---------------------------------------------------------------------------

router.get('/:token', async (req, res) => {
  const { token } = req.params;
  if (!TOKEN_PATTERN.test(token)) throw notFound();
  const row = (await query('SELECT user_id FROM apprentice_profiles WHERE passport_token = $1 AND passport_public', [token])).rows[0];
  if (!row) throw notFound();
  const passport = await buildPassport(row.user_id);
  if (!passport) throw notFound();
  res.json({ passport });
});

export default router;
