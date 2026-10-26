import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CameraIcon, CheckIcon, ClockIcon, MapPinIcon } from 'lucide-react';
import type { Agreement, AgreementStatus, DisputeReason, JobPhoto, MaterialsBy, Payment } from '../../types/skillpass';
import { Pill } from '../StatusBadge';
import { Modal } from '../Modal';
import { StarRating } from '../StarRating';
import { naira } from '../../api/jobs';
import { formatDate, formatDateTime } from '../../utils/credentials';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n/en';

export const inputCls = 'mt-1.5 w-full rounded-sm border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';
export const btnPrimary = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm bg-brand-600 px-4 py-2.5 text-sm font-semibold text-night transition-colors duration-150 hover:bg-brand-700 disabled:opacity-40';
export const btnSecondary = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors duration-150 hover:bg-canvas disabled:opacity-40';
export const btnDanger = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-bad-200 px-4 py-2.5 text-sm font-medium text-bad-700 transition-colors duration-150 hover:bg-bad-50 disabled:opacity-40';

const statusTone: Record<AgreementStatus, 'ok' | 'warn' | 'bad' | 'neutral'> = {
  proposed: 'neutral', accepted: 'warn', in_progress: 'ok', submitted: 'warn', completed: 'ok', disputed: 'bad', resolved: 'neutral', cancelled: 'neutral'
};

export function AgreementPill({ status }: {status: AgreementStatus;}) {
  const { t } = useT();
  return <Pill tone={statusTone[status]}>{t(`ag.${status}` as MessageKey)}</Pill>;
}

/** Offer → Accepted → Paid into escrow → Work done → Money released. */
export function AgreementSteps({ a }: {a: Agreement;}) {
  const { t } = useT();
  if (a.status === 'cancelled') return null;
  const reached = [true, !!a.artisanAcceptedAt, !!a.fundedAt, !!a.submittedAt, a.status === 'completed' || a.status === 'resolved'];
  const labels: MessageKey[] = ['ag.step.offer', 'ag.step.accepted', 'ag.step.paid', 'ag.step.done', 'ag.step.released'];
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Progress">
      {labels.map((l, i) =>
      <li key={l} className="min-w-0">
          <span className={`block h-1 rounded-sm ${reached[i] ? 'bg-brand-500' : 'bg-line'}`} aria-hidden="true" />
          <span className={`mt-1.5 flex items-start gap-1 text-[10px] leading-tight sm:text-[11px] ${reached[i] ? 'text-ink' : 'text-ink-subtle'}`}>
            {reached[i] && <CheckIcon className="hidden h-3 w-3 shrink-0 text-brand-500 sm:block" aria-hidden="true" />}{t(l)}
          </span>
        </li>
      )}
    </ol>);

}

/** What the employer pays, what goes to the artisan now, and what is held. */
export function MoneyBreakdown({ a, payments }: {a: Pick<Agreement, 'materialsBy' | 'materialsAmount' | 'workmanshipAmount'>;payments?: Payment[];}) {
  const total = (a.materialsBy === 'artisan' ? a.materialsAmount : 0) + a.workmanshipAmount;
  const paidOut = (kind: Payment['kind']) => (payments ?? []).filter((p) => p.kind === kind && p.status !== 'failed').reduce((s, p) => s + p.amount, 0);
  const failed = (payments ?? []).filter((p) => p.status === 'failed');
  return (
    <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-line bg-line text-sm">
      <div className="bg-canvas p-3">
        <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Materials</dt>
        <dd className="mt-0.5 font-mono font-semibold text-ink">{a.materialsBy === 'artisan' ? naira(a.materialsAmount) : '—'}</dd>
        <dd className="text-[11px] text-ink-subtle">{a.materialsBy === 'artisan' ? 'artisan buys' : 'employer buys'}</dd>
      </div>
      <div className="bg-canvas p-3">
        <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Workmanship</dt>
        <dd className="mt-0.5 font-mono font-semibold text-ink">{naira(a.workmanshipAmount)}</dd>
        <dd className="text-[11px] text-ink-subtle">held until confirmed</dd>
      </div>
      <div className="bg-canvas p-3">
        <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Into escrow</dt>
        <dd className="mt-0.5 font-mono font-semibold text-brand-500">{naira(total)}</dd>
        {payments && <dd className="text-[11px] text-ink-subtle">paid out {naira(paidOut('materials_payout') + paidOut('workmanship_payout'))}{paidOut('refund') ? ` · refunded ${naira(paidOut('refund'))}` : ''}</dd>}
      </div>
      {failed.length > 0 && <div className="col-span-3 bg-bad-50 p-2 text-xs text-bad-700">{failed.length} payment(s) failed. The administrator has been told.</div>}
    </dl>);

}

