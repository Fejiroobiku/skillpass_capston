import type { Role } from './types/skillpass';

/**
 * Signed-in pages are split into their own files so a phone downloads only the screens its user needs.
 * Public entry pages (sign-in, register, verify, public passport) stay in the main bundle because they are
 * what people open first; making them wait for a second download was slower on 3G (see the technical report).
 *
 * To avoid a request waterfall (main bundle → account check → page file), preloadPagesFor() starts the
 * downloads for a role straight away, in parallel with the account check.
 */
export const loaders = {
  trainer: {
    TrainerDashboard: () => import('./pages/trainer/TrainerDashboard'),
    IssueCredential: () => import('./pages/trainer/IssueCredential'),
    TrainerCredentials: () => import('./pages/trainer/TrainerCredentials'),
    TrainerApprentices: () => import('./pages/trainer/TrainerApprentices'),
    TrainerSkills: () => import('./pages/trainer/TrainerSkills'),
  },
  apprentice: {
    SkillsPassport: () => import('./pages/apprentice/SkillsPassport'),
    ConfirmSkills: () => import('./pages/apprentice/ConfirmSkills'),
    JobReferrals: () => import('./pages/apprentice/JobReferrals'),
  },
  employer: {
    EmployerDashboard: () => import('./pages/employer/EmployerDashboard'),
    EmployerJobs: () => import('./pages/employer/EmployerJobs'),
    EmployerFeedback: () => import('./pages/employer/EmployerFeedback'),
  },
  admin: {
    AdminMetrics: () => import('./pages/admin/AdminMetrics'),
    ReviewQueue: () => import('./pages/admin/ReviewQueue'),
    AdminUsers: () => import('./pages/admin/AdminUsers'),
    AdminSkills: () => import('./pages/admin/AdminSkills'),
    AuditLog: () => import('./pages/AuditLog'),
    AdminSettings: () => import('./pages/admin/AdminSettings'),
  },
  shared: {
    Profile: () => import('./pages/shared/Profile'),
    Notifications: () => import('./pages/shared/Notifications'),
    UsabilitySurvey: () => import('./pages/shared/UsabilitySurvey'),
    ApprenticePassport: () => import('./pages/shared/ApprenticePassport'),
    ConfirmContact: () => import('./pages/shared/ConfirmContact'),
  },
} as const;

/** Start downloading every page a role can open. Safe to call more than once: the browser reuses each module. */
export function preloadPagesFor(role: Role) {
  const group = loaders[role];
  if (!group) return;
  [...Object.values(group), loaders.shared.Profile, loaders.shared.Notifications].forEach((load) => {
    load().catch(() => {/* offline: the page will retry when opened */});
  });
}

/**
 * Read the role from a saved sign-in token, only to decide what to preload. Never used for access control:
 * the server checks the token on every request.
 */
export function roleFromToken(token: string | null): Role | null {
  try {
    const payload = JSON.parse(atob((token ?? '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return ['trainer', 'apprentice', 'employer', 'admin'].includes(payload.role) ? payload.role : null;
  } catch {
    return null;
  }
}
