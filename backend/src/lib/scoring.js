import { config } from '../config.js';

/**
 * Trust score and risk signals.
 *
 * Originally ports of computeTrust (src/utils/credentials.ts) and computeRisk (src/utils/risk.ts) from the
 * frontend, so the numbers match what the UI shows. The logic now lives in two classes:
 *
 *   TrustScoreCalculator  weighted score from audit agreement, employer ratings and flags, with penalties
 *   RiskAssessor          runs a list of RiskRule objects (Strategy pattern); each rule looks for one
 *                         warning sign and returns a signal or null
 *
 * Both are pure: integrity.js loads the rows from the database and passes them in, which keeps the
 * maths testable without a database. computeTrust() and computeRisk() remain as the public functions.
 */

/** Ratings of 2 or below count as poor; two or more trigger an automatic penalty. */
export const POOR_RATING = 2;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ------------------------------------------------------------------ trust score */

export class TrustScoreCalculator {
  /**
   * @param {object} [weights]  must add up to 1
   * @param {number} [weights.audit]    agreement with independent spot-checks
   * @param {number} [weights.rating]   employer ratings of apprentices this trainer passed
   * @param {number} [weights.clean]    share of credentials never flagged or revoked
   */
  constructor({ audit = 0.4, rating = 0.3, clean = 0.3 } = {}) {
    if (Math.abs(audit + rating + clean - 1) > 1e-9) throw new RangeError('Trust score weights must add up to 1.');
    this.weights = Object.freeze({ audit, rating, clean });
  }

  /** Neutral starting value for a new trainer with no audits or ratings yet. */
  static NEUTRAL = 0.8;
  static MISCONDUCT_CAP = 10;

  /** Penalty for repeated poor employer ratings: 8 points each from the second one, capped at 25. */
  static ratingPenalty(poorRatings) {
    return poorRatings >= 2 ? Math.min(25, poorRatings * 8) : 0;
  }

  compute({ credentials, flags, feedback, samples, misconduct = false }) {
    const mine = credentials;
    const ids = new Set(mine.map((c) => c.id));

    const done = samples.filter((s) => ids.has(s.credentialId) && s.result !== 'pending');
    const agree = done.filter((s) => s.result === 'agree').length;
    const auditAgreement = done.length ? agree / done.length : null;

    const ratings = feedback.filter((f) => f.credentialIds.some((id) => ids.has(id)));
    const avgRating = ratings.length ? ratings.reduce((sum, f) => sum + f.rating, 0) / ratings.length : null;

    const flaggedIds = new Set(flags.filter((f) => ids.has(f.credentialId) && f.status !== 'dismissed').map((f) => f.credentialId));
    mine.filter((c) => c.status === 'revoked').forEach((c) => flaggedIds.add(c.id));
    const flaggedShare = mine.length ? flaggedIds.size / mine.length : 0;
    const evidenceShare = mine.length ? mine.filter((c) => c.evidenceCount > 0).length / mine.length : 1;

    const a = auditAgreement ?? TrustScoreCalculator.NEUTRAL;
    const r = avgRating !== null ? avgRating / 5 : TrustScoreCalculator.NEUTRAL;
    const poorRatings = ratings.filter((f) => f.rating <= POOR_RATING).length;
    const ratingPenalty = TrustScoreCalculator.ratingPenalty(poorRatings);

    const w = this.weights;
    let score = Math.round((w.audit * a + w.rating * r + w.clean * (1 - flaggedShare)) * 100) - ratingPenalty;
    if (misconduct) score = Math.min(score, TrustScoreCalculator.MISCONDUCT_CAP);
    score = Math.max(0, score);

    return { score, auditAgreement, auditCount: done.length, avgRating, ratingCount: ratings.length, flaggedShare, issuedCount: mine.length, evidenceShare, poorRatings, ratingPenalty, misconduct };
  }
}

/* ------------------------------------------------------------------ risk rules */

/** Abstract rule. Subclasses implement evaluate(context) and return a signal or null. */
export class RiskRule {
  constructor(id, label) {
    if (new.target === RiskRule) throw new TypeError('RiskRule is abstract; use a subclass.');
    this.id = id;
    this.label = label;
  }

  signal(detail) {
    return { id: this.id, label: this.label, detail };
  }

  // eslint-disable-next-line no-unused-vars
  evaluate(context) {
    throw new TypeError(`${this.constructor.name} must implement evaluate().`);
  }
}

/** Credentials signed minutes apart suggest the trainer did not watch each task. One pass over the sorted list: O(n). */
export class FastIssuingRule extends RiskRule {
  constructor() {
    super('fast', 'Issuing very fast');
  }

