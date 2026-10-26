/**
 * Jobs between employers and artisans: Terms of Service, quotes, job agreements, escrow payments (simulated
 * gateway), before/after photos, completion, automatic release, disputes, and artisans rating employers.
 * Same real-database setup as api.test.js.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { api, jpeg, login, pool, start, stop } from './helpers.js';

after(stop);

const t = {};
const boot = async (token) => (await api('GET', '/api/bootstrap', { token })).body;
const photo = (token, agreementId, stage, buffer = jpeg()) => {
  const form = new FormData();
  form.append('file', new Blob([buffer]), 'photo.jpg');
  form.append('stage', stage);
  form.append('locationLabel', 'Ajah');
  form.append('lat', '6.47');
  form.append('lng', '3.58');
  form.append('locationSource', 'gps');
  return api('POST', `/api/agreements/${agreementId}/photos`, { token, form });
};
const today = (days = 0) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const payments = async (agreementId) => (await pool.query('SELECT kind, amount, status FROM payments WHERE agreement_id = $1 ORDER BY created_at, kind', [agreementId])).rows;

before(async () => {
  await start();
  t.e1 = await login('folake@skillpass.ng');
  t.e2 = await login('adaeze@skillpass.ng');
  t.a1 = await login('tobi@skillpass.ng');
  t.a2 = await login('emeka@skillpass.ng');
  t.t1 = await login('babatunde@skillpass.ng');
  t.admin = await login('admin@skillpass.ng');
});

describe('Terms of Service', () => {
  it('has a current version, and registration requires accepting it', async () => {
    const v = (await api('GET', '/api/terms')).body.version;
    assert.match(v, /^\d{4}-\d{2}-v\d+$/);
    const body = {
      role: 'employer', name: 'Uche Builders', email: 'uche.terms@example.com', phone: '0803 555 1201', password: 'a-good-password',
      dob: '1985-01-01', trade: 'electrical', company: 'Uche Builders', consent: true, location: { name: 'Ikeja', lat: 6.6, lng: 3.35 },
    };
    const refused = await api('POST', '/api/auth/register', { body });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /Terms of Service/);
    const ok = await api('POST', '/api/auth/register', { body: { ...body, acceptTerms: true } });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.user.account.termsVersion, v);
    assert.equal(ok.body.user.account.termsCurrent, v);
  });

  it('records acceptance of the current version only', async () => {
    assert.equal((await api('POST', '/api/terms/accept', { token: t.a1, body: { version: 'old' } })).status, 400);
    const v = (await api('GET', '/api/terms')).body.version;
    assert.equal((await api('POST', '/api/terms/accept', { token: t.a1, body: { version: v } })).status, 200);
  });
});

describe('job prices and quotes', () => {
  it('splits a job into materials and workmanship, and refuses a materials budget when the employer buys them', async () => {
    const base = { title: 'Fit outdoor sockets at the clubhouse', skillIds: ['el-01'], location: { name: 'Ajah', lat: 6.4698, lng: 3.5852 } };
    const bad = await api('POST', '/api/jobs', { token: t.e1, body: { ...base, materialsBy: 'employer', materialsBudget: 5000, workmanshipBudget: 40000 } });
    assert.equal(bad.status, 400);
    const r = await api('POST', '/api/jobs', { token: t.e1, body: { ...base, materialsBy: 'artisan', materialsBudget: 30000, workmanshipBudget: 50000 } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.job.materialsBy, 'artisan');
    assert.match(r.body.job.pay, /₦50,000 workmanship \+ ₦30,000 materials/);
    t.job = r.body.job;
    for (const [key, id] of [['ref1', 'a1'], ['ref2', 'a2']]) {
      const ref = await api('POST', `/api/jobs/${t.job.id}/referrals`, { token: t.e1, body: { apprenticeId: id } });
      assert.equal(ref.status, 201, JSON.stringify(ref.body));
      t[key] = ref.body.referral.id;
    }
  });

  it('takes the artisan\'s quote when they say they are interested', async () => {
    const quote = { workmanship: 48000, availableFrom: today(2), note: 'Can start early.' };
    const noMaterials = await api('PATCH', `/api/referrals/${t.ref1}`, { token: t.a1, body: { status: 'accepted', quote } });
    assert.equal(noMaterials.status, 400); // this job needs the artisan to price the materials
    const ok = await api('PATCH', `/api/referrals/${t.ref1}`, { token: t.a1, body: { status: 'accepted', quote: { ...quote, materials: 28000 } } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const mine = (await boot(t.e1)).referrals.find((r) => r.id === t.ref1);
    assert.deepEqual({ w: mine.quote.workmanship, m: mine.quote.materials }, { w: 48000, m: 28000 });
    const n = (await api('GET', '/api/notifications', { token: t.e1 })).body.notifications;
    assert.ok(n.some((x) => x.title === 'New quote' && x.body.includes('₦48,000')));
    assert.equal((await api('PATCH', `/api/referrals/${t.ref2}`, { token: t.a2, body: { status: 'accepted', quote: { workmanship: 45000, materials: 30000, availableFrom: today(1) } } })).status, 200);
  });
});

describe('job agreement and escrow: the happy path', () => {
  it('needs the employer to accept the terms and to match who buys the materials', async () => {
    const offer = { referralId: t.ref1, materialsAmount: 28000, workmanshipAmount: 48000, startDate: today(2), scope: 'Fit four weatherproof sockets with an RCD at the clubhouse.' };
    assert.equal((await api('POST', '/api/agreements', { token: t.e1, body: offer })).status, 400);
    assert.equal((await api('POST', '/api/agreements', { token: t.e1, body: { ...offer, materialsAmount: 0, acceptTerms: true } })).status, 400);
    assert.equal((await api('POST', '/api/agreements', { token: t.a1, body: { ...offer, acceptTerms: true } })).status, 403);
    const r = await api('POST', '/api/agreements', { token: t.e1, body: { ...offer, acceptTerms: true } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    t.ag = r.body.id;
    assert.equal((await api('POST', '/api/agreements', { token: t.e1, body: { ...offer, acceptTerms: true } })).status, 409);
  });

  it('cannot be paid for before the artisan accepts', async () => {
    assert.equal((await api('POST', `/api/agreements/${t.ag}/checkout`, { token: t.e1 })).status, 409);
  });

  it('asks the artisan for a payout account, then records their acceptance', async () => {
    assert.equal((await api('POST', `/api/agreements/${t.ag}/accept`, { token: t.a2, body: { acceptTerms: true } })).status, 404); // not theirs
    await pool.query("DELETE FROM payout_accounts WHERE user_id = 'a1'");
    const noAccount = await api('POST', `/api/agreements/${t.ag}/accept`, { token: t.a1, body: { acceptTerms: true } });
    assert.equal(noAccount.status, 400);
    assert.equal(noAccount.body.details.reason, 'no_payout_account');
    assert.equal((await api('PUT', '/api/payout-account', { token: t.a1, body: { bankCode: '058', bankName: 'Guaranty Trust Bank', accountNumber: '12345', accountName: 'Tobi Ogunleye' } })).status, 400);
    const acct = await api('PUT', '/api/payout-account', { token: t.a1, body: { bankCode: '058', bankName: 'Guaranty Trust Bank', accountNumber: '0123456789', accountName: 'Tobi Ogunleye' } });
    assert.equal(acct.status, 200);
    assert.equal(acct.body.payoutAccount.accountLast4, '6789');
    assert.equal((await api('POST', `/api/agreements/${t.ag}/accept`, { token: t.a1, body: {} })).status, 400); // terms not accepted
    assert.equal((await api('POST', `/api/agreements/${t.ag}/accept`, { token: t.a1, body: { acceptTerms: true } })).status, 200);
    const a = (await boot(t.a1)).agreements.find((x) => x.id === t.ag);
    assert.equal(a.status, 'accepted');
    assert.ok(a.paymentReference);
    assert.equal((await boot(t.a1)).payoutAccount.accountLast4, '6789');
  });

  it('takes the full amount into escrow, sends the materials money at once and holds the workmanship', async () => {
    const c = await api('POST', `/api/agreements/${t.ag}/checkout`, { token: t.e1 });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.equal(c.body.amount, 76000);
    assert.equal(c.body.provider, 'simulated');
    assert.match(c.body.checkoutUrl, /\/pay\//);
    t.ref = c.body.reference;
    assert.equal((await api('POST', `/api/payments/${t.ref}/confirm`, { token: t.e1 })).status, 402); // not paid yet
    assert.equal((await api('POST', `/api/payments/${t.ref}/simulate`, { token: t.a1 })).status, 403);
    assert.equal((await api('POST', `/api/payments/${t.ref}/simulate`, { token: t.e1 })).status, 200);
    assert.equal((await api('POST', `/api/payments/${t.ref}/confirm`, { token: t.e1 })).status, 200); // safe to repeat
    assert.deepEqual(await payments(t.ag), [
      { kind: 'deposit', amount: 76000, status: 'succeeded' },
      { kind: 'materials_payout', amount: 28000, status: 'succeeded' },
    ]);
    assert.equal((await boot(t.e1)).agreements.find((x) => x.id === t.ag).status, 'in_progress');
  });

  it('cannot be cancelled once paid', async () => {
    assert.equal((await api('POST', `/api/agreements/${t.ag}/cancel`, { token: t.e1, body: { reason: 'Changed my mind' } })).status, 409);
  });

  it('needs live before and after photos before the artisan can mark the job done', async () => {
    assert.equal((await api('POST', `/api/agreements/${t.ag}/submit`, { token: t.a1 })).status, 400);
    const before = jpeg();
    assert.equal((await photo(t.a1, t.ag, 'before', before)).status, 201);
    assert.equal((await photo(t.a1, t.ag, 'after', before)).status, 409); // the same file again
    assert.equal((await photo(t.e1, t.ag, 'after')).status, 403);
    assert.equal((await photo(t.a1, t.ag, 'after')).status, 201);
    assert.equal((await api('POST', `/api/agreements/${t.ag}/complete`, { token: t.e1 })).status, 409); // not marked done yet
    assert.equal((await api('POST', `/api/agreements/${t.ag}/submit`, { token: t.a1 })).status, 200);
    const a = (await boot(t.e1)).agreements.find((x) => x.id === t.ag);
    assert.equal(a.status, 'submitted');
    assert.ok(new Date(a.reviewDeadline) > new Date(Date.now() + 2 * 86400000));
    assert.equal((await boot(t.e1)).jobPhotos.filter((p) => p.agreementId === t.ag).length, 2);
  });

  it('releases the workmanship when the employer confirms, then lets the artisan rate the employer once', async () => {
    assert.equal((await api('POST', `/api/agreements/${t.ag}/rate-employer`, { token: t.a1, body: { rating: 5 } })).status, 409); // not finished
    assert.equal((await api('POST', `/api/agreements/${t.ag}/complete`, { token: t.e1 })).status, 200);
    assert.deepEqual((await payments(t.ag)).map((p) => [p.kind, p.amount, p.status]).at(-1), ['workmanship_payout', 48000, 'succeeded']);
    assert.equal((await api('POST', `/api/agreements/${t.ag}/rate-employer`, { token: t.a1, body: { rating: 5, comment: 'Paid on time.' } })).status, 201);
    assert.equal((await api('POST', `/api/agreements/${t.ag}/rate-employer`, { token: t.a1, body: { rating: 4 } })).status, 409);
    const summary = (await boot(t.a1)).employerRatingSummary.e1;
    assert.equal(summary.count, 2); // one from the demo data, one from this job
  });
});

describe('disputes and automatic release', () => {
  before(async () => {
    const offer = { referralId: t.ref2, materialsAmount: 30000, workmanshipAmount: 45000, startDate: today(1), scope: 'Fit four weatherproof sockets with an RCD at the clubhouse.', acceptTerms: true };
    t.ag2 = (await api('POST', '/api/agreements', { token: t.e1, body: offer })).body.id;
    assert.equal((await api('POST', `/api/agreements/${t.ag2}/accept`, { token: t.a2, body: { acceptTerms: true } })).status, 200);
    const ref = (await api('POST', `/api/agreements/${t.ag2}/checkout`, { token: t.e1 })).body.reference;
    assert.equal((await api('POST', `/api/payments/${ref}/simulate`, { token: t.e1 })).status, 200);
  });

  it('lets either side raise a dispute while money is held, freezing it', async () => {
    assert.equal((await api('POST', `/api/agreements/${t.ag2}/disputes`, { token: t.e1, body: { reason: 'poor_work', details: 'Too short' } })).status, 400);
    const r = await api('POST', `/api/agreements/${t.ag2}/disputes`, { token: t.e1, body: { reason: 'no_show', details: 'The artisan has not come to the site for five days.' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    t.dispute = r.body.id;
    assert.equal((await api('POST', `/api/agreements/${t.ag2}/disputes`, { token: t.a2, body: { reason: 'other', details: 'A second dispute while one is open.' } })).status, 409);
    assert.equal((await api('POST', `/api/agreements/${t.ag2}/complete`, { token: t.e1 })).status, 409);
    const n = (await api('GET', '/api/notifications', { token: t.admin })).body.notifications;
    assert.ok(n.some((x) => x.title === 'New job dispute'));
  });

  it('lets the other side respond once', async () => {
    assert.equal((await api('POST', `/api/disputes/${t.dispute}/respond`, { token: t.e1, body: { details: 'Responding to my own dispute is not allowed.' } })).status, 403);
    assert.equal((await api('POST', `/api/disputes/${t.dispute}/respond`, { token: t.a2, body: { details: 'I was waiting for the employer to open the gate; I have messages.' } })).status, 200);
    assert.equal((await api('POST', `/api/disputes/${t.dispute}/respond`, { token: t.a2, body: { details: 'A second answer is not allowed either.' } })).status, 409);
  });

  it('is decided only by an administrator, who splits the held workmanship', async () => {
    const decision = { artisanSharePct: 60, note: 'Messages show the gate was locked on two of the five days.' };
    assert.equal((await api('POST', `/api/admin/disputes/${t.dispute}/resolve`, { token: t.e1, body: decision })).status, 403);
    assert.equal((await api('POST', `/api/admin/disputes/${t.dispute}/resolve`, { token: t.admin, body: decision })).status, 200);
    assert.equal((await api('POST', `/api/admin/disputes/${t.dispute}/resolve`, { token: t.admin, body: decision })).status, 409);
    const p = (await payments(t.ag2)).filter((x) => ['workmanship_payout', 'refund'].includes(x.kind)).map((x) => [x.kind, x.amount]).sort();
    assert.deepEqual(p, [['refund', 18000], ['workmanship_payout', 27000]]);
    const a = (await boot(t.a2)).agreements.find((x) => x.id === t.ag2);
    assert.equal(a.status, 'resolved');
    const d = (await boot(t.a2)).disputes.find((x) => x.id === t.dispute);
    assert.equal(d.artisanSharePct, 60);
  });

  it('releases payment automatically when the employer does not respond in time', async () => {
    // The demo job in progress for Tobi: add photos, mark done, then let the review period run out.
    assert.equal((await photo(t.a1, 'ag2', 'after')).status, 201);
    assert.equal((await api('POST', '/api/agreements/ag2/submit', { token: t.a1 })).status, 200);
    await pool.query("UPDATE job_agreements SET review_deadline = now() - interval '1 minute' WHERE id = 'ag2'");
    const a = (await boot(t.a1)).agreements.find((x) => x.id === 'ag2');
    assert.equal(a.status, 'completed');
    assert.ok((await payments('ag2')).some((p) => p.kind === 'workmanship_payout' && p.amount === 60000 && p.status === 'succeeded'));
  });

  it('lets either side call a job off before any money is paid', async () => {
    const job = (await api('POST', '/api/jobs', { token: t.e1, body: { title: 'Change a ceiling fan regulator', skillIds: ['el-01'], location: { name: 'Ajah', lat: 6.4698, lng: 3.5852 }, workmanshipBudget: 8000 } })).body.job;
    const ref = (await api('POST', `/api/jobs/${job.id}/referrals`, { token: t.e1, body: { apprenticeId: 'a1' } })).body.referral.id;
    await api('PATCH', `/api/referrals/${ref}`, { token: t.a1, body: { status: 'accepted', quote: { workmanship: 8000, availableFrom: today(1) } } });
    const id = (await api('POST', '/api/agreements', { token: t.e1, body: { referralId: ref, workmanshipAmount: 8000, startDate: today(1), scope: 'Replace the regulator on one fan.', acceptTerms: true } })).body.id;
    assert.equal((await api('POST', `/api/agreements/${id}/cancel`, { token: t.a1, body: { reason: 'I am ill this week.' } })).status, 200);
    // The employer can then make a fresh offer to the same artisan.
    assert.equal((await api('POST', '/api/agreements', { token: t.e1, body: { referralId: ref, workmanshipAmount: 9000, startDate: today(8), scope: 'Replace the regulator on one fan.', acceptTerms: true } })).status, 201);
  });
});

describe('who sees job agreements', () => {
  it('shows them only to the two sides and administrators', async () => {
    const trainer = await boot(t.t1);
    assert.equal(trainer.agreements.length, 0);
    assert.equal(trainer.payments.length, 0);
    const other = await boot(t.a2);
    assert.ok(other.agreements.every((a) => a.artisanId === 'a2'));
    assert.equal(other.payoutAccount.accountLast4, '4420');
    const admin = await boot(t.admin);
    assert.ok(admin.agreements.length >= 5 && admin.disputes.length >= 3);
    assert.equal((await api('POST', `/api/agreements/${t.ag}/complete`, { token: t.e2 })).status, 404); // another employer
  });

  it('only lets an administrator change the review period, within limits', async () => {
    assert.equal((await api('PATCH', '/api/admin/settings', { token: t.admin, body: { reviewDays: 30 } })).status, 400);
    const r = await api('PATCH', '/api/admin/settings', { token: t.admin, body: { reviewDays: 5 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.settings.reviewDays, 5);
  });
});
