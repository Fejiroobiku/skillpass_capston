import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon, MapPinIcon, MessageSquareIcon, StarIcon, XIcon } from 'lucide-react';
import type { Referral } from '../../types/skillpass';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { btnPrimary, btnSecondary, inputCls } from '../../components/jobs/JobParts';
import { naira } from '../../api/jobs';
import { Pill } from '../../components/StatusBadge';
import { useSkillPass } from '../../contexts/SkillPassContext';
import { useAuth } from '../../contexts/AuthContext';
import { scoreMatch } from '../../utils/matching';
import { formatDate } from '../../utils/credentials';
import { useT } from '../../i18n';

const statusCopy = {
  sent: { tone: 'neutral' as const, label: 'jobs.status.sent' as const },
  accepted: { tone: 'ok' as const, label: 'jobs.status.accepted' as const },
  contacted: { tone: 'ok' as const, label: 'jobs.status.contacted' as const },
  declined: { tone: 'bad' as const, label: 'jobs.status.declined' as const }
};

export function JobReferrals() {
  const { user } = useAuth();
  const { referrals, jobs, credentials, apprentices, employers, skills, setReferralStatus, sendQuote, employerRatingSummary } = useSkillPass();
  const me = apprentices.find((a) => a.id === user?.id);
  const { t } = useT();
  const [quoting, setQuoting] = useState<Referral | null>(null);
  const [q, setQ] = useState({ workmanship: '', materials: '', availableFrom: '', note: '' });
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;
  const mine = referrals.filter((r) => r.apprenticeId === me.id);
  const quoteJob = quoting ? jobs.find((j) => j.id === quoting.jobId) : undefined;
  const artisanBuys = quoteJob?.materialsBy === 'artisan';
  const today = new Date().toISOString().slice(0, 10);
  const openQuote = (r: Referral) => {
    const job = jobs.find((j) => j.id === r.jobId);
    setQuoting(r);
    setError(null);
    setQ({ workmanship: job?.workmanshipBudget ? String(job.workmanshipBudget) : '', materials: job?.materialsBy === 'artisan' && job.materialsBudget ? String(job.materialsBudget) : '', availableFrom: today, note: '' });
  };
  const send = async () => {
    if (!quoting) return;
    const err = await sendQuote(quoting.id, { workmanship: Number(q.workmanship), materials: artisanBuys ? Number(q.materials) : null, availableFrom: q.availableFrom, note: q.note.trim() });
    if (err) return setError(err);
    setQuoting(null);
  };

  return (
    <>
      <PageHeader title={t('jobs.title')} subtitle={t('jobs.subtitle')} />
      {mine.length === 0 ?
      <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
          <p className="font-semibold text-ink">{t('jobs.none')}</p>
          <p className="mt-1 text-sm text-ink-muted">{t('jobs.noneBody')}</p>
        </div> :

      <ul className="space-y-4">
          {mine.map((r) => {
          const job = jobs.find((j) => j.id === r.jobId);
          if (!job) return null;
          const m = scoreMatch(job, me, credentials);
          const employer = employers.find((e) => e.id === job.employerId);
          const s = statusCopy[r.status];
          return (
            <li key={r.id} className="rounded-2xl border border-line bg-surface p-5 md:p-6">
                <div className="flex flex-col gap-5 md:flex-row md:items-start">
                  <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <span className="text-xl font-semibold">{m.score}%</span>
                    <span className="text-[10px] font-medium">{t('jobs.match')}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-ink">{job.title}</h2>
                      <Pill tone={s.tone}>{t(s.label)}</Pill>
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">{employer?.company} · {t('quote.budget', { amount: job.pay })} · {t(job.materialsBy === 'artisan' ? 'quote.whoBuys.artisan' : 'quote.whoBuys.employer')}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
                      <StarIcon className="h-3.5 w-3.5 text-warn-600" aria-hidden="true" />
                      {employerRatingSummary[job.employerId] ? t('quote.employerRating', { avg: employerRatingSummary[job.employerId].avg, count: employerRatingSummary[job.employerId].count }) : t('quote.employerNew')}
                    </p>
                    {r.quote && <p className="mt-1 text-sm font-medium text-ink">{t('quote.yours', { amount: naira(r.quote.workmanship + (r.quote.materials ?? 0)) })}</p>}
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted"><MapPinIcon className="h-4 w-4" /> {m.distance < 0.5 ? t('jobs.whereNear', { place: job.location.name, date: formatDate(r.sentAt) }) : t('jobs.where', { place: job.location.name, km: m.distance.toFixed(1), date: formatDate(r.sentAt) })}</p>
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {job.skillIds.map((id) => {
                      const has = m.matchedSkillIds.includes(id);
                      return (
                        <li key={id} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${has ? 'bg-ok-50 text-ok-700' : 'bg-canvas text-ink-muted'}`}>
                            {has ? <CheckIcon className="h-3.5 w-3.5" /> : <XIcon className="h-3.5 w-3.5" />}
                            {skills.find((x) => x.id === id)?.name}
                          </li>);

                    })}
                    </ul>
                  </div>
                  {r.status === 'sent' &&
                <div className="flex gap-2 md:flex-col">
                      <button type="button" onClick={() => openQuote(r)} className="flex-1 whitespace-nowrap rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-night transition-colors duration-150 hover:bg-brand-700">{t('jobs.interested')}</button>
                      <button type="button" onClick={() => setReferralStatus(r.id, 'declined')} className="flex-1 rounded-xl border border-line px-5 py-2.5 text-sm font-medium text-ink transition-colors duration-150 hover:bg-canvas">{t('jobs.decline')}</button>
                    </div>
                }
                  {r.status === 'accepted' &&
                <p className="flex items-center gap-2 text-sm text-ink-muted md:max-w-[200px]"><MessageSquareIcon className="h-4 w-4 shrink-0" /> {t('jobs.shared')}</p>
                }
                {r.status === 'contacted' &&
                <Link to="/apprentice/work" className={btnSecondary}>{t('nav.work')}</Link>
                }
                </div>
              </li>);

        })}
        </ul>
      }
      <Modal open={!!quoting} title={t('quote.title')} onClose={() => setQuoting(null)}>
        {quoteJob &&
        <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">{t('quote.title')}</h2>
              <p className="mt-1 text-sm text-ink-muted">{quoteJob.title} · {t('quote.intro')}</p>
            </div>
            <div>
              <label htmlFor="q-work" className="block text-sm font-semibold text-ink">{t('quote.workmanship')}</label>
              <input id="q-work" inputMode="numeric" value={q.workmanship} onChange={(e) => setQ({ ...q, workmanship: e.target.value.replace(/\D/g, '') })} className={`${inputCls} font-mono`} />
              <p className="mt-1 text-xs text-ink-subtle">{t('quote.workmanshipHelp')}</p>
            </div>
            {artisanBuys ?
          <div>
                <label htmlFor="q-mat" className="block text-sm font-semibold text-ink">{t('quote.materials')}</label>
                <input id="q-mat" inputMode="numeric" value={q.materials} onChange={(e) => setQ({ ...q, materials: e.target.value.replace(/\D/g, '') })} className={`${inputCls} font-mono`} />
                <p className="mt-1 text-xs text-ink-subtle">{t('quote.materialsHelp')}</p>
              </div> :
          <p className="rounded-sm bg-canvas p-3 text-sm text-ink-muted">{t('quote.employerBuys')}</p>}
            <div>
              <label htmlFor="q-date" className="block text-sm font-semibold text-ink">{t('quote.available')}</label>
              <input id="q-date" type="date" min={today} value={q.availableFrom} onChange={(e) => setQ({ ...q, availableFrom: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label htmlFor="q-note" className="block text-sm font-semibold text-ink">{t('quote.note')}</label>
              <textarea id="q-note" rows={2} value={q.note} onChange={(e) => setQ({ ...q, note: e.target.value })} placeholder={t('quote.notePlaceholder')} className={`${inputCls} resize-none`} />
            </div>
            {error && <p role="alert" className="rounded-sm bg-bad-50 p-2.5 text-sm text-bad-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setQuoting(null)} className={btnSecondary}>{t('common.cancel')}</button>
              <button type="button" disabled={!Number(q.workmanship) || (artisanBuys && !Number(q.materials)) || !q.availableFrom} onClick={send} className={btnPrimary}>{t('quote.send')}</button>
            </div>
          </div>
        }
      </Modal>
    </>);

}