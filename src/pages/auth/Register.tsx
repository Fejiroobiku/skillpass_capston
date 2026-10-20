import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BriefcaseIcon, GraduationCapIcon, HardHatIcon } from 'lucide-react';
import { AuthLayout } from '../../components/AuthLayout';
import { useAuth, type RegisterInput } from '../../contexts/AuthContext';
import { useSkillPass } from '../../contexts/SkillPassContext';
import { LocationPicker } from '../../components/LocationPicker';
import type { Place } from '../../types/skillpass';
import { associations } from '../../data/integrity';
import { useT } from '../../i18n';

const input = 'mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';
const roles = [
{ id: 'apprentice' as const, label: 'role.apprentice' as const, icon: GraduationCapIcon },
{ id: 'trainer' as const, label: 'role.trainer' as const, icon: HardHatIcon },
{ id: 'employer' as const, label: 'role.employer' as const, icon: BriefcaseIcon }];


export function Register() {
  const { register } = useAuth();
  const { trades, trainers, notice, loadPublic } = useSkillPass();
  const navigate = useNavigate();
  const { t } = useT();
  const [role, setRole] = useState<RegisterInput['role']>('apprentice');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', dob: '', trade: '', trainerId: '', workshop: '', company: '', membershipNo: '' });
  const [location, setLocation] = useState<Place | null>(null);
  const [adult, setAdult] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value, ...(k === 'trade' ? { trainerId: '' } : {}) }));
    setError(null);
  };
  const tradeTrainers = trainers.filter((t) => t.trade === form.trade && t.approved);

  const valid =
  form.name.trim().length > 2 &&
  /\S+@\S+\.\S+/.test(form.email) &&
  form.phone.trim().length >= 10 &&
  form.password.length >= 8 &&
  !!form.dob &&
  !!form.trade &&
  !!location &&
  adult &&
  consent && (
  role !== 'apprentice' || !!form.trainerId) && (
  role !== 'employer' || form.company.trim().length > 1) && (
  role !== 'trainer' || form.membershipNo.trim().length > 3);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !location) return;
    setBusy(true);
    const err = await register({ role, name: form.name.trim(), email: form.email, phone: form.phone.trim(), password: form.password, dob: form.dob, trade: form.trade, location, trainerId: form.trainerId, workshop: form.workshop.trim(), company: form.company.trim(), membershipNo: form.membershipNo.trim(), consent });
    setBusy(false);
    if (err) return setError(err);
    navigate('/confirm-contact'); // confirm the phone number straight after joining
  };

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('register.title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('register.subtitle')}</p>
      {!trades.length && notice &&
      <div role="alert" className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-bad-200 bg-bad-50 px-4 py-3 text-sm text-bad-700">
          <span><span className="font-semibold">{t('register.tradesFailed')}</span> {notice}</span>
          <button type="button" onClick={() => void loadPublic()} className="shrink-0 rounded-lg px-2 py-1 font-semibold underline hover:bg-bad-100">{t('common.tryAgain')}</button>
        </div>
      }

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <fieldset>
          <legend className="text-sm font-semibold text-ink">{t('register.iAm')}</legend>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {roles.map((r) =>
            <button key={r.id} type="button" aria-pressed={role === r.id} onClick={() => setRole(r.id)} className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-medium transition-colors duration-150 ${role === r.id ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-line text-ink hover:bg-canvas'}`}>
                <r.icon className="h-5 w-5" /> {t(r.label)}
              </button>
            )}
          </div>
          {role === 'trainer' && <p className="mt-2 text-xs text-ink-muted">{t('register.trainerNote')}</p>}
        </fieldset>

        <div><label htmlFor="r-name" className="text-sm font-semibold text-ink">{t('register.name')}</label><input id="r-name" value={form.name} onChange={set('name')} className={input} autoComplete="name" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="r-email" className="text-sm font-semibold text-ink">{t('register.email')}</label><input id="r-email" type="email" value={form.email} onChange={set('email')} className={input} autoComplete="email" /></div>
          <div><label htmlFor="r-phone" className="text-sm font-semibold text-ink">{t('register.phone')}</label><input id="r-phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="0803 000 0000" className={input} autoComplete="tel" /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="r-pass" className="text-sm font-semibold text-ink">{t('register.password')}</label><input id="r-pass" type="password" value={form.password} onChange={set('password')} placeholder={t('register.passwordHint')} className={input} autoComplete="new-password" /></div>
          <div><label htmlFor="r-dob" className="text-sm font-semibold text-ink">{t('register.dob')}</label><input id="r-dob" type="date" value={form.dob} onChange={set('dob')} className={input} /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="r-trade" className="text-sm font-semibold text-ink">{t('register.trade')}</label>
            <select id="r-trade" value={form.trade} onChange={set('trade')} className={input}>
              <option value="" disabled>{trades.length ? t('register.chooseTrade') : t('register.loadingTrades')}</option>
              {trades.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <LocationPicker id="r-place" label={t('register.location')} onChange={setLocation} inputClassName={input.replace('mt-1.5 ', '')} />
          </div>
        </div>
        {role === 'apprentice' &&
        <div>
            <label htmlFor="r-trainer" className="text-sm font-semibold text-ink">{t('register.trainer')}</label>
            <select id="r-trainer" value={form.trainerId} onChange={set('trainerId')} className={input}>
              <option value="">{tradeTrainers.length ? t('register.chooseTrainer') : t('register.noTrainers')}</option>
              {tradeTrainers.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.workshop}</option>)}
            </select>
          </div>
        }
        {role === 'trainer' &&
        <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="r-workshop" className="text-sm font-semibold text-ink">{t('register.workshop')}</label><input id="r-workshop" value={form.workshop} onChange={set('workshop')} className={input} /></div>
            <div>
              <label htmlFor="r-member" className="text-sm font-semibold text-ink">{t('register.membership')}</label>
              <input id="r-member" value={form.membershipNo} onChange={set('membershipNo')} placeholder={t('register.membershipHint')} className={input} />
            </div>
            <p className="text-xs text-ink-muted sm:col-span-2">{t('register.association', { association: associations.find((a) => a.trade === form.trade)?.name ?? t('register.yourAssociation') })}</p>
          </div>
        }
        {role === 'employer' && <div><label htmlFor="r-company" className="text-sm font-semibold text-ink">{t('register.company')}</label><input id="r-company" value={form.company} onChange={set('company')} className={input} /></div>}

        <div className="space-y-2.5 rounded-xl bg-canvas p-4 text-sm">
          <label className="flex gap-3"><input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" /><span className="text-ink">{t('register.adult')}</span></label>
          <label className="flex gap-3"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" /><span className="text-ink">{t('register.consent')}</span></label>
        </div>

        {error && <p role="alert" className="rounded-xl bg-bad-50 px-3.5 py-2.5 text-sm font-medium text-bad-700">{error}</p>}
        <button type="submit" disabled={!valid || busy} className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-night transition-colors duration-150 hover:bg-brand-700 disabled:opacity-50">{busy ? t('register.busy') : t('register.submit')}</button>
      </form>
      <p className="mt-5 text-center text-sm text-ink-muted">{t('register.already')} <Link to="/login" className="font-semibold text-brand-700 hover:underline">{t('register.signIn')}</Link></p>
    </AuthLayout>);

}