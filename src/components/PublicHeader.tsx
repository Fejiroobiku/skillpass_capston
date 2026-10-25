import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { homeByRole } from '../data/navigation';
import { Logo } from './Logo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useT } from '../i18n';

export function PublicHeader() {
  const { user } = useAuth();
  const { t } = useT();
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-night/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 md:px-6">
        <Link to="/verify" aria-label="SkillPass verification"><Logo compact /></Link>
        <nav aria-label="Public" className="flex shrink-0 items-center gap-1 text-sm">
          <LanguageSwitcher compact className="mr-1" />
          <Link to="/verify" className="hidden rounded-lg px-3 py-2 sm:inline-flex font-medium text-ink-muted hover:bg-canvas hover:text-ink">{t('ph.verify')}</Link>
          {user ?
          <Link to={homeByRole[user.role]} className="whitespace-nowrap rounded-xl bg-brand-600 px-3 py-2 font-semibold sm:px-4 text-night transition-colors duration-150 hover:bg-brand-700">{t('ph.dashboard')}</Link> :

          <>
              <Link to="/login" className="whitespace-nowrap rounded-lg px-2 py-2 font-medium sm:px-3 text-ink-muted hover:bg-canvas hover:text-ink">{t('ph.signIn')}</Link>
              <Link to="/register" className="whitespace-nowrap rounded-xl bg-brand-600 px-3 py-2 font-semibold sm:px-4 text-night transition-colors duration-150 hover:bg-brand-700">{t('ph.join')}</Link>
            </>
          }
        </nav>
      </div>
    </header>);

}