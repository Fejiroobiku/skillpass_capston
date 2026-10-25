import { Link, NavLink } from 'react-router-dom';
import { BellIcon, ClipboardListIcon, UserRoundIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSkillPass } from '../../contexts/SkillPassContext';
import { homeByRole, navByRole, navLabel } from '../../data/navigation';
import { useT } from '../../i18n';
import { Logo } from '../Logo';
import { SidebarMeter } from './SidebarMeter';

export const navLinkClass = ({ isActive }: {isActive: boolean;}) =>
`flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
isActive ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-300' : 'text-ink-muted hover:bg-canvas hover:text-ink'}`;


export function Sidebar() {
  const { user } = useAuth();
  const { notifications } = useSkillPass();
  const { t } = useT();
  if (!user) return null;
  const nav = navByRole[user.role];
  const unread = notifications.filter((n) => n.userId === user.id && !n.read).length;
  const account = [
  { to: '/notifications', label: t('nav.notifications'), icon: BellIcon, badge: unread },
  { to: '/profile', label: t('nav.myProfile'), icon: UserRoundIcon, badge: 0 },
  { to: '/survey', label: t('nav.survey'), icon: ClipboardListIcon, badge: 0 }].
  filter((a) => !nav.some((n) => n.to === a.to));

  return (
    <aside className="no-print fixed inset-y-3 left-3 z-20 hidden w-60 flex-col overflow-hidden rounded-3xl border border-line bg-surface lg:flex">
      <Link to={homeByRole[user.role]} className="flex h-16 items-center border-b border-line px-5">
        <Logo />
      </Link>
      <div className="flex flex-1 flex-col overflow-y-auto px-3 py-5">
        <p className="px-3 text-xs font-medium text-ink-subtle">{t('nav.workspace')}</p>
        <nav aria-label="Main" className="mt-2 flex flex-col gap-0.5">
          {nav.map((item) =>
          <NavLink key={item.to} to={item.to} end className={navLinkClass}>
              <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              {navLabel(item, t)}
            </NavLink>
          )}
        </nav>
        <p className="mt-7 px-3 text-xs font-medium text-ink-subtle">{t('nav.account')}</p>
        <nav aria-label="Account" className="mt-2 flex flex-col gap-0.5">
          {account.map((item) =>
          <NavLink key={item.to} to={item.to} end className={navLinkClass}>
              <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span className="flex-1">{item.label}</span>
              {item.badge > 0 && <span className="rounded-sm bg-violet-500 px-2 text-xs font-bold text-night">{item.badge}</span>}
            </NavLink>
          )}
        </nav>
        <div className="mt-auto pt-6">
          <SidebarMeter />
        </div>
      </div>
    </aside>);

}