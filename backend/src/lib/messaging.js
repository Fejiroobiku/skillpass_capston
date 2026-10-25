import { config } from '../config.js';

/**
 * Sending texts and emails, through a channel chosen in .env:
 *
 *   SMS_PROVIDER=console   (default) print the message in the server terminal; nothing is sent
 *   SMS_PROVIDER=termii    send through Termii: TERMII_API_KEY, TERMII_SENDER_ID, TERMII_BASE_URL, TERMII_CHANNEL
 *
 *   EMAIL_PROVIDER=console (default) print the email in the server terminal; nothing is sent
 *   EMAIL_PROVIDER=resend  send through Resend: RESEND_API_KEY, EMAIL_FROM
 *
 * Design: every channel extends MessageChannel and implements deliver(). Callers only ever call send(),
 * so adding a provider (for example Africa's Talking) means adding one subclass and one line in the factory.
 *
 * In Nigeria, texts to numbers on Do-Not-Disturb only arrive through a transactional ("dnd") route with a
 * sender ID each network has approved, which can take weeks. Until then keep SMS_PROVIDER=console for demos.
 */

export class DeliveryError extends Error {}

/** Abstract base: shared validation and error handling; subclasses decide how a message actually travels. */
export class MessageChannel {
  /** @param {string} name  shown in logs */
  constructor(name) {
    if (new.target === MessageChannel) throw new TypeError('MessageChannel is abstract; use a subclass.');
    this.name = name;
  }

  /** True when messages are only printed, so the API may show codes on screen in development. */
  get isConsole() {
    return false;
  }

  /** @param {{to: string, subject?: string, text: string}} message */
  async send(message) {
    if (!message.to) throw new DeliveryError('No recipient for this message.');
    if (!message.text) throw new DeliveryError('Message has no text.');
    return this.deliver(message);
  }

  // eslint-disable-next-line no-unused-vars
  async deliver(message) {
    throw new TypeError(`${this.constructor.name} must implement deliver().`);
  }
}

/** Base for channels that call an HTTP API. */
export class HttpChannel extends MessageChannel {
  async postJson(url, body, headers = {}) {
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    } catch {
      throw new DeliveryError('The message service could not be reached. Please try again.');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`${this.name} refused the request (${res.status}): ${text.slice(0, 300)}`);
      throw new DeliveryError('The message could not be sent. Please try again in a moment.');
    }
    return res.json().catch(() => ({}));
  }
}

/** Prints messages to the terminal. Used for development, demos and tests. */
export class ConsoleChannel extends MessageChannel {
  constructor(kind, log = console.log) {
    super(`console-${kind}`);
    this.kind = kind;
    this.log = log;
  }

  get isConsole() {
    return true;
  }

  async deliver({ to, subject, text }) {
    this.log(this.kind === 'email' ? `[email → ${to}] ${subject}\n${text}` : `[sms → ${to}] ${text}`);
  }
}

/** SMS through Termii (https://developers.termii.com). */
export class TermiiSmsChannel extends HttpChannel {
  constructor({ apiKey, senderId, baseUrl, channel }) {
    super('Termii');
    this.settings = { apiKey, senderId, baseUrl, channel };
  }

  async deliver({ to, text }) {
    const t = this.settings;
    // Termii wants the number without the leading "+".
    await this.postJson(`${t.baseUrl}/api/sms/send`, { api_key: t.apiKey, to: to.replace(/^\+/, ''), from: t.senderId, sms: text, type: 'plain', channel: t.channel });
  }
}

/** Email through Resend (https://resend.com/docs). */
export class ResendEmailChannel extends HttpChannel {
  constructor({ apiKey, from }) {
    super('Resend');
    this.apiKey = apiKey;
    this.from = from;
  }

  async deliver({ to, subject, text }) {
    await this.postJson('https://api.resend.com/emails', { from: this.from, to: [to], subject, text }, { authorization: `Bearer ${this.apiKey}` });
  }
}

/** Factory: picks the channel named in the configuration. */
export function createSmsChannel(cfg = config) {
  return cfg.smsProvider === 'termii' ? new TermiiSmsChannel(cfg.termii) : new ConsoleChannel('sms');
}

export function createEmailChannel(cfg = config) {
  return cfg.emailProvider === 'resend' ? new ResendEmailChannel({ apiKey: cfg.resendApiKey, from: cfg.emailFrom }) : new ConsoleChannel('email');
}

let smsChannel;
let emailChannel;
const sms = () => (smsChannel ??= createSmsChannel());
const email = () => (emailChannel ??= createEmailChannel());

/** When texts are only printed, the API may also show the code on screen so the app can be demonstrated. Never in production. */
export const showSmsCode = () => config.env !== 'production' && sms().isConsole;
/** Same for email links. */
export const showEmailLink = () => config.env !== 'production' && email().isConsole;

/** Send one text message. `to` is +234XXXXXXXXXX. */
export const sendSms = (to, text) => sms().send({ to, text });

/** Send one plain-text email. */
export const sendEmail = (to, subject, text) => email().send({ to, subject, text });
