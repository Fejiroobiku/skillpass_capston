import { useEffect, useState } from 'react';
import { CalendarIcon, CameraIcon, LandmarkIcon, StarIcon } from 'lucide-react';
import type { Agreement } from '../../types/skillpass';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { Modal } from '../../components/Modal';
import { StarRating } from '../../components/StarRating';
import { CameraModal } from '../../components/evidence/CameraModal';
import { AgreementPill, AgreementSteps, DisputeModal, DisputeThread, JobTermsSummary, MoneyBreakdown, PhotoStrip, RatingModal, btnDanger, btnPrimary, btnSecondary, inputCls } from '../../components/jobs/JobParts';
import { useSkillPass } from '../../contexts/SkillPassContext';
import { useAuth } from '../../contexts/AuthContext';
import { jobPhotoUploader, loadBanks, naira } from '../../api/jobs';
import { formatDate, formatDateTime } from '../../utils/credentials';
import { useT } from '../../i18n';

/** Where an artisan sees job offers, accepts terms, records the work with photos, gets paid and rates employers. */
export function ArtisanWork() {
  const { user } = useAuth();
  const sp = useSkillPass();
  const { agreements, payments, jobPhotos, disputes, employerRatings, jobs, employers, apprentices, settings, payoutAccount, nameOf } = sp;
  const { t } = useT();
  const me = user?.id ?? '';
  const mine = agreements.filter((a) => a.artisanId === me);
  const offers = mine.filter((a) => a.status === 'proposed');
  const active = mine.filter((a) => ['accepted', 'in_progress', 'submitted', 'disputed'].includes(a.status));
  const finished = mine.filter((a) => ['completed', 'resolved', 'cancelled'].includes(a.status));
  const reviewDays = settings.reviewDays ?? 3;
  const jobOf = (id: string) => jobs.find((j) => j.id === id);
  const company = (id: string) => employers.find((e) => e.id === id)?.company ?? nameOf(id);
  const workshop = apprentices.find((a) => a.id === me)?.location ?? { name: 'Site', lat: 0, lng: 0 };

  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<Agreement | null>(null);
  const [agree, setAgree] = useState(false);
  const [declining, setDeclining] = useState<Agreement | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [camera, setCamera] = useState<{a: Agreement;stage: 'before' | 'after';} | null>(null);
  const [disputing, setDisputing] = useState<Agreement | null>(null);
  const [rating, setRating] = useState<Agreement | null>(null);
  const [editingBank, setEditingBank] = useState(false);

  const run = async (fn: () => Promise<string | null>) => {
    setError(null);
    const err = await fn();
    if (err) setError(err);
    return err;
  };

  const card = (a: Agreement) => {
    const job = jobOf(a.jobId);
    const photos = jobPhotos.filter((p) => p.agreementId === a.id);
    const before = photos.filter((p) => p.stage === 'before').length;
    const after = photos.filter((p) => p.stage === 'after').length;
    const dispute = disputes.find((d) => d.agreementId === a.id && d.status === 'open') ?? disputes.find((d) => d.agreementId === a.id);
    const myRating = employerRatings.find((r) => r.agreementId === a.id);
    const pays = payments.filter((p) => p.agreementId === a.id);
    const sentMaterials = pays.find((p) => p.kind === 'materials_payout');
    const paidOut = pays.filter((p) => p.kind === 'workmanship_payout').reduce((s, p) => s + p.amount, 0);
    return (
      <article key={a.id} className="space-y-4 rounded-sm border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-ink">{job?.title}</p>
            <p className="mt-0.5 text-sm text-ink-muted">{t('work.from', { employer: company(a.employerId) })}{a.startDate && <> · <CalendarIcon className="inline h-3.5 w-3.5" /> {t('work.start', { date: formatDate(a.startDate) })}</>}</p>
          </div>
          <AgreementPill status={a.status} />
        </div>
        <AgreementSteps a={a} />
        <MoneyBreakdown a={a} payments={pays} />
        {a.scope && <div><p className="text-xs font-semibold text-ink-muted">{t('work.scope')}</p><p className="mt-1 border-l-2 border-line pl-3 text-sm text-ink">{a.scope}</p></div>}
        <PhotoStrip photos={photos} />
        {dispute && <DisputeThread dispute={dispute} viewerId={me} nameOf={nameOf} onRespond={sp.respondDispute} />}

        {a.status === 'proposed' &&
        <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => {setReviewing(a);setAgree(false);setError(null);}} className={btnPrimary}>{t('work.reviewTerms')}</button>
            <button type="button" onClick={() => {setDeclining(a);setDeclineReason('');}} className={btnSecondary}>{t('work.decline')}</button>
          </div>
        }
        {a.status === 'accepted' && <p className="rounded-sm bg-warn-50 p-3 text-sm text-warn-700">{t('work.waitPay')}</p>}
        {a.status === 'in_progress' &&
        <div className="space-y-3">
            <p className="text-sm text-ink">{t('work.paid', { held: naira(a.workmanshipAmount) })} {sentMaterials && t('work.materialsSent', { amount: naira(sentMaterials.amount) })}</p>
            <p className="text-xs text-ink-muted">{t('work.needPhotos')} · {t('work.photos', { before, after })}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setCamera({ a, stage: 'before' })} className={btnSecondary}><CameraIcon className="h-4 w-4" /> {t('work.addBefore')}</button>
              <button type="button" onClick={() => setCamera({ a, stage: 'after' })} className={btnSecondary}><CameraIcon className="h-4 w-4" /> {t('work.addAfter')}</button>
              <button type="button" disabled={!before || !after} onClick={() => run(() => sp.submitJob(a.id))} className={btnPrimary}>{t('work.markDone')}</button>
            </div>
          </div>
        }
        {a.status === 'submitted' && <p className="rounded-sm bg-canvas p-3 text-sm text-ink">{t('work.submitted', { date: a.reviewDeadline ? formatDateTime(a.reviewDeadline) : '' })}</p>}
        {['in_progress', 'submitted'].includes(a.status) && <button type="button" onClick={() => setDisputing(a)} className={btnDanger}>{t('work.problem')}</button>}
        {a.status === 'completed' && <p className="text-sm text-ok-700">{t('work.completed', { amount: naira(a.workmanshipAmount) })}</p>}
        {a.status === 'resolved' && dispute?.artisanSharePct !== undefined && <p className="text-sm text-ink">{t('work.resolved', { pct: dispute.artisanSharePct, amount: naira(paidOut) })}</p>}
        {a.status === 'cancelled' && <p className="text-sm text-ink-muted">{t('work.cancelled', { reason: a.cancelReason ?? '' })}</p>}
        {['completed', 'resolved'].includes(a.status) && (myRating ?
        <div className="flex items-center gap-2 text-sm text-ink-muted">{t('work.rated', { stars: myRating.rating })} <StarRating value={myRating.rating} /></div> :
        <button type="button" onClick={() => setRating(a)} className={btnPrimary}><StarIcon className="h-4 w-4" /> {t('work.rateEmployer')}</button>)}
      </article>);

  };

  return (
    <>
      <PageHeader title={t('work.title')} subtitle={t('work.subtitle')} />
      {error && <p role="alert" className="mb-4 rounded-sm bg-bad-50 p-3.5 text-sm font-medium text-bad-700">{error}</p>}

      <div className="space-y-6">
        <Panel title={t('payout.title')}>
          {payoutAccount && !editingBank ?
          <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 font-mono text-sm text-ink"><LandmarkIcon className="h-4 w-4 text-brand-500" /> {t('payout.saved', { bank: payoutAccount.bankName, last4: payoutAccount.accountLast4, name: payoutAccount.accountName })}</p>
              <button type="button" onClick={() => setEditingBank(true)} className={btnSecondary}>{t('payout.change')}</button>
            </div> :

          <PayoutForm defaultName={user?.name ?? ''} onSaved={() => setEditingBank(false)} />
          }
        </Panel>

        {mine.length === 0 &&
        <div className="rounded-sm border border-dashed border-line bg-surface p-10 text-center">
            <p className="font-semibold text-ink">{t('work.none')}</p>
            <p className="mt-1 text-sm text-ink-muted">{t('work.noneBody')}</p>
          </div>
        }
        {offers.length > 0 && <section className="space-y-3"><h2 className="text-lg font-semibold text-ink">{t('work.offers')}</h2>{offers.map(card)}</section>}
        {active.length > 0 && <section className="space-y-3"><h2 className="text-lg font-semibold text-ink">{t('work.active')}</h2>{active.map(card)}</section>}
        {finished.length > 0 && <section className="space-y-3"><h2 className="text-lg font-semibold text-ink">{t('work.done')}</h2>{finished.map(card)}</section>}
      </div>

      <Modal open={!!reviewing} title={t('work.reviewTerms')} onClose={() => setReviewing(null)}>
        {reviewing &&
        <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">{jobOf(reviewing.jobId)?.title}</h2>
              <p className="mt-1 text-sm text-ink-muted">{t('work.from', { employer: company(reviewing.employerId) })}</p>
            </div>
            <div><p className="text-xs font-semibold text-ink-muted">{t('work.scope')}</p><p className="mt-1 border-l-2 border-line pl-3 text-sm text-ink">{reviewing.scope}</p></div>
            <JobTermsSummary materialsBy={reviewing.materialsBy} materialsAmount={reviewing.materialsAmount} workmanshipAmount={reviewing.workmanshipAmount} startDate={reviewing.startDate} reviewDays={reviewDays} />
            {!payoutAccount && <p className="rounded-sm bg-warn-50 p-3 text-sm text-warn-700">{t('payout.missing')}</p>}
            <label className="flex gap-3 text-sm"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" /><span className="text-ink">{t('work.agree')}</span></label>
            {error && <p role="alert" className="rounded-sm bg-bad-50 p-2.5 text-sm text-bad-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReviewing(null)} className={btnSecondary}>{t('common.cancel')}</button>
              <button type="button" disabled={!agree || !payoutAccount} onClick={async () => {if (!(await run(() => sp.acceptAgreement(reviewing.id)))) setReviewing(null);}} className={btnPrimary}>{t('work.accept')}</button>
            </div>
          </div>
        }
      </Modal>

      <Modal open={!!declining} title={t('work.decline')} onClose={() => setDeclining(null)}>
        <label htmlFor="decline-why" className="block text-sm font-semibold text-ink">{t('work.declineReason')}</label>
        <input id="decline-why" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} className={inputCls} />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setDeclining(null)} className={btnSecondary}>{t('common.cancel')}</button>
          <button type="button" disabled={declineReason.trim().length < 3} onClick={async () => {if (declining) await run(() => sp.cancelAgreement(declining.id, declineReason.trim()));setDeclining(null);}} className={btnDanger}>{t('work.declineSend')}</button>
        </div>
      </Modal>

      <CameraModal
        mode={camera ? 'photo' : null}
        code=""
        workshop={workshop}
        fallbackUrl={camera?.stage === 'after' ? '/32383737-c0e6-4fb2-b59c-44fc5566bffc.jpg' : '/fd213f5f-02ae-46fe-bd1c-7f74ab6a99f9.jpg'}
        upload={camera ? jobPhotoUploader(camera.a.id, camera.stage) : undefined}
        photoCaption={camera?.stage === 'after' ? 'Finished work' : 'Site before work'}
        onCapture={() => void sp.refresh()}
        onClose={() => setCamera(null)} />

      <DisputeModal open={!!disputing} reasons={['not_confirming', 'changed_scope', 'materials', 'other']} onClose={() => setDisputing(null)}
      onSubmit={(reason, details) => disputing ? sp.raiseDispute(disputing.id, reason, details) : Promise.resolve(null)} />

      <RatingModal open={!!rating} title={t('work.rateTitle', { employer: rating ? company(rating.employerId) : '' })} help={t('work.rateHelp')} onClose={() => setRating(null)}
      onSubmit={(stars, comment) => rating ? sp.rateEmployer(rating.id, stars, comment) : Promise.resolve(null)} />
    </>);

}

