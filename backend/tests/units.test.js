/**
 * Unit tests for the domain classes: no database or server needed.
 *   signed evidence links, job matching, trust score, risk rules, message channels
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://unused/skillpass_test';
process.env.JWT_SECRET = 'test-jwt-secret-test-jwt-secret-test-jwt-secret';
process.env.SIGNING_KEY = 'test-signing-key-test-signing-key-test-signing-key';

const { SignedUrlSigner } = await import('../src/lib/signedUrls.js');
const { JobMatcher, distanceKm } = await import('../src/lib/matching.js');
const { TrustScoreCalculator, RiskAssessor, RiskRule, FastIssuingRule, ClusteredDayRule } = await import('../src/lib/scoring.js');
const { MessageChannel, ConsoleChannel, TermiiSmsChannel, DeliveryError, createSmsChannel, createEmailChannel } = await import('../src/lib/messaging.js');
const { EvidenceStore } = await import('../src/lib/storage.js');

/* ------------------------------------------------------------------ signed links */

describe('SignedUrlSigner: expiring evidence links', () => {
  let clock = Date.UTC(2026, 9, 25, 12, 0, 20); // 20 s past the minute, so +10 s stays in the same minute
  const signer = new SignedUrlSigner('secret-one', 30 * 60, () => clock);
  const parse = (url) => Object.fromEntries(new URL(url, 'http://x').searchParams);

  it('accepts a link it signed', () => {
    const { exp, sig } = parse(signer.sign('/uploads/a.jpg'));
    assert.equal(signer.check('/uploads/a.jpg', exp, sig), 'ok');
  });

  it('rejects the same signature on a different file', () => {
    const { exp, sig } = parse(signer.sign('/uploads/a.jpg'));
    assert.equal(signer.check('/uploads/b.jpg', exp, sig), 'invalid');
  });

  it('rejects a link whose expiry was pushed later', () => {
    const { exp, sig } = parse(signer.sign('/uploads/a.jpg'));
    assert.equal(signer.check('/uploads/a.jpg', String(Number(exp) + 3600), sig), 'invalid');
  });

  it('reports expired links once the time has passed', () => {
    const { exp, sig } = parse(signer.sign('/uploads/a.jpg'));
    const saved = clock;
    clock += 31 * 60 * 1000 + 60 * 1000;
    assert.equal(signer.check('/uploads/a.jpg', exp, sig), 'expired');
    clock = saved;
  });

  it('rejects missing or malformed parameters', () => {
    assert.equal(signer.check('/uploads/a.jpg', undefined, undefined), 'invalid');
    assert.equal(signer.check('/uploads/a.jpg', '12abc', 'x'), 'invalid');
    assert.equal(signer.check('/uploads/a.jpg', ['1', '2'], 'x'), 'invalid');
  });

  it('does not accept links signed with another secret', () => {
    const other = new SignedUrlSigner('secret-two', 1800, () => clock);
    const { exp, sig } = parse(other.sign('/uploads/a.jpg'));
    assert.equal(signer.check('/uploads/a.jpg', exp, sig), 'invalid');
  });

  it('reuses the same link within a minute so browsers can cache it', () => {
    const a = signer.sign('/uploads/a.jpg');
    clock += 10 * 1000;
    const b = signer.sign('/uploads/a.jpg');
    assert.equal(a, b);
  });

  it('refuses a missing secret or non-positive lifetime', () => {
    assert.throws(() => new SignedUrlSigner('', 60), TypeError);
    assert.throws(() => new SignedUrlSigner('s', 0), RangeError);
  });

  it('EvidenceStore is abstract', () => {
    assert.throws(() => new EvidenceStore(signer), TypeError);
  });
});

/* ------------------------------------------------------------------ job matching */

