import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { pool } from './db.js';
import { ensureDirs, evidenceStore } from './lib/storage.js';
import { errorHandler, notFound } from './middleware/errors.js';
import adminRoutes from './routes/admin.js';
import agreementRoutes from './routes/agreements.js';
import attemptRoutes from './routes/attempts.js';
import bootstrapRoutes from './routes/bootstrap.js';
import feedbackRoutes from './routes/feedback.js';
import jobRoutes from './routes/jobs.js';
import passportRoutes from './routes/passport.js';
import skillRoutes from './routes/skills.js';
import susRoutes from './routes/sus.js';
import authRoutes from './routes/auth.js';
import credentialRoutes from './routes/credentials.js';
import evidenceRoutes from './routes/evidence.js';
import notificationRoutes from './routes/notifications.js';
import referenceRoutes from './routes/reference.js';
import reportRoutes from './routes/reports.js';
import trainerRoutes from './routes/trainer.js';
import verifyRoutes from './routes/verify.js';
import verificationRoutes from './routes/verification.js';

const limiter = (windowMs, limit) => rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => config.env === 'test' });

export async function createApp() {
  await ensureDirs();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // one proxy hop (Render), so rate limits see the real client IP

  // The frontend lives on another origin, so uploaded evidence must be embeddable cross-origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigins }));
  // The raw bytes are kept so payment webhooks can check the provider's signature over exactly what was sent.
  app.use(express.json({ limit: '100kb', verify: (req, res, buf) => { req.rawBody = buf; } }));

  app.get('/api/health', async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  });

  // Evidence is private: only signed, unexpired links are served.
  app.use('/uploads', evidenceStore.guard(), express.static(config.uploadDir, {
    index: false,
    cacheControl: false, // set by the guard: private, until the link expires
    dotfiles: 'deny',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }));

  app.use('/api/auth/login', limiter(15 * 60 * 1000, 20));
  app.use('/api/auth/register', limiter(60 * 60 * 1000, 10));
  app.use('/api/auth/password', limiter(60 * 60 * 1000, 10));
  app.use('/api/auth/phone', limiter(15 * 60 * 1000, 30));
  app.use('/api/auth/email', limiter(15 * 60 * 1000, 20));

  app.use('/api/auth', authRoutes);
  app.use('/api/auth', verificationRoutes);
  app.use('/api', referenceRoutes);
  app.use('/api/verify', verifyRoutes);
  app.use('/api/passport', passportRoutes);
  app.use('/api/bootstrap', bootstrapRoutes);
  app.use('/api/feedback', feedbackRoutes);
  app.use('/api/skills', skillRoutes);
  app.use('/api/sus', susRoutes);
  app.use('/api', jobRoutes);
  app.use('/api', agreementRoutes);
  app.use('/api/evidence', evidenceRoutes);
  app.use('/api/credentials', credentialRoutes);
  app.use('/api/attempts', attemptRoutes);
  app.use('/api/trainer', trainerRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
