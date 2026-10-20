import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en, type MessageKey } from './en';
import { pcm } from './pcm';

/**
 * Translations without any extra library.
 *
 * To add a language (Yoruba, Hausa, Igbo…): copy pcm.ts to yo.ts, translate every line with a native speaker,
 * then add it to `dictionaries` and `LANGUAGES` below. Missing keys fall back to English.
 */
export type Lang = 'en' | 'pcm';

const dictionaries: Record<Lang, Partial<Record<MessageKey, string>>> = { en, pcm };

export const LANGUAGES: {id: Lang;label: string;}[] = [
{ id: 'en', label: 'English' },
{ id: 'pcm', label: 'Naija Pidgin' }];


const STORAGE_KEY = 'skillpass.lang';

function initialLang(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && saved in dictionaries) return saved as Lang;
  } catch {

    /* storage unavailable: use English */}
  return 'en';
}

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

interface I18nState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translate;
}

const I18nContext = createContext<I18nState | null>(null);

export function LanguageProvider({ children }: {children: React.ReactNode;}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {

      /* storage unavailable: the choice lasts until the tab closes */}
  }, []);

  const t = useCallback<Translate>((key, vars) => {
    const text = dictionaries[lang][key] ?? en[key];
    return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => name in vars ? String(vars[name]) : m) : text;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Use inside components: const { t } = useT(); t('login.title') */
export function useT(): I18nState {
  const ctx = useContext(I18nContext);
  // Outside the provider (for example in a lone component test) fall back to English.
  if (!ctx) {
    const t: Translate = (key, vars) => vars ? en[key].replace(/\{(\w+)\}/g, (m, name: string) => name in vars ? String(vars[name]) : m) : en[key];
    return { lang: 'en', setLang: () => undefined, t };
  }
  return ctx;
}
