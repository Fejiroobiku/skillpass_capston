import { config } from '../config.js';

/**
 * Sending texts and emails, through a driver chosen in .env:
 *
 *   SMS_PROVIDER=console   (default) print the message in the server terminal; nothing is sent
 *   SMS_PROVIDER=termii    send through Termii: TERMII_API_KEY, TERMII_SENDER_ID, TERMII_BASE_URL, TERMII_CHANNEL
 *
 *   EMAIL_PROVIDER=console (default) print the email in the server terminal; nothing is sent
 *   EMAIL_PROVIDER=resend  send through Resend: RESEND_API_KEY, EMAIL_FROM
 *
 * In Nigeria, texts to numbers on Do-Not-Disturb only arrive through a transactional ("dnd") route with a
 * sender ID each network has approved, which can take weeks. Until then keep SMS_PROVIDER=console for demos.
 */

export class DeliveryError extends Error {}

/** When texts are only printed, the API may also show the code on screen so the app can be demonstrated. Never in production. */
export const showSmsCode = () => config.env !== 'production' && config.smsProvider === 'console';
/** Same for email links. */
export const showEmailLink = () => config.env !== 'production' && config.emailProvider === 'console';

async function postJson(url, body, headers = {}) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  } catch {
    throw new DeliveryError('The message service could not be reached. Please try again.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`Message service refused the request (${res.status}): ${text.slice(0, 300)}`);
    throw new DeliveryError('The message could not be sent. Please try again in a moment.');
  }
  return res.json().catch(() => ({}));
}

/** Send one text message. `to` is +234XXXXXXXXXX. */
export async function sendSms(to, text) {
  if (config.smsProvider === 'termii') {
    const t = config.termii;
    // Termii wants the number without the leading "+".
    await postJson(`${t.baseUrl}/api/sms/send`, { api_key: t.apiKey, to: to.replace(/^\+/, ''), from: t.senderId, sms: text, type: 'plain', channel: t.channel });
    return;
  }
  console.log(`[sms → ${to}] ${text}`);
}

/** Send one plain-text email. */
export async function sendEmail(to, subject, text) {
  if (config.emailProvider === 'resend') {
    await postJson('https://api.resend.com/emails', { from: config.emailFrom, to: [to], subject, text }, { authorization: `Bearer ${config.resendApiKey}` });
    return;
  }
  console.log(`[email → ${to}] ${subject}\n${text}`);
}
