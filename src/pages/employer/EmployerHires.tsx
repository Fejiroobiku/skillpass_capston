import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarIcon, LockIcon, StarIcon } from 'lucide-react';
import type { Agreement, Referral } from '../../types/skillpass';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { Modal } from '../../components/Modal';
import { TrustBadge } from '../../components/TrustBadge';
import { StarRating } from '../../components/StarRating';
import { AgreementPill, AgreementSteps, DisputeModal, DisputeThread, JobTermsSummary, MoneyBreakdown, PhotoStrip, RatingModal, btnDanger, btnPrimary, btnSecondary, inputCls } from '../../components/jobs/JobParts';
import { useSkillPass } from '../../contexts/SkillPassContext';
import { useAuth } from '../../contexts/AuthContext';
import { naira } from '../../api/jobs';
import { formatDate, formatDateTime } from '../../utils/credentials';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Hiring through SkillPass: compare quotes, offer a job with clear terms, pay into escrow, then confirm the work
 * (which releases payment) or raise a dispute.
 */
export function EmployerHires() {
  const { user } = useAuth();
  const sp = useSkillPass();
  const { jobs, referrals, agreements, payments, jobPhotos, disputes, feedback, employerRatings, apprentices, credentials, employers, settings, nameOf } = sp;
  const navigate = useNavigate();
  const me = user?.id ?? '';
  const verified = !!employers.find((e) => e.id === me)?.approved;
  const myJobs = jobs.filter((j) => j.employerId === me);
  const jobOf = (id: string) => jobs.find((j) => j.id === id);
  const live = (a: Agreement) => a.status !== 'cancelled';
  const agreementFor = (referralId: string) => agreements.find((a) => a.referralId === referralId && live(a));
  const quotes = referrals.filter((r) => myJobs.some((j) => j.id === r.jobId) && ['accepted', 'contacted'].includes(r.status) && !agreementFor(r.id));
  const mine = agreements.filter((a) => a.employerId === me);
  const active = mine.filter((a) => !['completed', 'resolved', 'cancelled'].includes(a.status));
  const finished = mine.filter((a) => ['completed', 'resolved', 'cancelled'].includes(a.status));
  const reviewDays = settings.reviewDays ?? 3;

  const [error, setError] = useState<string | null>(null);
  const [offerFor, setOfferFor] = useState<Referral | null>(null);
  const [form, setForm] = useState({ materials: '', workmanship: '', startDate: '', scope: '' });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Agreement | null>(null);
  const [disputing, setDisputing] = useState<Agreement | null>(null);
  const [rating, setRating] = useState<Agreement | null>(null);
  const [cancelling, setCancelling] = useState<Agreement | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const openOffer = (r: Referral) => {
    const job = jobOf(r.jobId);
    setOfferFor(r);
    setAgree(false);
    setError(null);
    setForm({
      materials: job?.materialsBy === 'artisan' ? String(r.quote?.materials ?? job?.materialsBudget ?? '') : '0',
      workmanship: String(r.quote?.workmanship ?? job?.workmanshipBudget ?? ''),
      startDate: r.quote?.availableFrom && r.quote.availableFrom >= today() ? r.quote.availableFrom : today(),
      scope: ''
    });
  };
  const offerJob = offerFor ? jobOf(offerFor.jobId) : undefined;
  const materialsBy = offerJob?.materialsBy ?? 'employer';
  const amounts = { materials: materialsBy === 'artisan' ? Number(form.materials) || 0 : 0, workmanship: Number(form.workmanship) || 0 };

  const sendOffer = async () => {
    if (!offerFor) return;
    setBusy(true);
    const err = await sp.offerAgreement({ referralId: offerFor.id, materialsAmount: amounts.materials, workmanshipAmount: amounts.workmanship, startDate: form.startDate, scope: form.scope.trim() });
    setBusy(false);
    if (err) return setError(err);
    setOfferFor(null);
  };

  const pay = async (a: Agreement) => {
    setError(null);
    const r = await sp.startCheckout(a.id);
    if (r.error || !r.checkoutUrl) return setError(r.error ?? 'Could not start the payment.');
    const url = new URL(r.checkoutUrl, window.location.origin);
    if (url.origin === window.location.origin) navigate(url.pathname);else
    window.location.assign(r.checkoutUrl);
  };

  const run = async (fn: () => Promise<string | null>) => {
    setError(null);
    const err = await fn();
    if (err) setError(err);
    return err;
  };

  const card = (a: Agreement) => {
    const job = jobOf(a.jobId);
    const dispute = disputes.find((d) => d.agreementId === a.id && d.status === 'open') ?? disputes.find((d) => d.agreementId === a.id);
    const photos = jobPhotos.filter((p) => p.agreementId === a.id);
    const rated = feedback.some((f) => f.referralId === a.referralId);
    const theirRating = employerRatings.find((r) => r.agreementId === a.id);
    return (
      <article key={a.id} className="space-y-4 rounded-sm border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-ink">{job?.title}</p>
            <p className="mt-0.5 text-sm text-ink-muted">
              <Link to={`/people/${a.artisanId}/passport`} className="text-brand-700 hover:underline">{nameOf(a.artisanId)}</Link>
              {a.startDate && <> · <CalendarIcon className="inline h-3.5 w-3.5" /> starts {formatDate(a.startDate)}</>}
            </p>
          </div>
          <AgreementPill status={a.status} />
        </div>
        <AgreementSteps a={a} />
        <MoneyBreakdown a={a} payments={payments.filter((p) => p.agreementId === a.id)} />
        {a.scope && <p className="border-l-2 border-line pl-3 text-sm text-ink-muted">{a.scope}</p>}
        <PhotoStrip photos={photos} />
        {dispute && <DisputeThread dispute={dispute} viewerId={me} nameOf={nameOf} onRespond={sp.respondDispute} />}
        {a.status === 'cancelled' && <p className="text-sm text-ink-muted">Called off by {nameOf(a.cancelledBy)}: {a.cancelReason}</p>}
        {theirRating && <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">{nameOf(a.artisanId)} rated you <StarRating value={theirRating.rating} />{theirRating.comment && `“${theirRating.comment}”`}</div>}

        <div className="flex flex-wrap items-center gap-2">
          {a.status === 'proposed' && <p className="mr-auto text-sm text-ink-muted">Waiting for {nameOf(a.artisanId)} to read and accept the terms.</p>}
          {a.status === 'accepted' &&
          <>
              <p className="mr-auto text-sm text-ink">Accepted. Pay into escrow so the artisan can start.</p>
              <button type="button" onClick={() => pay(a)} className={btnPrimary}><LockIcon className="h-4 w-4" /> Pay {naira((a.materialsBy === 'artisan' ? a.materialsAmount : 0) + a.workmanshipAmount)} into escrow</button>
            </>
          }
          {['proposed', 'accepted'].includes(a.status) && <button type="button" onClick={() => {setCancelling(a);setCancelReason('');}} className={btnSecondary}>Call off</button>}
          {a.status === 'in_progress' && <p className="mr-auto text-sm text-ink-muted">Paid. {naira(a.workmanshipAmount)} is held until you confirm the work.</p>}
          {a.status === 'submitted' &&
          <>
              <p className="mr-auto text-sm text-ink">Marked done {a.submittedAt && formatDateTime(a.submittedAt)}. Check the work by <strong>{a.reviewDeadline && formatDateTime(a.reviewDeadline)}</strong>, or the money is released automatically.</p>
              <button type="button" onClick={() => setConfirming(a)} className={btnPrimary}>Confirm & release {naira(a.workmanshipAmount)}</button>
            </>
          }
          {['in_progress', 'submitted'].includes(a.status) && <button type="button" onClick={() => setDisputing(a)} className={btnDanger}>Raise a dispute</button>}
          {['completed', 'resolved'].includes(a.status) && (rated ?
          <span className="text-sm text-ink-muted">You rated this work.</span> :
          <button type="button" disabled={!verified} onClick={() => setRating(a)} className={btnPrimary}><StarIcon className="h-4 w-4" /> Rate the work</button>)}
        </div>
      </article>);

  };

  return (
    <>
      <PageHeader title="Hires & Payments" subtitle="Compare quotes, agree clear terms, and pay safely: workmanship money is held until you confirm the job is done." />
      {error && <p role="alert" className="mb-4 rounded-sm bg-bad-50 p-3.5 text-sm font-medium text-bad-700">{error}</p>}
      {!verified && <p role="status" className="mb-4 rounded-sm bg-warn-50 p-3.5 text-sm text-warn-700">An administrator must verify your employer account before you can hire through SkillPass.</p>}

      <div className="space-y-6">
        <Panel title="Quotes" description="Artisans who said they are interested, with their price. Compare more than price: verified skills and the assessor's trust matter too.">
          {quotes.length === 0 ?
          <p className="text-sm text-ink-muted">No quotes waiting. Send referrals from <Link to="/employer/jobs" className="text-brand-700 hover:underline">Jobs & Matches</Link>.</p> :

          <ul className="divide-y divide-line">
              {quotes.map((r) => {
              const job = jobOf(r.jobId);
              const artisan = apprentices.find((x) => x.id === r.apprenticeId);
              const verifiedSkills = credentials.filter((c) => c.apprenticeId === r.apprenticeId && c.status === 'valid' && job?.skillIds.includes(c.skillId));
              const total = (r.quote?.workmanship ?? 0) + (r.quote?.materials ?? 0);
              return (
                <li key={r.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink"><Link to={`/people/${r.apprenticeId}/passport`} className="hover:underline">{nameOf(r.apprenticeId)}</Link> <span className="font-normal text-ink-muted">for {job?.title}</span></p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {verifiedSkills.length}/{job?.skillIds.length ?? 0} required skills verified
                        {artisan?.trainerId && <> · assessed by <TrustBadge trainerId={artisan.trainerId} /></>}
                      </p>
                      {r.quote ?
                    <p className="mt-1 text-sm text-ink">
                          Quote <span className="font-mono font-semibold">{naira(r.quote.workmanship)}</span> workmanship
                          {r.quote.materials ? <> + <span className="font-mono font-semibold">{naira(r.quote.materials)}</span> materials</> : null}
                          {' '}= <span className="font-mono font-semibold text-brand-500">{naira(total)}</span> · can start {formatDate(r.quote.availableFrom)}
                        </p> :

                    <p className="mt-1 text-sm text-ink-muted">Interested, no quote sent. Your budget: {job?.pay}</p>
                    }
                      {r.quote?.note && <p className="mt-1 text-xs text-ink-muted">“{r.quote.note}”</p>}
                    </div>
                    <button type="button" disabled={!verified} onClick={() => openOffer(r)} className={btnPrimary}>Offer job</button>
                  </li>);

            })}
            </ul>
          }
        </Panel>

        <section aria-labelledby="active-h" className="space-y-3">
          <h2 id="active-h" className="text-lg font-semibold text-ink">Active jobs</h2>
          {active.length === 0 ? <p className="rounded-sm border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-muted">No active jobs.</p> : active.map(card)}
        </section>

        {finished.length > 0 &&
        <section aria-labelledby="done-h" className="space-y-3">
            <h2 id="done-h" className="text-lg font-semibold text-ink">Finished</h2>
            {finished.map(card)}
          </section>
        }
      </div>

      <Modal open={!!offerFor} title="Offer this job" onClose={() => setOfferFor(null)}>
        {offerFor && offerJob &&
        <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">Offer “{offerJob.title}”</h2>
              <p className="mt-1 text-sm text-ink-muted">to {nameOf(offerFor.apprenticeId)}. Amounts start from their quote; change them if you agreed something different.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="of-work" className="block text-sm font-semibold text-ink">Workmanship (₦)</label>
                <input id="of-work" inputMode="numeric" value={form.workmanship} onChange={(e) => setForm({ ...form, workmanship: e.target.value.replace(/\D/g, '') })} className={inputCls} />
              </div>
              <div>
                <label htmlFor="of-mat" className="block text-sm font-semibold text-ink">Materials (₦)</label>
                {materialsBy === 'artisan' ?
              <input id="of-mat" inputMode="numeric" value={form.materials} onChange={(e) => setForm({ ...form, materials: e.target.value.replace(/\D/g, '') })} className={inputCls} /> :
              <p id="of-mat" className="mt-1.5 rounded-sm border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink-muted">You buy them</p>}
              </div>
            </div>
            <div>
              <label htmlFor="of-start" className="block text-sm font-semibold text-ink">Start date</label>
              <input id="of-start" type="date" min={today()} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label htmlFor="of-scope" className="block text-sm font-semibold text-ink">What the job includes</label>
              <textarea id="of-scope" rows={3} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} placeholder="e.g. Rewire both flats: new final circuits, sockets and switches. I supply cables and fittings." className={`${inputCls} resize-none`} />
              <p className="mt-1 text-xs text-ink-subtle">Be specific. In a dispute, the administrator checks the work against this.</p>
            </div>
            <JobTermsSummary materialsBy={materialsBy} materialsAmount={amounts.materials} workmanshipAmount={amounts.workmanship} startDate={form.startDate} reviewDays={reviewDays} />
            <label className="flex gap-3 text-sm"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" /><span className="text-ink">I have read these job terms and the <Link to="/terms" target="_blank" className="text-brand-700 underline">Terms of Service</Link>, and I agree to them.</span></label>
            {error && <p role="alert" className="rounded-sm bg-bad-50 p-2.5 text-sm text-bad-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOfferFor(null)} className={btnSecondary}>Cancel</button>
              <button type="button" disabled={busy || !agree || amounts.workmanship <= 0 || (materialsBy === 'artisan' && amounts.materials <= 0) || !form.startDate || form.scope.trim().length < 10} onClick={sendOffer} className={btnPrimary}>Send offer</button>
            </div>
          </div>
        }
      </Modal>

      <Modal open={!!confirming} title="Confirm the job is done" onClose={() => setConfirming(null)}>
        {confirming &&
        <>
            <h2 className="text-lg font-semibold text-ink">Confirm the job is done?</h2>
            <p className="mt-2 text-sm text-ink-muted">{naira(confirming.workmanshipAmount)} will be released to {nameOf(confirming.artisanId)}. This cannot be undone. If something is wrong, raise a dispute instead.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(null)} className={btnSecondary}>Not yet</button>
              <button type="button" onClick={async () => {await run(() => sp.completeJob(confirming.id));setConfirming(null);}} className={btnPrimary}>Yes, release payment</button>
            </div>
          </>
        }
      </Modal>

      <Modal open={!!cancelling} title="Call off this job" onClose={() => setCancelling(null)}>
        <h2 className="text-lg font-semibold text-ink">Call off this job?</h2>
        <p className="mt-1 text-sm text-ink-muted">No money has been paid, so this is free. The artisan will see your reason.</p>
        <label htmlFor="cancel-why" className="mt-4 block text-sm font-semibold text-ink">Reason</label>
        <input id="cancel-why" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className={inputCls} />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setCancelling(null)} className={btnSecondary}>Keep it</button>
          <button type="button" disabled={cancelReason.trim().length < 3} onClick={async () => {if (cancelling) await run(() => sp.cancelAgreement(cancelling.id, cancelReason.trim()));setCancelling(null);}} className={btnDanger}>Call off</button>
        </div>
      </Modal>

      <DisputeModal open={!!disputing} reasons={['poor_work', 'not_finished', 'no_show', 'materials', 'changed_scope', 'other']} onClose={() => setDisputing(null)}
      onSubmit={(reason, details) => disputing ? sp.raiseDispute(disputing.id, reason, details) : Promise.resolve(null)} />

      <RatingModal open={!!rating} title={`Rate ${rating ? nameOf(rating.artisanId) : ''}`} help="How well did they do the work you hired them for? This also counts towards the trust score of the assessors who verified their skills." onClose={() => setRating(null)}
      onSubmit={async (stars, comment) => {
        if (!rating || !user) return null;
        const job = jobOf(rating.jobId);
        const linked = credentials.filter((c) => c.apprenticeId === rating.artisanId && c.status === 'valid' && job?.skillIds.includes(c.skillId)).map((c) => c.id);
        return sp.addFeedback({ apprenticeId: rating.artisanId, employerId: user.id, credentialIds: linked, rating: stars, comment, referralId: rating.referralId });
      }} />
    </>);

}