describe('JobMatcher: ranking apprentices for a job', () => {
  const ajah = { lat: 6.4698, lng: 3.5852 };
  const agungi = { lat: 6.4389, lng: 3.5105 };
  const yaba = { lat: 6.5095, lng: 3.3711 };
  const job = { skillIds: ['s1', 's2'], location: ajah };

  it('computes great-circle distance (Ajah to Agungi is about 9 km)', () => {
    const km = distanceKm(ajah, agungi);
    assert.ok(km > 8 && km < 10, `got ${km}`);
    assert.equal(distanceKm(ajah, ajah), 0);
  });

  it('ranks by skills first, then distance, and leaves out people with no matching skill', () => {
    const ranked = new JobMatcher().rank(job, [
      { id: 'near-one-skill', location: ajah, verified: new Set(['s1']) },
      { id: 'far-both-skills', location: yaba, verified: new Set(['s1', 's2']) },
      { id: 'near-both-skills', location: agungi, verified: new Set(['s1', 's2']) },
      { id: 'no-skills', location: ajah, verified: new Set(['s9']) },
    ]);
    assert.deepEqual(ranked.map((m) => m.id), ['near-both-skills', 'far-both-skills', 'near-one-skill']);
    assert.equal(ranked[0].matched, 2);
  });

  it('gives 100 for every skill at the same spot', () => {
    assert.equal(new JobMatcher().score(job, { id: 'a', location: ajah, verified: new Set(['s1', 's2']) }).score, 100);
  });

  it('caps the distance score at zero beyond maxKm', () => {
    const m = new JobMatcher({ maxKm: 1 });
    assert.equal(m.score(job, { id: 'a', location: yaba, verified: new Set(['s1', 's2']) }).score, 70);
  });

  it('rejects weights that do not add up to 1', () => {
    assert.throws(() => new JobMatcher({ skillWeight: 0.9, distanceWeight: 0.3 }), RangeError);
  });
});

/* ------------------------------------------------------------------ trust score */

describe('TrustScoreCalculator', () => {
  const calc = new TrustScoreCalculator();
  const creds = [{ id: 'c1', status: 'valid', evidenceCount: 1 }, { id: 'c2', status: 'valid', evidenceCount: 1 }];

  it('gives a new trainer a neutral score of 86', () => {
    assert.equal(calc.compute({ credentials: creds, flags: [], feedback: [], samples: [] }).score, 86);
  });

  it('applies the penalty for two or more poor ratings', () => {
    const feedback = [{ rating: 1, credentialIds: ['c1'] }, { rating: 2, credentialIds: ['c2'] }];
    const r = calc.compute({ credentials: creds, flags: [], feedback, samples: [] });
    assert.equal(r.ratingPenalty, 16);
    assert.equal(r.poorRatings, 2);
  });

  it('caps the score at 10 after proven misconduct', () => {
    assert.equal(calc.compute({ credentials: creds, flags: [], feedback: [], samples: [], misconduct: true }).score, 10);
  });

  it('counts revoked credentials as flagged', () => {
    const r = calc.compute({ credentials: [...creds, { id: 'c3', status: 'revoked', evidenceCount: 1 }], flags: [], feedback: [], samples: [] });
    assert.ok(Math.abs(r.flaggedShare - 1 / 3) < 1e-9);
  });

  it('rejects weights that do not add up to 1', () => {
    assert.throws(() => new TrustScoreCalculator({ audit: 0.5, rating: 0.5, clean: 0.5 }), RangeError);
  });
});

/* ------------------------------------------------------------------ risk rules */

describe('RiskAssessor and its rules', () => {
  const settings = { fastMinutes: 10, clusterThreshold: 3, probationCount: 5 };
  const at = (h, m) => `2026-09-10T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+01:00`;
  const cred = (id, issuedAt) => ({ id, issuedAt, status: 'valid' });

  it('flags credentials signed minutes apart, in any input order', () => {
    const r = new FastIssuingRule().evaluate({ sorted: [cred('a', at(9, 0)), cred('b', at(9, 4)), cred('c', at(11, 0))], settings });
    assert.equal(r.id, 'fast');
    assert.match(r.detail, /^1 credential signed/);
  });

  it('counts credentials per Lagos calendar day', () => {
    const late = '2026-09-10T23:30:00+01:00';
    const nextDayUtc = '2026-09-10T23:30:00Z'; // 00:30 on the 11th in Lagos
    const rule = new ClusteredDayRule('Africa/Lagos');
    assert.equal(rule.dayOf(late), '2026-09-10');
    assert.equal(rule.dayOf(nextDayUtc), '2026-09-11');
  });

  it('rates two or more signals as high risk', () => {
    const credentials = [cred('a', at(9, 0)), cred('b', at(9, 2)), cred('c', at(9, 5))];
    const r = new RiskAssessor().assess({ credentials, notYetCount: 0, feedback: [], openReportCount: 1, settings });
    assert.deepEqual(r.signals.map((s) => s.id), ['fast', 'cluster', 'reports']);
    assert.equal(r.level, 'high');
    assert.equal(r.onProbation, true);
  });

  it('runs any rule it is given (polymorphism)', () => {
    class NightShiftRule extends RiskRule {
      constructor() { super('night', 'Issued at night'); }
      evaluate({ sorted }) { return sorted.some((c) => new Date(c.issuedAt).getUTCHours() < 4) ? this.signal('Issued between midnight and 5am') : null; }
    }
    const r = new RiskAssessor([new NightShiftRule()]).assess({ credentials: [cred('a', '2026-09-10T02:00:00Z')], notYetCount: 0, feedback: [], openReportCount: 0, settings });
    assert.deepEqual(r.signals.map((s) => s.id), ['night']);
    assert.equal(r.level, 'medium');
  });

  it('cannot create the abstract base rule', () => {
    assert.throws(() => new RiskRule('x', 'y'), TypeError);
  });
});

