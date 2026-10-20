/**
 * Nigerian mobile numbers in one standard form, +234XXXXXXXXXX, so that "0803 412 7781", "08034127781" and
 * "+234 803 412 7781" are recognised as the same number. Returns null for anything that is not a Nigerian mobile.
 */
export function normalizeNgPhone(input) {
  const d = String(input ?? '').replace(/\D/g, '');
  if (/^0[789][01]\d{8}$/.test(d)) return `+234${d.slice(1)}`;
  if (/^234[789][01]\d{8}$/.test(d)) return `+${d}`;
  return null;
}

/** "+2348034127781" → "+234 803 *** 7781", for showing where a code was sent without exposing the whole number. */
export const maskPhone = (e164) => (e164 ? `${e164.slice(0, 4)} ${e164.slice(4, 7)} *** ${e164.slice(-4)}` : '');

/** "tobi@example.com" → "t***@example.com" */
export const maskEmail = (email) => {
  const [name, domain] = String(email).split('@');
  return domain ? `${name.slice(0, 1)}***@${domain}` : '';
};
