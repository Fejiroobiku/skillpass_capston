import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon, CopyIcon, ExternalLinkIcon, PrinterIcon } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { PassportView } from '../../components/PassportView';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../i18n';

export function SkillsPassport() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const { t } = useT();
  if (!user) return null;
  const path = `/passport/${user.id}`;
  const url = `${window.location.origin}${path}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {

      /* clipboard unavailable */}
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <PageHeader title={t('passport.title')} subtitle={t('passport.subtitle')} />
      <PassportView
        apprenticeId={user.id}
        actions={
        <>
            <span className="max-w-full truncate rounded-lg bg-white/10 px-3 py-2 font-mono text-sm">{url.replace(/^https?:\/\//, '')}</span>
            <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-night transition-colors duration-150 hover:bg-brand-700">
              {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />} {copied ? t('passport.copied') : t('passport.copy')}
            </button>
            <Link to={path} className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-ink ring-1 ring-inset ring-line transition-colors duration-150 hover:bg-white/10">
              <ExternalLinkIcon className="h-4 w-4" /> {t('passport.public')}
            </Link>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-ink ring-1 ring-inset ring-line transition-colors duration-150 hover:bg-white/10">
              <PrinterIcon className="h-4 w-4" /> {t('passport.print')}
            </button>
          </>
        } />
      
    </>);

}