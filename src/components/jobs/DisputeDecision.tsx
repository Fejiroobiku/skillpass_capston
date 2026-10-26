import { useState } from 'react';
import type { JobDispute } from '../../types/skillpass';
import { useSkillPass } from '../../contexts/SkillPassContext';
import { naira } from '../../api/jobs';
import { formatDate, formatDateTime } from '../../utils/credentials';
import { DisputeThread, MoneyBreakdown, PhotoStrip, btnPrimary, inputCls } from './JobParts';

/** One open job dispute in the administrator's review queue, with the decision controls. */
export function DisputeDecision({ dispute }: {dispute: JobDispute;}) {
  const sp = useSkillPass();
  const a = sp.agreements.find((x) => x.id === dispute.agreementId);
  const [pct, setPct] = useState(50);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!a) return null;
  const job = sp.jobs.find((j) => j.id === a.jobId);
  const employer = sp.employers.find((e) => e.id === a.employerId);
  const toArtisan = Math.round((a.workmanshipAmount * pct) / 100);
  const decide = async () => {
    setBusy(true);
    const err = await sp.resolveDispute(dispute.id, pct, note.trim());
    setBusy(false);
    if (err) setError(err);
  };
  return (
    <article className="space-y-4 rounded-sm border border-line bg-surface p-5">
      <div>
        <p className="font-semibold text-ink">{job?.title}</p>
        <p className="mt-0.5 text-sm text-ink-muted">
          {employer?.company ?? sp.nameOf(a.employerId)} (employer) · {sp.nameOf(a.artisanId)} (artisan) · raised {formatDateTime(dispute.raisedAt)}
          {a.startDate && <> · started {formatDate(a.startDate)}</>}
        </p>
      </div>
      <MoneyBreakdown a={a} payments={sp.payments.filter((p) => p.agreementId === a.id)} />
      <div>
        <p className="text-xs font-semibold text-ink-muted">Agreed scope (terms {a.termsVersion})</p>
        <p className="mt-1 border-l-2 border-line pl-3 text-sm text-ink">{a.scope}</p>
      </div>
      <PhotoStrip photos={sp.jobPhotos.filter((p) => p.agreementId === a.id)} />
      <DisputeThread dispute={dispute} viewerId="" nameOf={sp.nameOf} />
      <div className="grid gap-3 rounded-sm border border-line bg-canvas p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-end">
        <div>
          <label htmlFor={`pct-${dispute.id}`} className="block text-sm font-semibold text-ink">Share to the artisan: {pct}%</label>
          <input id={`pct-${dispute.id}`} type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="mt-2 w-full accent-brand-600" />
          <p className="mt-1 font-mono text-xs text-ink-muted">{naira(toArtisan)} to artisan · {naira(a.workmanshipAmount - toArtisan)} refunded</p>
        </div>
        <div>
          <label htmlFor={`note-${dispute.id}`} className="block text-sm font-semibold text-ink">Reason for the decision (both sides see this)</label>
          <textarea id={`note-${dispute.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} resize-none`} />
        </div>
        <button type="button" disabled={busy || note.trim().length < 10} onClick={decide} className={btnPrimary}>Decide</button>
      </div>
      {error && <p role="alert" className="text-sm text-bad-700">{error}</p>}
    </article>);

}
