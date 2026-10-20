import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2Icon, MailIcon, SmartphoneIcon } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../contexts/AuthContext';
import { homeByRole } from '../../data/navigation';
import { messageOf } from '../../api/client';
import { sendEmailLink, sendPhoneCode, verifyPhoneCode, type EmailSent } from '../../api/verification';
import { useT } from '../../i18n';

const input = 'w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-center font-mono text-2xl tracking-[0.4em] text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';
const primary = 'rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-night transition-colors duration-150 hover:bg-brand-700 disabled:opacity-50';
const ghost = 'rounded-xl px-4 py-3 text-sm font-semibold text-ink ring-1 ring-inset ring-line transition-colors duration-150 hover:bg-canvas disabled:opacity-50';

/** After sign-up (and any time later): confirm the phone by SMS code, and optionally the email by link. */
export function ConfirmContact() {
  const { user, refreshUser } = useAuth();
  const { t } = useT();
  const phoneDone = !!user?.account.phoneVerified;
  const emailDone = !!user?.account.emailVerified;

  // Phone
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const autoSent = useRef(false);

  const send = useCallback(async () => {
    setSending(true);
    setPhoneError(null);
    try {
      const r = await sendPhoneCode();
      if (r.alreadyVerified) return void refreshUser();
      setSentTo(r.sentTo ?? null);
      setDevCode(r.devCode ?? null);
      setWait(r.resendAfterSeconds ?? 60);
    } catch (e) {
      const message = messageOf(e);
      setPhoneError(message);
      const seconds = /wait (\d+) seconds/.exec(message);
      if (seconds) setWait(Number(seconds[1]));
    } finally {
      setSending(false);
    }
  }, [refreshUser]);

  // Send the first code straight away so the person only has to type it.
  useEffect(() => {
    if (phoneDone || autoSent.current) return;
    autoSent.current = true;
    void send();
  }, [phoneDone, send]);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setChecking(true);
    setPhoneError(null);
    try {
      await verifyPhoneCode(code);
      await refreshUser();
    } catch (err) {
      setPhoneError(messageOf(err));
      setCode('');
    } finally {
      setChecking(false);
    }
  };

  // Email
  const [email, setEmail] = useState<EmailSent | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const sendEmail = async () => {
    setEmailBusy(true);
    setEmailError(null);
    try {
      const r = await sendEmailLink();
      if (r.alreadyVerified) await refreshUser();else
      setEmail(r);
    } catch (e) {
      setEmailError(messageOf(e));
    } finally {
      setEmailBusy(false);
    }
  };

  if (!user) return null;
  const home = homeByRole[user.role];

  return (
    <>
      <PageHeader title={t('contact.title')} subtitle={t('contact.subtitle')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t('contact.phone')} aside={<SmartphoneIcon className="h-5 w-5 text-ink-muted" aria-hidden="true" />}>
          {phoneDone ?
          <p role="status" className="flex items-center gap-2 rounded-xl bg-ok-50 p-4 text-sm font-semibold text-ok-700"><CheckCircle2Icon className="h-5 w-5" /> {t('contact.phoneDone')}</p> :

          <form onSubmit={verify} className="space-y-4">
              {sentTo && <p className="text-sm text-ink-muted">{t('contact.sentTo', { to: sentTo })}</p>}
              {devCode && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{t('contact.demoCode', { code: devCode })}</p>}
              <div>
                <label htmlFor="sms-code" className="mb-1.5 block text-sm font-semibold text-ink">{t('contact.codeLabel')}</label>
                <input
                id="sms-code"
                value={code}
                onChange={(e) => {setCode(e.target.value.replace(/\D/g, '').slice(0, 6));setPhoneError(null);}}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                className={input} />

              </div>
              {phoneError && <p role="alert" className="rounded-xl bg-bad-50 px-3.5 py-2.5 text-sm font-medium text-bad-700">{phoneError}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={code.length !== 6 || checking} className={primary}>{checking ? t('contact.verifying') : t('contact.verify')}</button>
                <button type="button" onClick={() => void send()} disabled={sending || wait > 0} className={ghost}>
                  {sending ? t('contact.sending') : wait > 0 ? t('contact.resendIn', { seconds: wait }) : t('contact.resend')}
                </button>
              </div>
            </form>
          }
        </Panel>

        <Panel title={t('contact.email')} description={emailDone ? undefined : t('contact.emailWhy')} aside={<MailIcon className="h-5 w-5 text-ink-muted" aria-hidden="true" />}>
          {emailDone ?
          <p role="status" className="flex items-center gap-2 rounded-xl bg-ok-50 p-4 text-sm font-semibold text-ok-700"><CheckCircle2Icon className="h-5 w-5" /> {t('contact.emailDone')}</p> :

          <div className="space-y-3">
              {email?.sentTo && <p role="status" className="text-sm text-ink-muted">{t('contact.emailSent', { to: email.sentTo })}</p>}
              {email?.devLink &&
            <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{t('contact.demoLink')} <a href={email.devLink} className="break-all font-mono underline">{email.devLink}</a></p>
            }
              {emailError && <p role="alert" className="rounded-xl bg-bad-50 px-3.5 py-2.5 text-sm font-medium text-bad-700">{emailError}</p>}
              <button type="button" onClick={() => void sendEmail()} disabled={emailBusy} className={ghost}>{emailBusy ? t('contact.sending') : t('contact.emailSend')}</button>
            </div>
          }
        </Panel>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to={home} className={phoneDone ? primary : ghost}>{phoneDone ? t('contact.continue') : t('contact.later')}</Link>
      </div>
    </>);

}
