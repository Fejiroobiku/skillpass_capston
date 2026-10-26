/**
 * Withdrawing consent (Nigeria Data Protection Act 2023): remove or anonymise a participant's personal data.
 *
 * What is removed:
 *   - name, email, phone, date of birth, location and password on the account (the account is closed)
 *   - trainer workshop name and membership number, employer company name
 *   - for an apprentice: every evidence photo and video of them (files deleted), captions and GPS points,
 *     notes on their credentials, comments employers wrote about them, and the text of their confidential reports.
 *     Their credentials are revoked so they no longer appear anywhere as valid.
 *   - for a trainer: evidence they uploaded but never attached to a credential
 *   - all of the participant's notifications
 *
 * What is kept, without personal details: evidence fingerprints (SHA-256), so a withdrawn file can never back
 * another credential and signatures stay checkable; credential records shown as revoked; ratings and survey scores
 * as numbers. The append-only audit log is kept as the integrity record and cannot be edited by design.
 *
 * Runs inside the caller's transaction. Returns the stored file keys to delete once the transaction commits.
 */
export async function anonymiseParticipant(db, userId) {
  const files = (await db.query(
    `SELECT e.url FROM evidence e LEFT JOIN credentials c ON c.id = e.credential_id
      WHERE (c.apprentice_id = $1 OR (e.uploaded_by = $1 AND e.credential_id IS NULL))`,
    [userId],
  )).rows.map((r) => r.url).filter((u) => u?.startsWith('/uploads/')).map((u) => u.slice('/uploads/'.length));

  // Evidence a trainer uploaded but never used: nothing depends on it, so the rows go too.
  await db.query('DELETE FROM evidence WHERE uploaded_by = $1 AND credential_id IS NULL', [userId]);

  // Evidence of the apprentice: keep only the fingerprint.
  await db.query(
    `UPDATE evidence SET url = '', poster_url = NULL, caption = '', location_label = '', lat = NULL, lng = NULL
      WHERE credential_id IN (SELECT id FROM credentials WHERE apprentice_id = $1)`,
    [userId],
  );
  const revoked = await db.query(
    `UPDATE credentials SET status = 'revoked', revoke_reason = 'Withdrawn at the apprentice''s request', note = ''
      WHERE apprentice_id = $1 AND status <> 'revoked'`,
    [userId],
  );
  await db.query(`UPDATE credentials SET note = '' WHERE apprentice_id = $1`, [userId]);
  await db.query(`UPDATE concern_reports SET details = '[removed: the participant withdrew consent]' WHERE apprentice_id = $1`, [userId]);
  await db.query(`UPDATE feedback SET comment = '' WHERE apprentice_id = $1`, [userId]);
  await db.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
  await db.query('DELETE FROM contact_verifications WHERE user_id = $1', [userId]);
  await db.query('DELETE FROM payout_accounts WHERE user_id = $1', [userId]); // bank details are not kept

  await db.query(`UPDATE trainer_profiles SET workshop = 'Withdrawn', membership_no = '' WHERE user_id = $1`, [userId]);
  await db.query(`UPDATE employer_profiles SET company = 'Withdrawn employer' WHERE user_id = $1`, [userId]);
  await db.query(
    `UPDATE users SET status = 'withdrawn', name = 'Withdrawn participant', email = $2, phone = NULL, phone_e164 = NULL,
            phone_verified_at = NULL, email_verified_at = NULL,
            dob = DATE '1900-01-01', location_name = NULL, lat = NULL, lng = NULL, password_hash = '!'
      WHERE id = $1`,
    [userId, `withdrawn+${userId}@invalid.skillpass`],
  );

  return { files, credentialsRevoked: revoked.rowCount };
}