  evaluate({ sorted, settings }) {
    let fastPairs = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gapMinutes = (new Date(sorted[i].issuedAt).getTime() - new Date(sorted[i - 1].issuedAt).getTime()) / 60000;
      if (gapMinutes < settings.fastMinutes) fastPairs++;
    }
    return fastPairs > 0 ? this.signal(`${plural(fastPairs, 'credential')} signed under ${settings.fastMinutes} min after the previous one`) : null;
  }
}

/** Passing (almost) everyone, once there are enough assessments to judge. */
export class PassesEveryoneRule extends RiskRule {
  constructor(minAssessed = 5, threshold = 0.95) {
    super('pass_all', 'Passes everyone');
    this.minAssessed = minAssessed;
    this.threshold = threshold;
  }

  evaluate({ passRate, assessed }) {
    return passRate !== null && assessed >= this.minAssessed && passRate >= this.threshold
      ? this.signal(`${Math.round(passRate * 100)}% pass rate across ${assessed} assessments`)
      : null;
  }
}

/** Many credentials on one calendar day (Lagos time). Counts per day with a hash map: O(n). */
export class ClusteredDayRule extends RiskRule {
  constructor(timezone = config.timezone) {
    super('cluster', 'Clustered in one day');
    this.timezone = timezone;
  }

  dayOf(iso) {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: this.timezone });
  }

  evaluate({ sorted, settings }) {
    const byDay = new Map();
    for (const c of sorted) {
      const day = this.dayOf(c.issuedAt);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    const peak = Math.max(0, ...byDay.values());
    return peak >= settings.clusterThreshold ? this.signal(`${peak} credentials issued on a single day`) : null;
  }
}

/** Employers rating the trainer's apprentices poorly after real jobs. */
export class PoorRatingsRule extends RiskRule {
  constructor() {
    super('poor_ratings', 'Poor employer ratings');
  }

  evaluate({ ids, feedback }) {
    const poor = feedback.filter((f) => f.rating <= POOR_RATING && f.credentialIds.some((id) => ids.has(id))).length;
    return poor >= 2 ? this.signal(`${poor} ratings of ${POOR_RATING}★ or less for artisans they passed`) : null;
  }
}

/** Confidential reports from apprentices that are still open. */
export class OpenReportsRule extends RiskRule {
  constructor() {
    super('reports', 'Artisan report');
  }

  evaluate({ openReportCount }) {
    return openReportCount > 0 ? this.signal(`${plural(openReportCount, 'confidential report')} open`) : null;
  }
}

export class RiskAssessor {
  /** @param {RiskRule[]} rules  evaluated in order; the order sets the order of signals shown to admins */
  constructor(rules = RiskAssessor.defaultRules()) {
    this.rules = rules;
  }

  static defaultRules() {
    return [new FastIssuingRule(), new PassesEveryoneRule(), new ClusteredDayRule(), new PoorRatingsRule(), new OpenReportsRule()];
  }

  static levelFor(signalCount) {
    return signalCount >= 2 ? 'high' : signalCount === 1 ? 'medium' : 'low';
  }

  assess({ credentials, notYetCount, feedback, openReportCount, settings }) {
    const sorted = [...credentials].sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
    const assessed = sorted.length + notYetCount;
    const passRate = assessed ? sorted.length / assessed : null;
    const context = { sorted, ids: new Set(sorted.map((c) => c.id)), assessed, passRate, feedback, openReportCount, settings };

    const signals = this.rules.map((rule) => rule.evaluate(context)).filter(Boolean);
    // Only valid credentials count toward finishing probation (same rule as POST /api/credentials).
    const completed = sorted.filter((c) => c.status === 'valid').length;
    return { onProbation: completed < settings.probationCount, probationUsed: completed, passRate, assessed, signals, level: RiskAssessor.levelFor(signals.length) };
  }
}

/* ------------------------------------------------------------------ public functions */

const trust = new TrustScoreCalculator();
const risk = new RiskAssessor();

/**
 * @param {object} p
 * @param {{id: string, status: string, evidenceCount: number}[]} p.credentials  all credentials issued by this trainer
 * @param {{credentialId: string, status: string}[]} p.flags
 * @param {{rating: number, credentialIds: string[]}[]} p.feedback
 * @param {{credentialId: string, result: string}[]} p.samples
 * @param {boolean} p.misconduct
 */
export const computeTrust = (p) => trust.compute(p);

/**
 * @param {object} p
 * @param {{id: string, issuedAt: string, status?: string}[]} p.credentials  all credentials issued by this trainer
 * @param {number} p.notYetCount          "not yet competent" assessments recorded by this trainer
 * @param {{rating: number, credentialIds: string[]}[]} p.feedback
 * @param {number} p.openReportCount      confidential apprentice reports that are not closed
 * @param {{fastMinutes: number, clusterThreshold: number, probationCount: number}} p.settings
 */
export const computeRisk = (p) => risk.assess(p);
