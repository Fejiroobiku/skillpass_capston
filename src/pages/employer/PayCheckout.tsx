import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2Icon, FlaskConicalIcon, LockIcon } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { MoneyBreakdown, btnPrimary, btnSecondary } from '../../components/jobs/JobParts';
import { confirmPayment, loadPayment, naira, simulatePayment, type PaymentInfo } from '../../api/jobs';
import { messageOf } from '../../api/client';
import { useSkillPass } from '../../contexts/SkillPassContext';

/**
 * Paying into escrow.
 *   Simulated gateway: this page is the checkout. "Pay" records a test payment; no money moves.
 *   Paystack: the employer pays on Paystack's page, which sends them back here; we then ask the server to check
 *   with Paystack that the money really arrived.
 */
export function PayCheckout() {
  const { reference = '' } = useParams();
  const { refresh } = useSkillPass();
  const [info, setInfo] = useState<PaymentInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await loadPayment(reference);
      setInfo(p);
      if (p.status !== 'proposed' && p.status !== 'accepted') setDone(true);
      return p;
    } catch (e) {
      setError(messageOf(e));
      return null;
    }
  }, [reference]);

  useEffect(() => {
    (async () => {
      const p = await load();
      // Back from Paystack: check the payment straight away.
      if (p?.provider === 'paystack' && p.status === 'accepted') {
        try {
          await confirmPayment(reference);
          await refresh();
          setDone(true);
        } catch (e) {
          setError(messageOf(e));
        }
      }
    })();
  }, [load, reference, refresh]);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      await simulatePayment(reference);
      await refresh();
      await load();
      setDone(true);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Pay into escrow" subtitle="SkillPass holds this money. Materials money goes to the artisan straight away; workmanship is released only when you confirm the job is done." />
      <div className="mx-auto max-w-xl">
        <Panel>
          {!info && !error && <p role="status" className="text-sm text-ink-muted">Loading payment…</p>}
          {info &&
          <div className="space-y-5">
              <div>
                <p className="text-sm text-ink-muted">{info.artisan}</p>
                <h2 className="text-xl font-semibold text-ink">{info.title}</h2>
              </div>
              <MoneyBreakdown a={{ materialsBy: info.materialsBy, materialsAmount: info.materialsAmount, workmanshipAmount: info.workmanshipAmount }} />
              {done ?
            <div className="flex items-start gap-3 rounded-sm bg-ok-50 p-4 text-ok-700">
                  <CheckCircle2Icon className="h-5 w-5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-semibold">Payment received and held safely.</p>
                    <p className="mt-1">{info.artisan} has been told to start. You will confirm the work, or raise a dispute, when they mark it done.</p>
                  </div>
                </div> :
            info.provider === 'simulated' ?
            <>
                  <p className="flex items-start gap-2 rounded-sm border border-warn-600/40 bg-warn-50 p-3 text-sm text-warn-700">
                    <FlaskConicalIcon className="mt-0.5 h-4 w-4 shrink-0" /> Test checkout. No real money moves during the pilot.
                  </p>
                  <button type="button" disabled={busy} onClick={pay} className={`${btnPrimary} w-full py-3`}>
                    <LockIcon className="h-4 w-4" /> {busy ? 'Processing…' : `Pay ${naira(info.amount)} (test)`}
                  </button>
                </> :

            <p className="text-sm text-ink-muted">Checking your payment with Paystack…{info.testMode && ' (Paystack test mode)'}</p>
            }
              {error && <p role="alert" className="rounded-sm bg-bad-50 p-3 text-sm text-bad-700">{error}</p>}
              <Link to="/employer/hires" className={`${btnSecondary} w-full`}>Back to Hires & Payments</Link>
            </div>
          }
          {!info && error && <p role="alert" className="text-sm text-bad-700">{error}</p>}
        </Panel>
      </div>
    </>);

}
