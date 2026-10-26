import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * Escrow payments for jobs, through a gateway chosen in .env:
 *
 *   PAYMENT_PROVIDER=simulated  (default) no money moves. A test checkout page lets the employer "pay", and payouts
 *                               and refunds are recorded as if they succeeded. For demos and automated tests.
 *   PAYMENT_PROVIDER=paystack   Paystack: PAYSTACK_SECRET_KEY. Only test keys (sk_test_…) are accepted unless
 *                               PAYSTACK_ALLOW_LIVE=true, so the pilot cannot take real money by accident.
 *
 * How escrow works with Paystack: the employer pays SkillPass's Paystack balance through Paystack Checkout. The
 * money stays there (held) until the job is confirmed or an administrator decides a dispute; then SkillPass sends
 * the artisan's share with a Paystack Transfer and refunds the rest to the employer's card with a Paystack Refund.
 *
 * Design: every gateway extends PaymentGateway. Routes only call these methods, so another provider (Flutterwave,
 * say) means one more subclass and one line in createPaymentGateway().
 */

export class PaymentError extends Error {}

/** Naira to kobo. Amounts in SkillPass are whole naira; Paystack counts in kobo. */
export const toKobo = (naira) => Math.round(naira * 100);

/** A unique, unguessable payment reference. */
export const paymentReference = (prefix) => `sp-${prefix}-${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`;

export class PaymentGateway {
  /** @param {string} name  'simulated' or 'paystack', stored with every payment */
  constructor(name) {
    if (new.target === PaymentGateway) throw new TypeError('PaymentGateway is abstract; use a subclass.');
    this.name = name;
  }

  /** True when no real money moves. */
  get isSimulated() {
    return false;
  }

  /** True when this gateway uses test keys (Paystack test mode) or moves no money at all. */
  get isTestMode() {
    return true;
  }

  /**
   * Start a payment into escrow. Returns the page the employer must open to pay.
   * @param {{reference: string, amount: number, email: string, callbackUrl: string, metadata?: object}} input
   * @returns {Promise<{checkoutUrl: string}>}
   */
  // eslint-disable-next-line no-unused-vars
  async startCheckout(input) {
    throw new TypeError(`${this.constructor.name} must implement startCheckout().`);
  }

  /**
   * Ask the provider whether a payment really went through, and for how much (naira).
   * @returns {Promise<{paid: boolean, amount: number}>}
   */
  // eslint-disable-next-line no-unused-vars
  async confirm(reference) {
    throw new TypeError(`${this.constructor.name} must implement confirm().`);
  }

  /**
   * Send money from escrow to an artisan's bank account.
   * @param {{account: {bankCode: string, accountNumber: string, accountName: string, recipientCode?: string|null},
   *          amount: number, reference: string, reason: string}} input
   * @returns {Promise<{status: 'succeeded'|'pending', recipientCode?: string}>}
   */
  // eslint-disable-next-line no-unused-vars
  async payout(input) {
    throw new TypeError(`${this.constructor.name} must implement payout().`);
  }

  /**
   * Return money from escrow to the employer.
   * @param {{depositReference: string, amount: number}} input
   * @returns {Promise<{status: 'succeeded'|'pending'}>}
   */
  // eslint-disable-next-line no-unused-vars
  async refund(input) {
    throw new TypeError(`${this.constructor.name} must implement refund().`);
  }

  /** Check that a webhook really came from the provider. */
  // eslint-disable-next-line no-unused-vars
  verifyWebhook(rawBody, signature) {
    return false;
  }

  /** Banks an artisan can be paid into. */
  async banks() {
    return NIGERIAN_BANKS;
  }
}

/** No money moves. The employer "pays" on SkillPass's own test checkout page. */
export class SimulatedGateway extends PaymentGateway {
  constructor({ appUrl }) {
    super('simulated');
    this.appUrl = appUrl;
    this.paid = new Map(); // reference -> amount, set by markPaid() from the test checkout page
  }

  get isSimulated() {
    return true;
  }

  async startCheckout({ reference }) {
    return { checkoutUrl: `${this.appUrl}/pay/${encodeURIComponent(reference)}` };
  }

  /** Called by the test checkout page when the employer presses "Pay". */
  markPaid(reference, amount) {
    this.paid.set(reference, amount);
  }

