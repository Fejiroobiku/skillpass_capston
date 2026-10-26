import React from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import type { Role } from './types/skillpass';
import { SkillPassProvider } from './contexts/SkillPassContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './i18n';
import { OfflineBanner } from './components/OfflineBanner';
import { homeByRole } from './data/navigation';
import { DashboardLayout } from './components/layout/DashboardLayout';

import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { PublicVerify } from './pages/public/PublicVerify';
import { PublicPassport } from './pages/public/PublicPassport';
import { Terms } from './pages/public/Terms';
import { ForgotPassword, ResetPassword, VerifyEmail } from './pages/auth/AccountRecovery';
import { getToken } from './api/client';
import { loaders, preloadPagesFor, roleFromToken } from './pageLoaders';

// Signed-in pages load on demand (see pageLoaders.ts). For a returning user, start fetching their pages now,
// in parallel with the account check, instead of after it.
const page = <T extends Record<string, React.ComponentType>>(load: () => Promise<T>, name: keyof T) =>
  React.lazy(() => load().then((m) => ({ default: m[name] })));
const savedRole = roleFromToken(getToken());
if (savedRole) preloadPagesFor(savedRole);

const { trainer: t, apprentice: a, employer: e, admin: ad, shared: sh } = loaders;
const TrainerDashboard = page(t.TrainerDashboard, 'TrainerDashboard');
const IssueCredential = page(t.IssueCredential, 'IssueCredential');
const TrainerCredentials = page(t.TrainerCredentials, 'TrainerCredentials');
const TrainerApprentices = page(t.TrainerApprentices, 'TrainerApprentices');
const TrainerSkills = page(t.TrainerSkills, 'TrainerSkills');
const SkillsPassport = page(a.SkillsPassport, 'SkillsPassport');
const ConfirmSkills = page(a.ConfirmSkills, 'ConfirmSkills');
const JobReferrals = page(a.JobReferrals, 'JobReferrals');
const ArtisanWork = page(a.ArtisanWork, 'ArtisanWork');
const EmployerDashboard = page(e.EmployerDashboard, 'EmployerDashboard');
const EmployerJobs = page(e.EmployerJobs, 'EmployerJobs');
const EmployerFeedback = page(e.EmployerFeedback, 'EmployerFeedback');
const EmployerHires = page(e.EmployerHires, 'EmployerHires');
const PayCheckout = page(e.PayCheckout, 'PayCheckout');
const AdminMetrics = page(ad.AdminMetrics, 'AdminMetrics');
const ReviewQueue = page(ad.ReviewQueue, 'ReviewQueue');
const AdminUsers = page(ad.AdminUsers, 'AdminUsers');
const AdminSkills = page(ad.AdminSkills, 'AdminSkills');
const AuditLog = page(ad.AuditLog, 'AuditLog');
const AdminSettings = page(ad.AdminSettings, 'AdminSettings');
const Profile = page(sh.Profile, 'Profile');
const Notifications = page(sh.Notifications, 'Notifications');
const UsabilitySurvey = page(sh.UsabilitySurvey, 'UsabilitySurvey');
const ApprenticePassport = page(sh.ApprenticePassport, 'ApprenticePassport');
const ConfirmContact = page(sh.ConfirmContact, 'ConfirmContact');

function Loading() {
  return <p role="status" className="p-10 text-center text-ink-muted">Loading SkillPass…</p>;
}

function RequireAuth() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  return user ? <DashboardLayout /> : <Navigate to="/login" replace />;
}

function RoleGuard({ role }: {role: Role;}) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return user.role === role ? <Outlet /> : <Navigate to={homeByRole[user.role]} replace />;
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homeByRole[user.role] : '/login'} replace />;
}

function GuestOnly({ children }: {children: React.ReactNode;}) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  return user ? <Navigate to={homeByRole[user.role]} replace /> : <>{children}</>;
}

export function App() {
  return (
    <LanguageProvider>
    <SkillPassProvider>
      <AuthProvider>
        <OfflineBanner />
        <BrowserRouter>
          <React.Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
            <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/verify" element={<PublicVerify />} />
            <Route path="/verify/:id" element={<PublicVerify />} />
            <Route path="/passport/:id" element={<PublicPassport />} />
            <Route path="/terms" element={<Terms />} />

            <Route element={<RequireAuth />}>
              <Route path="/trainer" element={<RoleGuard role="trainer" />}>
                <Route index element={<TrainerDashboard />} />
                <Route path="issue" element={<IssueCredential />} />
                <Route path="credentials" element={<TrainerCredentials />} />
                <Route path="apprentices" element={<TrainerApprentices />} />
                <Route path="skills" element={<TrainerSkills />} />
              </Route>
              <Route path="/apprentice" element={<RoleGuard role="apprentice" />}>
                <Route index element={<SkillsPassport />} />
                <Route path="confirm" element={<ConfirmSkills />} />
                <Route path="jobs" element={<JobReferrals />} />
                <Route path="work" element={<ArtisanWork />} />
              </Route>
              <Route path="/employer" element={<RoleGuard role="employer" />}>
                <Route index element={<EmployerDashboard />} />
                <Route path="jobs" element={<EmployerJobs />} />
                <Route path="feedback" element={<EmployerFeedback />} />
                <Route path="hires" element={<EmployerHires />} />
              </Route>
              <Route path="/pay/:reference" element={<RoleGuard role="employer" />}>
                <Route index element={<PayCheckout />} />
              </Route>
              <Route path="/admin" element={<RoleGuard role="admin" />}>
                <Route index element={<AdminMetrics />} />
                <Route path="review" element={<ReviewQueue />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="skills" element={<AdminSkills />} />
                <Route path="audit" element={<AuditLog />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>
              <Route path="/profile" element={<Profile />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/survey" element={<UsabilitySurvey />} />
              <Route path="/people/:apprenticeId/passport" element={<ApprenticePassport />} />
              <Route path="/confirm-contact" element={<ConfirmContact />} />
            </Route>

            <Route path="*" element={<HomeRedirect />} />
          </Routes>
          </React.Suspense>
        </BrowserRouter>
      </AuthProvider>
    </SkillPassProvider>
    </LanguageProvider>);

}