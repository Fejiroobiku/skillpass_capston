import type { LucideIcon } from 'lucide-react';
import {
  BellIcon,
  BookOpenCheckIcon,
  BriefcaseIcon,
  ClipboardCheckIcon,
  FilePlus2Icon,
  GaugeIcon,
  IdCardIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldCheckIcon,
  StarIcon,
  UserCheckIcon,
  UserRoundIcon,
  UsersRoundIcon } from
'lucide-react';
import type { Role } from '../types/skillpass';
import type { MessageKey } from '../i18n/en';

export interface NavItem {
  to: string;
  label: string;
  short?: string;
  icon: LucideIcon;
  /** Translation keys; items without one stay in English for now. */
  i18n?: MessageKey;
  i18nShort?: MessageKey;
}

export const homeByRole: Record<Role, string> = {
  trainer: '/trainer',
  apprentice: '/apprentice',
  employer: '/employer',
  admin: '/admin'
};

export const navByRole: Record<Role, NavItem[]> = {
  trainer: [
  { to: '/trainer', label: 'Dashboard', short: 'Home', icon: LayoutDashboardIcon },
  { to: '/trainer/issue', label: 'Issue Credential', short: 'Issue', icon: FilePlus2Icon },
  { to: '/trainer/credentials', label: 'Credentials', icon: ShieldCheckIcon },
  { to: '/trainer/apprentices', label: 'Apprentices', icon: UsersRoundIcon },
  { to: '/trainer/skills', label: 'Skill Framework', short: 'Skills', icon: BookOpenCheckIcon }],

  apprentice: [
  { to: '/apprentice', label: 'Skills Passport', short: 'Passport', icon: IdCardIcon, i18n: 'nav.passport', i18nShort: 'nav.passport.short' },
  { to: '/apprentice/confirm', label: 'Confirm & Report', short: 'Confirm', icon: UserCheckIcon, i18n: 'nav.confirm', i18nShort: 'nav.confirm.short' },
  { to: '/apprentice/jobs', label: 'Job Referrals', short: 'Jobs', icon: BriefcaseIcon, i18n: 'nav.jobs', i18nShort: 'nav.jobs.short' },
  { to: '/notifications', label: 'Alerts', icon: BellIcon, i18n: 'nav.alerts' },
  { to: '/profile', label: 'Profile', icon: UserRoundIcon, i18n: 'nav.profile' }],

  employer: [
  { to: '/employer', label: 'Verify & Co-sign', short: 'Verify', icon: ShieldCheckIcon },
  { to: '/employer/jobs', label: 'Jobs & Matches', short: 'Jobs', icon: BriefcaseIcon },
  { to: '/employer/feedback', label: 'Feedback', icon: StarIcon },
  { to: '/notifications', label: 'Alerts', icon: BellIcon }],

  admin: [
  { to: '/admin', label: 'Pilot Metrics', short: 'Metrics', icon: GaugeIcon },
  { to: '/admin/review', label: 'Review Queue', short: 'Review', icon: ClipboardCheckIcon },
  { to: '/admin/users', label: 'Users', icon: UsersRoundIcon },
  { to: '/admin/skills', label: 'Trades & Skills', short: 'Skills', icon: ListChecksIcon },
  { to: '/admin/audit', label: 'Audit Log', short: 'Audit', icon: ScrollTextIcon },
  { to: '/admin/settings', label: 'Settings', icon: SettingsIcon }]

};

export const roleLabel: Record<Role, string> = {
  trainer: 'Trainer',
  apprentice: 'Apprentice',
  employer: 'Employer',
  admin: 'Administrator'
};
/** The label to show for a nav item in the chosen language (falls back to English). */
export const navLabel = (item: NavItem, t: (key: MessageKey) => string, short = false) =>
short ? item.i18nShort ? t(item.i18nShort) : item.i18n ? t(item.i18n) : item.short ?? item.label : item.i18n ? t(item.i18n) : item.label;