  async confirm(reference) {
    return this.paid.has(reference) ? { paid: true, amount: this.paid.get(reference) } : { paid: false, amount: 0 };
  }

  async payout() {
    return { status: 'succeeded' };
  }

  async refund() {
    return { status: 'succeeded' };
  }
}

/** Paystack (https://paystack.com/docs/api). Amounts are sent in kobo. */
export class PaystackGateway extends PaymentGateway {
  /**
   * @param {{secretKey: string, baseUrl?: string, fetchImpl?: typeof fetch}} options
   *   fetchImpl lets the tests check the requests without reaching Paystack.
   */
  constructor({ secretKey, baseUrl = 'https://api.paystack.co', fetchImpl = globalThis.fetch }) {
    super('paystack');
    if (!secretKey) throw new TypeError('PaystackGateway needs a secret key.');
    this.secretKey = secretKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
  }

  get isTestMode() {
    return this.secretKey.startsWith('sk_test_');
  }

  async request(method, path, body) {
    let res;
    try {
      res = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${this.secretKey}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new PaymentError('Paystack could not be reached. Please try again.');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.status) {
      console.error(`Paystack refused ${method} ${path} (${res.status}): ${data?.message ?? ''}`);
      throw new PaymentError(data?.message ? `Paystack: ${data.message}` : 'The payment service refused the request. Please try again.');
    }
    return data.data;
  }

  async startCheckout({ reference, amount, email, callbackUrl, metadata = {} }) {
    const data = await this.request('POST', '/transaction/initialize', {
      email, amount: toKobo(amount), currency: 'NGN', reference, callback_url: callbackUrl, metadata,
    });
    return { checkoutUrl: data.authorization_url };
  }

  async confirm(reference) {
    const data = await this.request('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    return { paid: data.status === 'success', amount: Math.round(Number(data.amount) / 100) };
  }

  async payout({ account, amount, reference, reason }) {
    let recipientCode = account.recipientCode;
    if (!recipientCode) {
      const recipient = await this.request('POST', '/transferrecipient', {
        type: 'nuban', name: account.accountName, account_number: account.accountNumber, bank_code: account.bankCode, currency: 'NGN',
      });
      recipientCode = recipient.recipient_code;
    }
    const transfer = await this.request('POST', '/transfer', {
      source: 'balance', amount: toKobo(amount), recipient: recipientCode, reason, reference,
    });
    return { status: transfer.status === 'success' ? 'succeeded' : 'pending', recipientCode };
  }

  async refund({ depositReference, amount }) {
    // Paystack accepts the refund at once and returns the money to the card within a few working days.
    await this.request('POST', '/refund', { transaction: depositReference, amount: toKobo(amount) });
    return { status: 'succeeded' };
  }

  /** Paystack signs each webhook body with HMAC-SHA512 using the secret key, in the x-paystack-signature header. */
  verifyWebhook(rawBody, signature) {
    if (!rawBody || typeof signature !== 'string') return false;
    const expected = Buffer.from(createHmac('sha512', this.secretKey).update(rawBody).digest('hex'));
    const given = Buffer.from(signature);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  async banks() {
    const data = await this.request('GET', '/bank?country=nigeria&currency=NGN&perPage=100');
    return data.map((b) => ({ code: b.code, name: b.name }));
  }
}

/** Common Nigerian banks with their Paystack bank codes. Used when Paystack is not connected. */
export const NIGERIAN_BANKS = [
  { code: '044', name: 'Access Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '058', name: 'Guaranty Trust Bank' },
  { code: '50211', name: 'Kuda Bank' },
  { code: '50515', name: 'Moniepoint MFB' },
  { code: '999992', name: 'OPay' },
  { code: '999991', name: 'PalmPay' },
  { code: '232', name: 'Sterling Bank' },
  { code: '033', name: 'United Bank for Africa' },
  { code: '035', name: 'Wema Bank' },
  { code: '057', name: 'Zenith Bank' },
];

export function createPaymentGateway(cfg = config) {
  if (cfg.paymentProvider === 'paystack') return new PaystackGateway({ secretKey: cfg.paystack.secretKey, baseUrl: cfg.paystack.baseUrl });
  return new SimulatedGateway({ appUrl: cfg.appUrl });
}

export const paymentGateway = createPaymentGateway();
