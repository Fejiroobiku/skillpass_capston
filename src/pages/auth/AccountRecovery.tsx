import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2Icon } from 'lucide-react';
import { AuthLayout } from '../../components/AuthLayout';
import { useAuth } from '../../contexts/AuthContext';
import { messageOf } from '../../api/client';
import { requestPasswordReset, resetPassword, verifyEmailToken } from '../../api/verification';
import { useT } from '../../i18n';

const input = 'mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';
const primary = 'w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-night transition-colors duration-150 hover:bg-brand-700 disabled:opacity-50';
const ok = 'flex items-start gap-2 rounded-xl bg-ok-50 p-4 text-sm font-medium text-ok-700';
const bad = 'rounded-xl bg-bad-50 px-3.5 py-2.5 text-sm font-medium text-bad-700';

/** Opened from the confirmation email: /verify-email?token=… */
export function VerifyEmail() {
  const [params] = useSearchParams();
  const { user, refreshUser } = useAuth();
  const { t } = useT();
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get('token') ?? '';
    verifyEmailToken(token).
    then(async () => {
      setState('done');
      await refreshUser();
    }).
    catch((e) => {
      setError(messageOf(e));
      setState('failed');
    });
  }, [params, refreshUser]);

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('verifyEmail.title')}</h1>
      <div className="mt-6 space-y-4" aria-live="polite">
        {state === 'working' && <p className="text-sm text-ink-muted">{t('verifyEmail.working')}</p>}
        {state === 'done' && <p className={ok}><CheckCircle2Icon className="h-5 w-5 shrink-0" /> {t('verifyEmail.done')}</p>}
        {state === 'failed' && <p role="alert" className={bad}>{error ?? t('verifyEmail.failed')}</p>}
        {state !== 'working' && <Link to={user ? '/' : '/login'} className={`block text-center ${primary}`}>{t('verifyEmail.home')}</Link>}
      </div>
    </AuthLayout>);

}

/** /forgot-password: ask for a reset link. The answer is the same whether or not the email has an account. */
export function ForgotPassword() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{message: string;devLink?: string;} | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSent(await requestPasswordReset(email.trim()));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('forgot.title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('forgot.subtitle')}</p>
      {sent ?
      <div className="mt-6 space-y-3" aria-live="polite">
          <p className={ok}><CheckCircle2Icon className="h-5 w-5 shrink-0" /> {sent.message}</p>
          {sent.devLink && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{t('contact.demoLink')} <a href={sent.devLink} className="break-all font-mono underline">{sent.devLink}</a></p>}
          <p className="text-xs text-ink-muted">{t('forgot.noEmail')}</p>
        </div> :

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="forgot-email" className="text-sm font-semibold text-ink">{t('forgot.email')}</label>
            <input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="you@example.com" />
          </div>
          {error && <p role="alert" className={bad}>{error}</p>}
          <button type="submit" disabled={!/\S+@\S+\.\S+/.test(email) || busy} className={primary}>{busy ? t('forgot.sending') : t('forgot.submit')}</button>
        </form>
      }
      <p className="mt-5 text-center text-sm"><Link to="/login" className="font-semibold text-brand-700 hover:underline">{t('forgot.back')}</Link></p>
    </AuthLayout>);

}

/** Opened from the reset email: /reset-password?token=… */
export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { t } = useT();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^[0-9a-f]{48}$/.test(token);
  const mismatch = again.length > 0 && again !== password;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8 || mismatch) return;
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('reset.title')}</h1>
      {!valid ? <p role="alert" className={`mt-6 ${bad}`}>{t('reset.invalid')}</p> :
      done ?
      <div className="mt-6 space-y-4" aria-live="polite">
            <p className={ok}><CheckCircle2Icon className="h-5 w-5 shrink-0" /> {t('reset.done')}</p>
            <Link to="/login" className={`block text-center ${primary}`}>{t('reset.signIn')}</Link>
          </div> :

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="reset-pass" className="text-sm font-semibold text-ink">{t('reset.password')}</label>
              <input id="reset-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('register.passwordHint')} className={input} />
            </div>
            <div>
              <label htmlFor="reset-again" className="text-sm font-semibold text-ink">{t('reset.confirm')}</label>
              <input id="reset-again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className={input} />
            </div>
            {mismatch && <p className="text-sm text-bad-700">{t('reset.mismatch')}</p>}
            {error && <p role="alert" className={bad}>{error}</p>}
            <button type="submit" disabled={password.length < 8 || again !== password || busy} className={primary}>{busy ? t('reset.saving') : t('reset.submit')}</button>
          </form>
      }
    </AuthLayout>);

}
