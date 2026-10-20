import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon, CopyIcon, EyeOffIcon, ExternalLinkIcon, PrinterIcon, RefreshCwIcon } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { PassportView } from '../../components/PassportView';
import { useAuth } from '../../contexts/AuthContext';
import { api, messageOf } from '../../api/client';
import { useT } from '../../i18n';

interface Share {
  token: string;
  public: boolean;
}

const ME = { me: true } as const;

export function SkillsPassport() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [share, setShare] = useState<Share | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { t } = useT();

  useEffect(() => {
    api.get<{share: Share;}>('/api/passport/me').then((r) => setShare(r.share)).catch((e) => setMessage(messageOf(e)));
  }, []);

  if (!user) return null;
  const path = share ? `/passport/${share.token}` : null;
  const url = path ? `${window.location.origin}${path}` : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {

      /* clipboard unavailable */}
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const change = async (fn: () => Promise<{share: Share;}>, done?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      setShare((await fn()).share);
      if (done) setMessage(done);
    } catch (e) {
      setMessage(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const ghost = 'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-ink ring-1 ring-inset ring-line transition-colors duration-150 hover:bg-white/10 disabled:opacity-50';

  return (
    <>
      <PageHeader title={t('passport.title')} subtitle={t('passport.subtitle')} />
      <PassportView
        source={ME}
        shareUrl={share?.public ? url : null}
        actions={
        <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {share?.public ?
            <>
                  <span className="max-w-full truncate rounded-lg bg-white/10 px-3 py-2 font-mono text-sm">{url.replace(/^https?:\/\//, '')}</span>
                  <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-night transition-colors duration-150 hover:bg-brand-700">
                    {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />} {copied ? t('passport.copied') : t('passport.copy')}
                  </button>
                  {path && <Link to={path} className={ghost}><ExternalLinkIcon className="h-4 w-4" /> {t('passport.public')}</Link>}
                </> :
            share && <span className="inline-flex items-center gap-2 rounded-lg bg-warn-50 px-3 py-2 text-sm font-semibold text-warn-700"><EyeOffIcon className="h-4 w-4" /> {t('passport.offBadge')}</span>
            }
              <button type="button" onClick={() => window.print()} className={ghost}>
                <PrinterIcon className="h-4 w-4" /> {t('passport.print')}
              </button>
            </div>

            {share &&
          <div className="grid gap-3 text-sm sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white/5 p-3">
                  <input
                type="checkbox"
                role="switch"
                checked={share.public}
                disabled={busy}
                onChange={(e) => void change(() => api.patch<{share: Share;}>('/api/passport/me', { public: e.target.checked }))}
                className="mt-0.5 h-4 w-4 accent-brand-600" />

                  <span>
                    <span className="block font-semibold text-ink">{t('passport.publicLabel')}</span>
                    <span className="block text-ink-muted">{share.public ? t('passport.publicOn') : t('passport.publicOff')}</span>
                  </span>
                </label>
                <div className="rounded-xl bg-white/5 p-3">
                  <button type="button" disabled={busy} onClick={() => void change(() => api.post<{share: Share;}>('/api/passport/me/new-link'), t('passport.newLinkDone'))} className={ghost}>
                    <RefreshCwIcon className="h-4 w-4" /> {t('passport.newLink')}
                  </button>
                  <p className="mt-2 text-ink-muted">{t('passport.newLinkHelp')}</p>
                </div>
              </div>
          }
            {message && <p role="status" className="text-sm font-medium text-brand-700">{message}</p>}
          </div>
        } />

    </>);

}
