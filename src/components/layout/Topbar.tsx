import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SearchIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { navByRole, homeByRole, navLabel, roleLabel } from '../../data/navigation';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { Logo } from '../Logo';
import { NotificationsMenu } from './NotificationsMenu';
import { ProfileMenu } from './ProfileMenu';

const sharedTitles: Record<string, MessageKey> = { '/notifications': 'nav.notifications', '/profile': 'nav.myProfile', '/survey': 'nav.survey' };

export function Topbar() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const { t } = useT();
  if (!user) return null;

  const item = navByRole[user.role].find((n) => n.to === pathname);
  const current = item ? navLabel(item, t) : sharedTitles[pathname] ? t(sharedTitles[pathname]) : '';
  const role = user.role === 'admin' ? roleLabel.admin : t(user.role === 'trainer' ? 'role.trainer' : user.role === 'employer' ? 'role.employer' : 'role.apprentice');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = q.trim().toUpperCase();
    if (id) {
      navigate(`/verify/${id}`);
      setQ('');
    }
  };

  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-night/70 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
        <Link to={homeByRole[user.role]} className="lg:hidden" aria-label="SkillPass home">
          <Logo compact />
        </Link>
        <nav aria-label="Breadcrumb" className="hidden min-w-0 lg:block">
          <ol className="flex items-center gap-2 text-sm">
            <li><Link to={homeByRole[user.role]} className="text-ink-muted hover:text-ink">{role}</Link></li>
            {current &&
            <>
                <li aria-hidden="true" className="text-ink-subtle">/</li>
                <li className="truncate font-semibold text-ink" aria-current="page">{current}</li>
              </>
            }
          </ol>
        </nav>

        <form onSubmit={submit} role="search" className="ml-auto hidden w-full max-w-xs md:block lg:mx-auto lg:max-w-sm">
          <label htmlFor="topbar-verify" className="sr-only">{t('topbar.searchLabel')}</label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
            <input
              id="topbar-verify"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('topbar.search')}
              className="h-10 w-full rounded-full border border-line bg-canvas pl-9 font-mono pr-3 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
            
          </div>
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Link to="/verify" aria-label={t('topbar.verify')} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-canvas hover:text-ink md:hidden">
            <SearchIcon className="h-5 w-5" />
          </Link>
          <LanguageSwitcher className="mr-1 hidden sm:inline-flex" />
          <NotificationsMenu userId={user.id} />
          <span className="mx-1 hidden h-6 w-px bg-line md:block" aria-hidden="true" />
          <ProfileMenu />
        </div>
      </div>
    </header>);

}