/** Save the bank account payouts go to. Only the last four digits are shown again. */
function PayoutForm({ defaultName, onSaved }: {defaultName: string;onSaved: () => void;}) {
  const sp = useSkillPass();
  const { t } = useT();
  const [banks, setBanks] = useState<{code: string;name: string;}[]>([]);
  const [bankCode, setBankCode] = useState('');
  const [number, setNumber] = useState('');
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadBanks().then(setBanks).catch(() => setBanks([]));
  }, []);
  const save = async () => {
    const bank = banks.find((b) => b.code === bankCode);
    const err = await sp.savePayoutAccount({ bankCode, bankName: bank?.name ?? bankCode, accountNumber: number, accountName: name.trim() });
    if (err) return setError(err);
    onSaved();
  };
  return (
    <div className="space-y-3">
      {!sp.payoutAccount && <p className="text-sm text-warn-700">{t('payout.missing')}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="po-bank" className="block text-sm font-semibold text-ink">{t('payout.bank')}</label>
          <select id="po-bank" value={bankCode} onChange={(e) => setBankCode(e.target.value)} className={inputCls}>
            <option value="">{t('payout.chooseBank')}</option>
            {banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="po-number" className="block text-sm font-semibold text-ink">{t('payout.number')}</label>
          <input id="po-number" inputMode="numeric" maxLength={10} value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))} className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label htmlFor="po-name" className="block text-sm font-semibold text-ink">{t('payout.name')}</label>
          <input id="po-name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-bad-700">{error}</p>}
      <button type="button" disabled={!bankCode || number.length !== 10 || name.trim().length < 2} onClick={save} className={btnPrimary}>{t('payout.save')}</button>
    </div>);

}
