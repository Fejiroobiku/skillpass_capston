import React from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import type { Role } from './types/skillpass';
import { SkillPassProvider } from './contexts/SkillPassContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './i18n';
import { OfflineBanner } from './components/OfflineBanner';
import { homeByRole } from './data/navigation';
import { DashboardLayout } from './components/layout/DashboardLayout';

// Pages load on demand, so a phone downloads only the screens its user opens (see the technical report).
const page = <T extends Record<string, React.ComponentType>>(load: () => Promise<T>, name: keyof T) =>
  React.lazy(() => load().then((m) => ({ default: m[name] })));

const Login = page(() => import('./pages/auth/Login'), 'Login');
const Register = page(() => import('./pages/auth/Register'), 'Register');
const PublicVerify = page(() => import('./pages/public/PublicVerify'), 'PublicVerify');
const PublicPassport = page(() => import('./pages/public/PublicPassport'), 'PublicPassport');
const TrainerDashboard = page(() => import('./pages/trainer/TrainerDashboard'), 'TrainerDashboard');
const IssueCredential = page(() => import('./pages/trainer/IssueCredential'), 'IssueCredential');
const TrainerCredentials = page(() => import('./pages/trainer/TrainerCredentials'), 'TrainerCredentials');
const TrainerApprentices = page(() => import('./pages/trainer/TrainerApprentices'), 'TrainerApprentices');
const TrainerSkills = page(() => import('./pages/trainer/TrainerSkills'), 'TrainerSkills');
const SkillsPassport = page(() => import('./pages/apprentice/SkillsPassport'), 'SkillsPassport');
const JobReferrals = page(() => import('./pages/apprentice/JobReferrals'), 'JobReferrals');
const ConfirmSkills = page(() => import('./pages/apprentice/ConfirmSkills'), 'ConfirmSkills');
const EmployerDashboard = page(() => import('./pages/employer/EmployerDashboard'), 'EmployerDashboard');
const EmployerJobs = page(() => import('./pages/employer/EmployerJobs'), 'EmployerJobs');
const EmployerFeedback = page(() => import('./pages/employer/EmployerFeedback'), 'EmployerFeedback');
const AdminMetrics = page(() => import('./pages/admin/AdminMetrics'), 'AdminMetrics');
const ReviewQueue = page(() => import('./pages/admin/ReviewQueue'), 'ReviewQueue');
const AdminUsers = page(() => import('./pages/admin/AdminUsers'), 'AdminUsers');
const AdminSkills = page(() => import('./pages/admin/AdminSkills'), 'AdminSkills');
const AdminSettings = page(() => import('./pages/admin/AdminSettings'), 'AdminSettings');
const AuditLog = page(() => import('./pages/AuditLog'), 'AuditLog');
const Profile = page(() => import('./pages/shared/Profile'), 'Profile');
const Notifications = page(() => import('./pages/shared/Notifications'), 'Notifications');
const UsabilitySurvey = page(() => import('./pages/shared/UsabilitySurvey'), 'UsabilitySurvey');
const ApprenticePassport = page(() => import('./pages/shared/ApprenticePassport'), 'ApprenticePassport');
const ConfirmContact = page(() => import('./pages/shared/ConfirmContact'), 'ConfirmContact');
const ForgotPassword = page(() => import('./pages/auth/AccountRecovery'), 'ForgotPassword');
const ResetPassword = page(() => import('./pages/auth/AccountRecovery'), 'ResetPassword');
const VerifyEmail = page(() => import('./pages/auth/AccountRecovery'), 'VerifyEmail');

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
              </Route>
              <Route path="/employer" element={<RoleGuard role="employer" />}>
                <Route index element={<EmployerDashboard />} />
                <Route path="jobs" element={<EmployerJobs />} />
                <Route path="feedback" element={<EmployerFeedback />} />
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