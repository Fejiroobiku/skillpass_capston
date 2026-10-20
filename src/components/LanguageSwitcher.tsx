import React from 'react';
import { LanguagesIcon } from 'lucide-react';
import { LANGUAGES, useT, type Lang } from '../i18n';

/** A compact language picker for headers. The choice is remembered on this device. */
export function LanguageSwitcher({ className = '' }: {className?: string;}) {
  const { lang, setLang, t } = useT();
  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="sr-only">{t('lang.label')}</span>
      <LanguagesIcon className="pointer-events-none absolute left-2.5 h-4 w-4 text-ink-muted" aria-hidden="true" />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="h-10 appearance-none rounded-full border border-line bg-canvas pl-8 pr-3 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
        {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
    </label>);

}
