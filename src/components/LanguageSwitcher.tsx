import { LanguagesIcon } from 'lucide-react';
import { LANGUAGES, useT, type Lang } from '../i18n';

/**
 * A compact language picker for headers. The choice is remembered on this device.
 * `compact` shrinks it to just the icon on phones; tapping still opens the full list.
 */
export function LanguageSwitcher({ className = '', compact = false }: {className?: string;compact?: boolean;}) {
  const { lang, setLang, t } = useT();
  const size = compact ?
  'w-10 px-0 text-transparent sm:w-auto sm:pl-8 sm:pr-3 sm:text-ink' :
  'pl-8 pr-3 text-ink';
  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="sr-only">{t('lang.label')}</span>
      <LanguagesIcon className={`pointer-events-none absolute h-4 w-4 text-ink-muted ${compact ? 'left-3 sm:left-2.5' : 'left-2.5'}`} aria-hidden="true" />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className={`h-10 appearance-none rounded-sm border border-line bg-canvas text-sm font-medium transition-colors duration-150 hover:bg-surface focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 [&>option]:bg-canvas [&>option]:text-ink ${size}`}>
        {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
    </label>);

}
