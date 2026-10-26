import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileTextIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { acceptLatestTerms } from '../api/jobs';
import { messageOf } from '../api/client';
import { termsText } from '../data/terms';
import { useT } from '../i18n';

/**
 * Shown over the dashboard when the person has not accepted the Terms of Service in force (for example, accounts
 * created before the terms existed, or after the terms change). They can read the summary here or the full terms.
 */
export function TermsGate() {
  const { user, refreshUser } = useAuth();
  const { t, lang } = useT();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = user?.account.termsCurrent;
  if (!user || !current || user.account.termsVersion === current) return null;
  const tx = termsText[lang] ?? termsText.en;

  const accept = async () => {
    setBusy(true);
    try {
      await acceptLatestTerms(current);
      await refreshUser();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-night/85 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="terms-gate-title">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-sm border border-line bg-raised p-6">
        <FileTextIcon className="h-6 w-6 text-brand-500" aria-hidden="true" />
        <h2 id="terms-gate-title" className="mt-3 text-xl font-semibold text-ink">{t('termsGate.title')}</h2>
        <p className="mt-2 text-sm text-ink-muted">{t('termsGate.body')}</p>
        <ol className="mt-4 space-y-2 rounded-sm border border-line bg-canvas p-4">
          {tx.short.map((s, i) => <li key={i} className="flex gap-2 text-xs leading-relaxed text-ink"><span className="font-mono text-brand-500">{i + 1}.</span>{s}</li>)}
        </ol>
        <Link to="/terms" target="_blank" className="mt-3 inline-block text-sm font-medium text-brand-700 underline">{t('termsGate.read')}</Link>
        <label className="mt-4 flex gap-3 text-sm"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" /><span className="text-ink">{t('termsGate.accept')}</span></label>
        {error && <p role="alert" className="mt-3 rounded-sm bg-bad-50 p-2.5 text-sm text-bad-700">{error}</p>}
        <button type="button" disabled={!checked || busy} onClick={accept} className="mt-5 w-full rounded-sm bg-brand-600 px-4 py-3 text-sm font-semibold text-night hover:bg-brand-700 disabled:opacity-40">{t('termsGate.accept')}</button>
      </div>
    </div>);

}
