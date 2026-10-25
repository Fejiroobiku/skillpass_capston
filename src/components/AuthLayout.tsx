import React from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheckIcon, SearchCheckIcon, ShieldCheckIcon } from 'lucide-react';
import { Logo } from './Logo';
import { evidencePhotos } from '../data/evidence';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n/en';

const points: {icon: typeof BadgeCheckIcon;key: MessageKey;}[] = [
{ icon: BadgeCheckIcon, key: 'auth.point1' },
{ icon: ShieldCheckIcon, key: 'auth.point2' },
{ icon: SearchCheckIcon, key: 'auth.point3' }];


export function AuthLayout({ children }: {children: React.ReactNode;}) {
  const { t } = useT();
  return (
    <div className="flex min-h-full w-full">
      <aside className="relative hidden w-[44%] max-w-[560px] flex-col justify-between overflow-hidden border-r border-line bg-gradient-to-br from-brand-500/15 via-night to-violet-500/20 p-10 text-ink lg:flex">
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <Logo />
        <div>
          <img src={evidencePhotos.electrical} alt={t('auth.photoAlt')} className="relative mb-8 aspect-[4/3] w-full rounded-3xl object-cover ring-1 ring-white/15 shadow-glow" />
          <h2 className="relative text-4xl font-semibold leading-tight tracking-tight">{t('auth.headline')}</h2>
          <ul className="mt-6 space-y-3">
            {points.map((p) =>
            <li key={p.key} className="flex gap-3 text-sm text-ink-muted"><p.icon className="h-5 w-5 shrink-0 text-brand-500" />{t(p.key)}</li>
            )}
          </ul>
        </div>
        <p className="font-mono text-xs text-ink-subtle">{t('auth.pilot')}</p>
      </aside>
      <main className="flex flex-1 flex-col">
        <div className="flex h-16 items-center justify-between px-5 md:px-8">
          <span className="lg:hidden"><Logo compact /></span>
          <div className="ml-auto flex items-center gap-3">
            <LanguageSwitcher compact />
            <Link to="/verify" className="whitespace-nowrap text-sm font-medium text-ink-muted hover:text-ink">{t('auth.verifyLink')}</Link>
          </div>
        </div>
        <div className="flex flex-1 items-start justify-center px-5 pb-12 pt-4 md:items-center md:px-8">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </main>
    </div>);

}