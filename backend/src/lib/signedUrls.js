import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Expiring links for private evidence files.
 *
 * A link looks like /uploads/<file>?exp=<unix seconds>&sig=<HMAC-SHA256 of "path|exp">. The server serves the
 * file only if the signature matches and the time has not passed, so a copied link stops working after the
 * time-to-live and cannot be edited to point at another file or a later expiry.
 *
 * The key is derived from SIGNING_KEY with a fixed label, so link signatures can never be confused with
 * credential signatures made from the same secret.
 */
export class SignedUrlSigner {
  /**
   * @param {string} secret
   * @param {number} ttlSeconds        how long a link stays valid
   * @param {() => number} [now]       clock in milliseconds (replaceable in tests)
   */
  constructor(secret, ttlSeconds, now = Date.now) {
    if (!secret) throw new TypeError('SignedUrlSigner needs a secret.');
    if (!(ttlSeconds > 0)) throw new RangeError('ttlSeconds must be positive.');
    this.key = createHmac('sha256', secret).update('skillpass:evidence-url:v1').digest();
    this.ttlSeconds = ttlSeconds;
    this.now = now;
  }

  #mac(path, exp) {
    return createHmac('sha256', this.key).update(`${path}|${exp}`).digest('base64url');
  }

  /** Expiry is rounded up to the next whole minute so repeated page loads reuse the same URL (browser cache). */
  sign(path) {
    const nowSec = Math.floor(this.now() / 1000);
    const exp = Math.ceil((nowSec + this.ttlSeconds) / 60) * 60;
    return `${path}?exp=${exp}&sig=${this.#mac(path, exp)}`;
  }

  /** @returns {'ok' | 'expired' | 'invalid'} */
  check(path, exp, sig) {
    if (typeof exp !== 'string' || typeof sig !== 'string' || !/^\d{1,12}$/.test(exp)) return 'invalid';
    const expected = Buffer.from(this.#mac(path, Number(exp)));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid';
    return Number(exp) * 1000 > this.now() ? 'ok' : 'expired';
  }

  /** Seconds a valid link has left, for the Cache-Control header. */
  secondsLeft(exp) {
    return Math.max(0, Number(exp) - Math.floor(this.now() / 1000));
  }
}
