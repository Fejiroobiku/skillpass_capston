/**
 * Phone verification, email verification and password reset, against a real database.
 * The server runs with SMS_PROVIDER and EMAIL_PROVIDER at their default, "console", so codes and links come back
 * in the responses as devCode / devLink (never in production).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { api, login, pool, start, stop } from './helpers.js';

before(start);
after(stop);

let n = 0;
async function join(over = {}) {
  n += 1;
  const r = await api('POST', '/api/auth/register', { body: {
    role: 'apprentice', name: `Test Person ${n}`, email: `person${n}@example.com`, phone: `0809 111 ${String(2000 + n)}`,
    password: 'a-good-password', dob: '1998-06-01', trade: 'electrical', trainerId: 't1', consent: true,
    location: { name: 'Yaba', lat: 6.5095, lng: 3.3711 }, ...over,
  } });
  return r;
}

describe('phone numbers at sign-up', () => {
  it('accepts Nigerian numbers in any common format and allows one account per number', async () => {
    const ok = await join({ phone: '+234 809 555 0101' });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.user.account.phoneVerified, false);
    assert.equal((await pool.query('SELECT phone_e164 FROM users WHERE id = $1', [ok.body.user.id])).rows[0].phone_e164, '+2348095550101');

    const sameNumber = await join({ phone: '08095550101' });
    assert.equal(sameNumber.status, 409);
    assert.match(sameNumber.body.error, /phone number already/);
    assert.equal((await join({ phone: '0803 412 7781' })).status, 409); // Babatunde's number from the demo data
    assert.equal((await join({ phone: '12345' })).status, 400);
  });
});

describe('phone verification', () => {
  it('texts a code, limits resends, counts wrong tries, then confirms the phone', async () => {
    const { body } = await join();
    const token = body.token;

    // Until the phone is confirmed, confirming a skill is refused before anything else is checked.
    const blocked = await api('POST', '/api/credentials/SP-AAAA-BBBB/confirm', { token });
    assert.equal(blocked.status, 403);
    assert.match(blocked.body.error, /Confirm your phone/);

    const sent = await api('POST', '/api/auth/phone/send', { token });
    assert.equal(sent.status, 200);
    assert.match(sent.body.devCode, /^\d{6}$/);
    assert.match(sent.body.sentTo, /^\+234 \d{3} \*\*\* \d{4}$/);
    assert.equal((await api('POST', '/api/auth/phone/send', { token })).status, 429); // under a minute later

    const wrong = sent.body.devCode === '000000' ? '111111' : '000000';
    const miss = await api('POST', '/api/auth/phone/verify', { token, body: { code: wrong } });
    assert.equal(miss.status, 400);
    assert.match(miss.body.error, /4 tries left/);

    assert.equal((await api('POST', '/api/auth/phone/verify', { token, body: { code: sent.body.devCode } })).status, 200);
    assert.equal((await api('GET', '/api/auth/me', { token })).body.user.account.phoneVerified, true);
    assert.equal((await api('POST', '/api/auth/phone/send', { token })).body.alreadyVerified, true);
    const stored = (await pool.query(`SELECT secret_hash FROM contact_verifications WHERE user_id = $1 AND purpose = 'phone'`, [body.user.id])).rows[0];
    assert.notEqual(stored.secret_hash, sent.body.devCode); // only a hash is stored
  });

  it('stops working after five wrong tries, and when it expires', async () => {
    const { body } = await join();
    const token = body.token;
    const sent = await api('POST', '/api/auth/phone/send', { token });
    const wrong = sent.body.devCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await api('POST', '/api/auth/phone/verify', { token, body: { code: wrong } });
    const locked = await api('POST', '/api/auth/phone/verify', { token, body: { code: sent.body.devCode } });
    assert.equal(locked.status, 429);

    // A fresh code (pretend the minute has passed), then let it expire.
    await pool.query(`UPDATE contact_verifications SET created_at = now() - interval '2 minutes' WHERE user_id = $1`, [body.user.id]);
    const again = await api('POST', '/api/auth/phone/send', { token });
    assert.equal(again.status, 200);
    await pool.query(`UPDATE contact_verifications SET expires_at = now() - interval '1 second' WHERE user_id = $1 AND used_at IS NULL`, [body.user.id]);
    const expired = await api('POST', '/api/auth/phone/verify', { token, body: { code: again.body.devCode } });
    assert.equal(expired.status, 400);
    assert.match(expired.body.error, /expired/);
  });

  it('administrators cannot approve an employer who has not confirmed their phone', async () => {
    const reg = await api('POST', '/api/auth/register', { body: {
      role: 'employer', name: 'Uche Builders', email: 'uche@example.com', phone: '0817 000 1234', password: 'a-good-password',
      dob: '1985-01-01', trade: 'electrical', company: 'Uche Builders', consent: true, location: { name: 'Ikeja', lat: 6.6, lng: 3.35 },
    } });
    assert.equal(reg.status, 201);
    const admin = await login('admin@skillpass.ng');
    const r = await api('POST', `/api/admin/users/${reg.body.user.id}/approve`, { token: admin });
    assert.equal(r.status, 409);
    const users = (await api('GET', '/api/admin/users', { token: admin })).body.users;
    assert.equal(users.find((u) => u.id === reg.body.user.id).phoneVerified, false);
    assert.equal(users.find((u) => u.id === 't1').phoneVerified, true); // demo accounts come confirmed
  });
});

describe('email verification and password reset', () => {
  it('confirms an email by link, once', async () => {
    const { body } = await join();
    const sent = await api('POST', '/api/auth/email/send', { token: body.token });
    assert.equal(sent.status, 200);
    const token = new URL(sent.body.devLink).searchParams.get('token');
    assert.equal((await api('POST', '/api/auth/email/verify', { body: { token } })).status, 200);
    assert.equal((await api('GET', '/api/auth/me', { token: body.token })).body.user.account.emailVerified, true);
    assert.equal((await api('POST', '/api/auth/email/verify', { body: { token } })).status, 400); // used already
  });

  it('only sends reset links to confirmed emails, and gives the same answer either way', async () => {
    const unknown = await api('POST', '/api/auth/password/forgot', { body: { email: 'nobody@example.com' } });
    const { body } = await join();
    const unconfirmed = await api('POST', '/api/auth/password/forgot', { body: { email: body.user.email } });
    assert.equal(unknown.status, 200);
    assert.equal(unconfirmed.status, 200);
    assert.equal(unknown.body.message, unconfirmed.body.message);
    assert.equal(unknown.body.devLink, undefined);
    assert.equal(unconfirmed.body.devLink, undefined);
  });

  it('resets the password with the link and signs out every earlier session', async () => {
    const { body } = await join();
    const oldSession = body.token;
    const link = (await api('POST', '/api/auth/email/send', { token: oldSession })).body.devLink;
    await api('POST', '/api/auth/email/verify', { body: { token: new URL(link).searchParams.get('token') } });

    const forgot = await api('POST', '/api/auth/password/forgot', { body: { email: body.user.email } });
    const resetToken = new URL(forgot.body.devLink).searchParams.get('token');
    await new Promise((resolve) => setTimeout(resolve, 1100)); // sessions are compared to the second

    assert.equal((await api('POST', '/api/auth/password/reset', { body: { token: resetToken, password: 'short' } })).status, 400);
    assert.equal((await api('POST', '/api/auth/password/reset', { body: { token: resetToken, password: 'a-brand-new-password' } })).status, 200);
    assert.equal((await api('GET', '/api/auth/me', { token: oldSession })).status, 401);
    assert.equal((await api('POST', '/api/auth/login', { body: { email: body.user.email, password: 'a-good-password' } })).status, 401);
    const fresh = await api('POST', '/api/auth/login', { body: { email: body.user.email, password: 'a-brand-new-password' } });
    assert.equal(fresh.status, 200);
    assert.equal((await api('GET', '/api/auth/me', { token: fresh.body.token })).status, 200);
    assert.equal((await api('POST', '/api/auth/password/reset', { body: { token: resetToken, password: 'another-password' } })).status, 400); // single use
  });
});