/** The specific terms of one job, in plain words, shown before either side accepts. */
export function JobTermsSummary({ materialsBy, materialsAmount, workmanshipAmount, startDate, reviewDays = 3 }:
{materialsBy: MaterialsBy;materialsAmount: number;workmanshipAmount: number;startDate?: string;reviewDays?: number;}) {
  const { t } = useT();
  const total = (materialsBy === 'artisan' ? materialsAmount : 0) + workmanshipAmount;
  const lines = [
  t('jt.total', { amount: naira(total) }),
  materialsBy === 'artisan' ? t('jt.materialsArtisan', { amount: naira(materialsAmount) }) : t('jt.materialsEmployer'),
  t('jt.workmanship', { amount: naira(workmanshipAmount) }),
  ...(startDate ? [t('jt.start', { date: formatDate(startDate) })] : []),
  t('jt.photos'),
  t('jt.review', { days: reviewDays }),
  t('jt.cancel'),
  t('jt.dispute'),
  t('jt.changes')];

  return (
    <section aria-label={t('jt.title')} className="rounded-sm border border-brand-500/50 bg-canvas p-4">
      <h3 className="text-sm font-semibold text-ink">{t('jt.title')}</h3>
      <ol className="mt-2 space-y-1.5">
        {lines.map((l, i) =>
        <li key={i} className="flex gap-2 text-xs leading-relaxed text-ink-muted">
            <span className="font-mono text-brand-500">{i + 1}.</span><span>{l}</span>
          </li>
        )}
      </ol>
      <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <Link to="/terms" target="_blank" className="font-medium text-brand-700 underline-offset-2 hover:underline">{t('jt.readAll')}</Link>
        <span className="text-ink-subtle">{t('jt.testMode')}</span>
      </p>
    </section>);

}

export function PhotoStrip({ photos }: {photos: JobPhoto[];}) {
  if (!photos.length) return null;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {photos.map((p) =>
      <li key={p.id} className="overflow-hidden rounded-sm border border-line bg-canvas">
          <div className="relative">
            {p.url ? <img src={p.url} alt={`${p.stage} photo`} className="aspect-[4/3] w-full object-cover" loading="lazy" /> :
          <div className="flex aspect-[4/3] items-center justify-center text-ink-subtle"><CameraIcon className="h-5 w-5" /></div>}
            <span className="absolute left-1.5 top-1.5 rounded-sm bg-night/80 px-1.5 py-0.5 font-mono text-[10px] uppercase text-white">{p.stage}</span>
          </div>
          <div className="space-y-0.5 p-2 text-[11px] text-ink-muted">
            <p className="flex items-center gap-1"><ClockIcon className="h-3 w-3" />{formatDateTime(p.capturedAt)}</p>
            <p className="flex items-center gap-1 truncate"><MapPinIcon className="h-3 w-3 shrink-0" />{p.locationLabel}{p.locationSource === 'gps' ? ' · GPS' : ''}</p>
          </div>
        </li>
      )}
    </ul>);

}

export const DISPUTE_REASONS: DisputeReason[] = ['poor_work', 'not_finished', 'no_show', 'materials', 'changed_scope', 'not_confirming', 'other'];

/** Raise a dispute. Each side sees the reasons that make sense for them. */
export function DisputeModal({ open, reasons, onClose, onSubmit }:
{open: boolean;reasons: DisputeReason[];onClose: () => void;onSubmit: (reason: DisputeReason, details: string) => Promise<string | null>;}) {
  const { t } = useT();
  const [reason, setReason] = useState<DisputeReason>(reasons[0]);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    const err = await onSubmit(reason, details.trim());
    setBusy(false);
    if (err) return setError(err);
    setDetails('');
    onClose();
  };
  return (
    <Modal open={open} title={t('dispute.title')} onClose={onClose}>
      <h2 className="text-lg font-semibold text-ink">{t('dispute.title')}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t('dispute.intro')}</p>
      <label htmlFor="dispute-reason" className="mt-4 block text-sm font-semibold text-ink">{t('dispute.reason')}</label>
      <select id="dispute-reason" value={reason} onChange={(e) => setReason(e.target.value as DisputeReason)} className={inputCls}>
        {reasons.map((r) => <option key={r} value={r}>{t(`dispute.reason.${r}` as MessageKey)}</option>)}
      </select>
      <label htmlFor="dispute-details" className="mt-4 block text-sm font-semibold text-ink">{t('dispute.details')}</label>
      <textarea id="dispute-details" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t('dispute.detailsPlaceholder')} className={`${inputCls} resize-none`} />
      {error && <p role="alert" className="mt-3 rounded-sm bg-bad-50 p-2.5 text-sm text-bad-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={btnSecondary}>{t('common.cancel')}</button>
        <button type="button" disabled={busy || details.trim().length < 20} onClick={send} className={btnPrimary}>{t('dispute.send')}</button>
      </div>
    </Modal>);

}

