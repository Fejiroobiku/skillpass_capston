import { config } from '../config.js';
import { sendEmail, sendSms } from './messaging.js';

/**
 * Send queued SMS and email notifications (for example "Please confirm your skill"), which lib/audit.js notify()
 * stores with delivered_at = NULL. Only runs when a real provider is configured; in console mode they stay in-app.
 * Texts only go to confirmed phone numbers, and emails only to confirmed addresses.
 */
export async function deliverPending(pool) {
  const channels = [config.smsProvider !== 'console' && 'sms', config.emailProvider !== 'console' && 'email'].filter(Boolean);
  if (!channels.length) return 0;
  const { rows } = await pool.query(
    `SELECT n.id, n.channel, n.title, n.body, u.phone_e164, u.phone_verified_at, u.email, u.email_verified_at
       FROM notifications n JOIN users u ON u.id = n.user_id
      WHERE n.delivered_at IS NULL AND n.channel = ANY($1) AND n.at > now() - interval '1 day' AND u.status = 'active'
      ORDER BY n.at LIMIT 50`,
    [channels],
  );
  let sent = 0;
  for (const n of rows) {
    try {
      if (n.channel === 'sms' && n.phone_e164 && n.phone_verified_at) await sendSms(n.phone_e164, `SkillPass: ${n.title}. ${n.body}`.slice(0, 300));
      else if (n.channel === 'email' && n.email_verified_at) await sendEmail(n.email, `SkillPass: ${n.title}`, `${n.body}\n\nOpen SkillPass: ${config.appUrl}\n`);
      else continue; // not confirmed: leave it in the app only
      await pool.query('UPDATE notifications SET delivered_at = now() WHERE id = $1', [n.id]);
      sent += 1;
    } catch (err) {
      console.error(`Could not deliver notification ${n.id}:`, err.message);
      break; // the provider is struggling; try again on the next run
    }
  }
  return sent;
}