/* ------------------------------------------------------------------ message channels */

describe('MessageChannel family', () => {
  it('cannot create the abstract base channel', () => {
    assert.throws(() => new MessageChannel('x'), TypeError);
  });

  it('console channel prints SMS and email and says it is console-only', async () => {
    const lines = [];
    const sms = new ConsoleChannel('sms', (l) => lines.push(l));
    await sms.send({ to: '+2348031234567', text: 'Your code is 123456' });
    assert.equal(lines[0], '[sms → +2348031234567] Your code is 123456');
    assert.equal(sms.isConsole, true);
  });

  it('refuses messages without a recipient or text', async () => {
    const ch = new ConsoleChannel('sms', () => {});
    await assert.rejects(ch.send({ to: '', text: 'x' }), DeliveryError);
    await assert.rejects(ch.send({ to: '+234', text: '' }), DeliveryError);
  });

  it('Termii channel posts the number without "+" and turns HTTP errors into DeliveryError', async () => {
    const realFetch = globalThis.fetch;
    const calls = [];
    try {
      globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({}) }; };
      const ch = new TermiiSmsChannel({ apiKey: 'k', senderId: 'SkillPass', baseUrl: 'https://termii.test', channel: 'dnd' });
      await ch.send({ to: '+2348031234567', text: 'hello' });
      assert.equal(calls[0].url, 'https://termii.test/api/sms/send');
      assert.equal(calls[0].body.to, '2348031234567');
      assert.equal(ch.isConsole, false);

      globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => 'bad key' });
      const quiet = console.error;
      console.error = () => {};
      try {
        await assert.rejects(ch.send({ to: '+2348031234567', text: 'hello' }), DeliveryError);
      } finally {
        console.error = quiet;
      }
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('factories pick the channel named in the configuration', () => {
    assert.ok(createSmsChannel({ smsProvider: 'console' }) instanceof ConsoleChannel);
    assert.ok(createSmsChannel({ smsProvider: 'termii', termii: { apiKey: 'k', senderId: 's', baseUrl: 'u', channel: 'dnd' } }) instanceof TermiiSmsChannel);
    assert.ok(createEmailChannel({ emailProvider: 'console' }) instanceof ConsoleChannel);
  });
});

/* ------------------------------------------------------------------ payments */

const { PaymentGateway, PaystackGateway, SimulatedGateway, toKobo, createPaymentGateway } = await import('../src/lib/payments.js');
const { createHmac } = await import('node:crypto');

/** A stand-in for fetch that records each request and answers like Paystack. */
function fakePaystack(answers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = url.replace('https://api.paystack.co', '');
    calls.push({ path, method: init.method, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.authorization });
    const key = Object.keys(answers).find((k) => path.startsWith(k));
    const data = answers[key];
    return { ok: data !== undefined, status: data === undefined ? 400 : 200, json: async () => (data === undefined ? { status: false, message: 'Bad request' } : { status: true, data }) };
  };
  return { calls, fetchImpl };
}