/** A dispute's story so far, with a box for the other side to answer once. */
export function DisputeThread({ dispute, viewerId, nameOf, onRespond }:
{dispute: {id: string;raisedBy: string;reason: DisputeReason;details: string;response?: string;status: string;artisanSharePct?: number;decisionNote?: string;};
  viewerId: string;nameOf: (id?: string) => string;onRespond?: (id: string, text: string) => Promise<string | null>;}) {
  const { t } = useT();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canRespond = onRespond && dispute.status === 'open' && dispute.raisedBy !== viewerId && !dispute.response;
  return (
    <div className={`rounded-sm border p-3 text-sm ${dispute.status === 'open' ? 'border-bad-200 bg-bad-50/40' : 'border-line bg-canvas'}`}>
      <p className={`font-semibold ${dispute.status === 'open' ? 'text-bad-700' : 'text-ink'}`}>{t(dispute.status === 'open' ? 'dispute.open' : 'dispute.decided', { reason: t(`dispute.reason.${dispute.reason}` as MessageKey) })}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{dispute.raisedBy === viewerId ? t('dispute.byYou') : t('dispute.byOther', { name: nameOf(dispute.raisedBy) })}</p>
      <p className="mt-2 border-l-2 border-bad-600 pl-2.5 text-ink">“{dispute.details}”</p>
      {dispute.response && <p className="mt-2 border-l-2 border-line pl-2.5 text-ink-muted">{t('dispute.response', { text: dispute.response })}</p>}
      {dispute.status === 'open' && !canRespond && <p className="mt-2 text-xs text-ink-muted">{t('dispute.waiting')}</p>}
      {dispute.status === 'resolved' && dispute.decisionNote && <p className="mt-2 text-xs text-ink">{t('dispute.decision', { pct: dispute.artisanSharePct ?? 0, note: dispute.decisionNote })}</p>}
      {canRespond &&
      <div className="mt-3">
          <label htmlFor={`resp-${dispute.id}`} className="text-xs font-semibold text-ink">{t('dispute.yourSide')}</label>
          <textarea id={`resp-${dispute.id}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('dispute.yourSidePlaceholder')} className={`${inputCls} resize-none`} />
          {error && <p role="alert" className="mt-2 text-xs text-bad-700">{error}</p>}
          <button type="button" disabled={text.trim().length < 20} onClick={async () => setError(await onRespond(dispute.id, text.trim()))} className={`${btnPrimary} mt-2`}>{t('dispute.sendSide')}</button>
        </div>
      }
    </div>);

}

export function RatingModal({ open, title, help, onClose, onSubmit }:
{open: boolean;title: string;help: string;onClose: () => void;onSubmit: (stars: number, comment: string) => Promise<string | null>;}) {
  const { t } = useT();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mb-3 mt-1 text-sm text-ink-muted">{help}</p>
      <StarRating value={stars} onChange={setStars} size="lg" />
      <label htmlFor="rating-comment" className="mt-4 block text-sm font-semibold text-ink">Comment</label>
      <textarea id="rating-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} className={`${inputCls} resize-none`} />
      {error && <p role="alert" className="mt-3 rounded-sm bg-bad-50 p-2.5 text-sm text-bad-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={btnSecondary}>{t('common.cancel')}</button>
        <button type="button" disabled={stars === 0} onClick={async () => {const e = await onSubmit(stars, comment.trim());if (e) setError(e);else {setStars(0);setComment('');onClose();}}} className={btnPrimary}>{t('work.sendRating')}</button>
      </div>
    </Modal>);

}
