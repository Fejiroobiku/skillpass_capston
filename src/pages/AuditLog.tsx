import { useCallback, useEffect, useState } from 'react';
import { LinkIcon, RefreshCwIcon, ShieldAlertIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { useSkillPass } from '../contexts/SkillPassContext';
import { formatDateTime } from '../utils/credentials';
import { api, messageOf } from '../api/client';

interface ChainReport {
  ok: boolean;
  checked: number;
  total: number;
  head?: string | null;
  problem?: {id: string;position: number;at: string;action: string;reason: string;};
}

/** Recomputes the log's hash chain on the server and shows whether history is intact. */
function ChainCheck() {
  const [report, setReport] = useState<ChainReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setReport(await api.get<ChainReport>('/api/admin/audit-log/verify'));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {void run();}, [run]);

  const broken = report && !report.ok;
  return (
    <section aria-live="polite" className={`flex flex-wrap items-start gap-4 rounded-2xl border p-4 ${broken ? 'border-bad-200 bg-bad-50' : 'border-line bg-surface'}`}>
      {broken ? <ShieldAlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-bad-700" aria-hidden="true" /> : <LinkIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden="true" />}
      <div className="min-w-0 flex-1 text-sm">
        {error ? <p className="font-semibold text-bad-700">Couldn't check the chain: {error}</p> :
        !report ? <p className="text-ink-muted">Checking the hash chain…</p> :
        report.ok ?
        <>
            <p className="font-semibold text-ink">Hash chain intact · {report.checked} entries checked</p>
            <p className="mt-0.5 text-ink-muted">Every entry is sealed with the one before it, so any change, deletion or reordering would show here.</p>
            {report.head && <p className="mt-1 break-all font-mono text-xs text-ink-subtle">Latest seal: {report.head}</p>}
            <p className="mt-1 text-xs text-ink-subtle">Note this seal and the count somewhere outside SkillPass (for example in your project report); a later check that shows fewer entries means the newest ones were removed.</p>
          </> :

        <>
            <p className="font-semibold text-bad-700">History has been tampered with at entry {report.problem?.position} of {report.total}</p>
            <p className="mt-0.5 text-bad-700">{report.problem?.reason} ({report.problem?.action}, {report.problem ? formatDateTime(report.problem.at) : ''})</p>
            <p className="mt-1 text-xs text-bad-700">Entries before this one are verified. Treat everything from here on as untrusted and investigate database access.</p>
          </>
        }
      </div>
      <button type="button" onClick={() => void run()} disabled={busy} className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-ink ring-1 ring-inset ring-line transition-colors duration-150 hover:bg-canvas disabled:opacity-50">
        <RefreshCwIcon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" /> Check again
      </button>
    </section>);

}

const filters = [
{ id: 'all', label: 'All' },
{ id: 'credential.issued', label: 'Issued' },
{ id: 'credential.flagged', label: 'Flagged' },
{ id: 'credential.revoked', label: 'Revoked' },
{ id: 'audit', label: 'Audits' },
{ id: 'account', label: 'Accounts' }] as
const;

export function AuditLog() {
  const { auditLog } = useSkillPass();
  const [filter, setFilter] = useState<(typeof filters)[number]['id']>('all');
  const rows = auditLog.filter((e) => filter === 'all' || (filter === 'audit' || filter === 'account' ? e.action.startsWith(filter) : e.action === filter));

  return (
    <div className="space-y-4">
      <PageHeader title="Audit Log" subtitle={`Append-only and hash-chained · ${auditLog.length} entries. Entries can be added but never edited or deleted.`} />
      <ChainCheck />

      <div role="tablist" aria-label="Filter" className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1.5">
        {filters.map((f) =>
        <button key={f.id} role="tab" aria-selected={filter === f.id} type="button" onClick={() => setFilter(f.id)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-colors duration-150 ${filter === f.id ? 'bg-brand-600 text-night' : 'text-ink hover:bg-canvas'}`}>
            {f.label}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line bg-canvas text-xs text-ink-muted">
            <tr>
              <th scope="col" className="px-5 py-3 font-medium">When</th>
              <th scope="col" className="px-3 py-3 font-medium">Actor</th>
              <th scope="col" className="px-3 py-3 font-medium">Action</th>
              <th scope="col" className="px-3 py-3 font-medium">Target</th>
              <th scope="col" className="px-5 py-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((e) =>
            <tr key={e.id}>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">{formatDateTime(e.at)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-medium text-ink">{e.actor}</td>
                <td className="whitespace-nowrap px-3 py-3"><code className="rounded bg-canvas px-1.5 py-0.5 text-xs text-ink">{e.action}</code></td>
                <td className="whitespace-nowrap px-3 py-3">
                  {e.target.startsWith('SP-') ? <Link to={`/verify/${e.target}`} className="font-mono text-brand-700 hover:underline">{e.target}</Link> : <span className="text-ink">{e.target}</span>}
                </td>
                <td className="px-5 py-3 text-ink-muted">{e.detail}</td>
              </tr>
            )}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center text-sm text-ink-muted">No entries for this filter.</p>}
      </div>
    </div>);

}