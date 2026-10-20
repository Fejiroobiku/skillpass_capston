import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { sealPending } from './lib/auditChain.js';
import { deliverPending } from './lib/deliveries.js';

const app = await createApp();
const server = app.listen(config.port, () => {
  console.log(`SkillPass API listening on port ${config.port} (${config.env})`);
});

// Entries are normally sealed straight after they are written; this catches any that were missed.
const seal = () => sealPending(pool).catch((err) => console.error('Could not seal audit log entries:', err.message));
void seal();
setInterval(seal, 30_000).unref();

// Send queued SMS and email notifications when a real provider is configured (SMS_PROVIDER / EMAIL_PROVIDER).
const deliver = () => deliverPending(pool).catch((err) => console.error('Could not send notifications:', err.message));
setInterval(deliver, 30_000).unref();

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