describe('PaymentGateway: escrow providers', () => {
  it('cannot be used without a subclass', () => {
    assert.throws(() => new PaymentGateway('x'), TypeError);
  });

  it('converts naira to kobo for Paystack', () => {
    assert.equal(toKobo(76000), 7600000);
  });

  it('starts a Paystack checkout in kobo with the secret key, and reads back the result', async () => {
    const { calls, fetchImpl } = fakePaystack({
      '/transaction/initialize': { authorization_url: 'https://checkout.paystack.com/abc' },
      '/transaction/verify/': { status: 'success', amount: 7600000 },
    });
    const gw = new PaystackGateway({ secretKey: 'sk_test_123', fetchImpl });
    assert.equal(gw.isTestMode, true);
    const { checkoutUrl } = await gw.startCheckout({ reference: 'sp-dep-1', amount: 76000, email: 'e@x.ng', callbackUrl: 'http://app/pay/sp-dep-1' });
    assert.equal(checkoutUrl, 'https://checkout.paystack.com/abc');
    assert.deepEqual({ amount: calls[0].body.amount, currency: calls[0].body.currency, reference: calls[0].body.reference }, { amount: 7600000, currency: 'NGN', reference: 'sp-dep-1' });
    assert.equal(calls[0].auth, 'Bearer sk_test_123');
    assert.deepEqual(await gw.confirm('sp-dep-1'), { paid: true, amount: 76000 });
  });

  it('pays an artisan by creating a transfer recipient once, then a transfer', async () => {
    const { calls, fetchImpl } = fakePaystack({ '/transferrecipient': { recipient_code: 'RCP_1' }, '/transfer': { status: 'success' } });
    const gw = new PaystackGateway({ secretKey: 'sk_test_123', fetchImpl });
    const out = await gw.payout({ account: { bankCode: '058', accountNumber: '0123456789', accountName: 'Tobi' }, amount: 48000, reference: 'sp-out-1', reason: 'SkillPass job' });
    assert.deepEqual(out, { status: 'succeeded', recipientCode: 'RCP_1' });
    assert.deepEqual(calls.map((c) => c.path), ['/transferrecipient', '/transfer']);
    assert.equal(calls[1].body.amount, 4800000);
    await gw.payout({ account: { bankCode: '058', accountNumber: '0123456789', accountName: 'Tobi', recipientCode: 'RCP_1' }, amount: 1, reference: 'sp-out-2', reason: 'x' });
    assert.equal(calls.length, 3); // no second recipient
  });

  it('turns a Paystack refusal into a readable PaymentError', async () => {
    const gw = new PaystackGateway({ secretKey: 'sk_test_123', fetchImpl: fakePaystack({}).fetchImpl });
    await assert.rejects(gw.refund({ depositReference: 'r', amount: 10 }), /Paystack: Bad request/);
  });

  it('accepts only webhooks signed with the secret key', () => {
    const gw = new PaystackGateway({ secretKey: 'sk_test_123', fetchImpl: async () => ({}) });
    const body = Buffer.from('{"event":"charge.success","data":{"reference":"sp-dep-1"}}');
    const good = createHmac('sha512', 'sk_test_123').update(body).digest('hex');
    assert.equal(gw.verifyWebhook(body, good), true);
    assert.equal(gw.verifyWebhook(body, good.replace(/.$/, (c) => (c === '0' ? '1' : '0'))), false);
    assert.equal(gw.verifyWebhook(Buffer.from('{"tampered":true}'), good), false);
    assert.equal(gw.verifyWebhook(body, undefined), false);
  });

  it('simulates payments without moving money', async () => {
    const gw = new SimulatedGateway({ appUrl: 'http://app' });
    assert.equal(gw.isSimulated, true);
    assert.equal((await gw.startCheckout({ reference: 'sp-dep-9' })).checkoutUrl, 'http://app/pay/sp-dep-9');
    assert.deepEqual(await gw.confirm('sp-dep-9'), { paid: false, amount: 0 });
    gw.markPaid('sp-dep-9', 500);
    assert.deepEqual(await gw.confirm('sp-dep-9'), { paid: true, amount: 500 });
  });

  it('is chosen from the config', () => {
    assert.ok(createPaymentGateway({ paymentProvider: 'simulated', appUrl: 'http://app' }) instanceof SimulatedGateway);
    assert.ok(createPaymentGateway({ paymentProvider: 'paystack', paystack: { secretKey: 'sk_test_1' } }) instanceof PaystackGateway);
  });
});
