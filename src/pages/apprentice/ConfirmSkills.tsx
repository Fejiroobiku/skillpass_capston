import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon, LockIcon, ShieldCheckIcon, XIcon } from 'lucide-react';
import type { ConcernCategory } from '../../types/skillpass';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { Modal } from '../../components/Modal';
import { TrustBadge } from '../../components/TrustBadge';
import { useSkillPass } from '../../contexts/SkillPassContext';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateTime } from '../../utils/credentials';
import { useT } from '../../i18n';

const concernKeys = { payment: 'concern.payment', pressure: 'concern.pressure', false_record: 'concern.false_record', other: 'concern.other' } as const;
const reportStatusKeys = { open: 'reportStatus.open', investigating: 'reportStatus.investigating', closed: 'reportStatus.closed' } as const;

export function ConfirmSkills() {
  const { user } = useAuth();
  const { credentials, skills, reports, confirmCredential, disputeCredential, reportConcern } = useSkillPass();
  const pending = credentials.filter((c) => c.apprenticeId === user?.id && c.status === 'pending_apprentice');
  const myReports = reports.filter((r) => r.apprenticeId === user?.id);
  const [disputing, setDisputing] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [category, setCategory] = useState<ConcernCategory>('payment');
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const { t } = useT();

  const submitReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || details.trim().length < 10) return;
    reportConcern(user.id, category, details.trim());
    setDetails('');
    setSent(true);
  };

  return (
    <>
      <PageHeader title={t('confirm.title')} subtitle={t('confirm.subtitle')} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title={t('confirm.waiting')} description={t('confirm.waitingDesc')}>
          {done && <p role="status" className="mb-4 rounded-xl bg-ok-50 p-3 text-sm font-medium text-ok-700">{done}</p>}
          {pending.length === 0 ?
          <div className="rounded-xl bg-canvas p-8 text-center">
              <ShieldCheckIcon className="mx-auto h-8 w-8 text-ink-subtle" />
              <p className="mt-2 text-sm text-ink-muted">{t('confirm.nothing')}</p>
            </div> :

          <ul className="space-y-4">
              {pending.map((c) => {
              const skill = skills.find((s) => s.id === c.skillId);
              const ev = c.evidence[0];
              return (
                <li key={c.id} className="overflow-hidden rounded-xl border border-line">
                    <div className="flex gap-4 p-4">
                      {ev && <img src={ev.poster ?? ev.url} alt={ev.caption} className="h-20 w-24 shrink-0 rounded-lg object-cover" />}
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{skill?.name}</p>
                        <p className="mt-0.5 text-sm text-ink-muted">{t('confirm.recordedBy')} <TrustBadge trainerId={c.trainerId} /></p>
                        <p className="text-xs text-ink-subtle">{formatDateTime(c.issuedAt)} · {ev?.locationLabel}</p>
                        <Link to={`/verify/${c.id}`} className="mt-1 inline-block text-xs font-medium text-brand-700 hover:underline">{t('confirm.seeEvidence')}</Link>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 border-t border-line">
                      <button type="button" onClick={() => {setDisputing(c.id);setDisputeReason('');}} className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-bad-700 transition-colors duration-150 hover:bg-bad-50">
                        <XIcon className="h-4 w-4" /> {t('confirm.didnt')}
                      </button>
                      <button type="button" onClick={() => {confirmCredential(c.id);setDone(t('confirm.done', { skill: skill?.name ?? '' }));}} className="flex items-center justify-center gap-2 border-l border-line bg-brand-600 px-4 py-3 text-sm font-semibold text-night transition-colors duration-150 hover:bg-brand-700">
                        <CheckIcon className="h-4 w-4" /> {t('confirm.did')}
                      </button>
                    </div>
                  </li>);

            })}
            </ul>
          }
        </Panel>

        <Panel title={t('confirm.reportTitle')} description={t('confirm.reportDesc')} aside={<LockIcon className="h-4 w-4 text-ink-muted" aria-hidden="true" />} className="self-start">
          {sent ?
          <div role="status" className="rounded-xl bg-ok-50 p-4 text-sm text-ok-700">
              <p className="font-semibold">{t('confirm.received')}</p>
              <p className="mt-1">{t('confirm.receivedBody')}</p>
              <button type="button" onClick={() => setSent(false)} className="mt-3 font-semibold underline">{t('confirm.sendAnother')}</button>
            </div> :

          <form onSubmit={submitReport} className="space-y-4">
              <fieldset>
                <legend className="text-sm font-semibold text-ink">{t('confirm.whatHappened')}</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(Object.keys(concernKeys) as ConcernCategory[]).map((k) =>
                <button key={k} type="button" aria-pressed={category === k} onClick={() => setCategory(k)} className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${category === k ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-line text-ink hover:bg-canvas'}`}>{t(concernKeys[k])}</button>
                )}
                </div>
              </fieldset>
              <div>
                <label htmlFor="concern" className="text-sm font-semibold text-ink">{t('confirm.details')}</label>
                <textarea id="concern" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t('confirm.detailsPlaceholder')} className="mt-1.5 w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
              </div>
              <button type="submit" disabled={details.trim().length < 10} className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-night transition-colors duration-150 hover:bg-ink/90 disabled:opacity-40">{t('confirm.send')}</button>
              {myReports.length > 0 && <p className="text-xs text-ink-muted">{t(myReports.length > 1 ? 'confirm.sentMany' : 'confirm.sentOne', { count: myReports.length, status: t(reportStatusKeys[myReports[0].status]) })}</p>}
            </form>
          }
        </Panel>
      </div>

      <Modal open={!!disputing} title={t('confirm.modalTitle')} onClose={() => setDisputing(null)}>
        <p className="text-sm text-ink-muted">{t('confirm.modalBody')}</p>
        <textarea rows={3} aria-label={t('confirm.reason')} value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} placeholder={t('confirm.reasonPlaceholder')} className="mt-3 w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setDisputing(null)} className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas">{t('common.cancel')}</button>
          <button type="button" disabled={disputeReason.trim().length < 5} onClick={() => {if (disputing) disputeCredential(disputing, disputeReason.trim());setDisputing(null);setDone(t('confirm.flagged'));}} className="rounded-xl bg-bad-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-bad-700 disabled:opacity-40">{t('confirm.flagIt')}</button>
        </div>
      </Modal>
    </>);

}