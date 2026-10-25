import { useRef, useState } from 'react';
import { CameraIcon, CloudOffIcon, FingerprintIcon, MapPinIcon, PlayIcon, RefreshCwIcon, ShieldAlertIcon, VideoIcon, XIcon } from 'lucide-react';
import type { Evidence, Place } from '../../types/skillpass';
import { CameraModal } from './CameraModal';
import { formatDateTime } from '../../utils/credentials';
import { useAuth } from '../../contexts/AuthContext';
import { useOnline, useUploadQueue } from '../../offline/hooks';

interface EvidenceCaptureProps {
  value: Evidence[];
  onChange: (ev: Evidence[]) => void;
  code: string;
  workshop: Place;
  sampleUrl: string;
  knownHashes?: Set<string>;
}

export function isDuplicate(ev: Evidence, list: Evidence[], known: Set<string> = new Set()) {
  return known.has(ev.hash) || list.filter((x) => x.hash === ev.hash).length > 1;
}

export function EvidenceCapture({ value, onChange, code, workshop, sampleUrl, knownHashes = new Set() }: EvidenceCaptureProps) {
  const [mode, setMode] = useState<'photo' | 'video' | null>(null);
  const hasVideo = value.some((e) => e.kind === 'video' && !!e.challengeCode);
  const { user } = useAuth();
  const online = useOnline();
  // The latest list, so evidence that finishes uploading later is added to what is on screen now.
  const latest = useRef(value);
  latest.current = value;
  const queue = useUploadQueue(user?.id, (ev) => onChange([...latest.current, ev]));

  return (
    <div>
      <div className="flex items-center gap-4 rounded-2xl border border-brand-200 bg-brand-50 p-4">
        <div className="rounded-xl bg-surface px-3 py-2 text-center">
          <p className="text-[10px] font-medium text-ink-muted">Your code</p>
          <p className="font-mono text-2xl font-semibold tracking-[0.2em] text-brand-800">{code || '····'}</p>
        </div>
        <p className="text-sm text-ink">
          Start the video by showing this code, then film <strong>the apprentice doing the task</strong>. The code works once and expires after 15 minutes, so old footage can't be reused.
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setMode('video')} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors duration-150 ${hasVideo ? 'border border-line text-ink hover:bg-canvas' : 'bg-brand-600 text-night hover:bg-brand-700'}`}>
          <VideoIcon className="h-4 w-4" /> {hasVideo ? 'Record another' : 'Record video'}
        </button>
        <button type="button" onClick={() => setMode('photo')} className="flex items-center justify-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-canvas">
          <CameraIcon className="h-4 w-4" /> Take photo
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-muted">Captured live in SkillPass only, with no gallery uploads. Each file is uploaded to the server, which time-stamps and fingerprints it.</p>

      {queue.items.length > 0 &&
      <ul className="mt-4 space-y-2" aria-label="Evidence waiting to upload">
          {queue.items.map((item) =>
        <li key={item.id} className={`flex items-start gap-3 rounded-xl border p-3 text-xs ${item.error ? 'border-bad-200 bg-bad-50' : 'border-warn-200 bg-warn-50'}`}>
              <CloudOffIcon className={`mt-0.5 h-4 w-4 shrink-0 ${item.error ? 'text-bad-700' : 'text-warn-700'}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{item.meta.kind === 'video' ? `Video · code ${item.meta.challengeCode ?? '—'}` : 'Photo'} · saved on this phone</p>
                {item.error ?
            <p className="mt-0.5 font-medium text-bad-700">Couldn't upload: {item.error}</p> :
            <p className="mt-0.5 text-warn-700">{queue.sending ? 'Uploading…' : online ? 'Waiting to upload. Retrying shortly.' : "No signal. It will upload by itself when you're back online."}</p>
            }
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => void queue.retry(item.id)} disabled={queue.sending} aria-label="Try uploading now" className="rounded-full p-1.5 text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-50"><RefreshCwIcon className="h-4 w-4" /></button>
                <button type="button" onClick={() => void queue.discard(item.id)} aria-label="Discard this file" className="rounded-full p-1.5 text-ink-muted hover:bg-canvas hover:text-ink"><XIcon className="h-4 w-4" /></button>
              </div>
            </li>
        )}
        </ul>
      }

      {value.length > 0 &&
      <ul className="mt-4 space-y-2">
          {value.map((ev, index) => {
          const dup = isDuplicate(ev, value, knownHashes);
          return (
            <li key={`${ev.id}-${index}`} className={`flex gap-3 rounded-xl border p-2.5 ${dup ? 'border-bad-200 bg-bad-50' : 'border-line'}`}>
                <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-canvas">
                  {ev.kind === 'photo' || ev.poster ? <img src={ev.poster ?? ev.url} alt={ev.caption} className="h-full w-full object-cover" /> : <video src={ev.url} className="h-full w-full object-cover" muted />}
                  {ev.kind === 'video' && <span className="absolute inset-0 flex items-center justify-center bg-night/70"><PlayIcon className="h-5 w-5 fill-white text-white" /></span>}
                </div>
                <div className="min-w-0 flex-1 text-xs">
                  <p className="text-sm font-medium text-ink">{ev.kind === 'video' ? `Video · ${ev.durationSec ?? '—'}s · code ${ev.challengeCode}` : 'Photo'}</p>
                  <p className="mt-0.5 text-ink-muted">{formatDateTime(ev.capturedAt)}</p>
                  <p className="flex items-center gap-1 truncate text-ink-muted"><MapPinIcon className="h-3 w-3 shrink-0" />{ev.locationLabel} {ev.locationSource === 'gps' ? <span className="rounded bg-ok-50 px-1 font-semibold text-ok-700">GPS</span> : <span className="rounded bg-warn-50 px-1 font-semibold text-warn-700">Declared</span>}</p>
                  <p className="flex items-center gap-1 font-mono text-ink-subtle"><FingerprintIcon className="h-3 w-3 shrink-0" />{ev.hash.slice(0, 16)}…</p>
                  {dup && <p className="mt-1 flex items-center gap-1 font-semibold text-bad-700"><ShieldAlertIcon className="h-3.5 w-3.5" /> Matches evidence already used — remove it</p>}
                </div>
                <button type="button" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label="Remove evidence" className="self-start rounded-full p-1 text-ink-muted hover:bg-canvas hover:text-ink">
                  <XIcon className="h-4 w-4" />
                </button>
              </li>);

        })}
        </ul>
      }

      <CameraModal mode={mode} code={code} workshop={workshop} fallbackUrl={sampleUrl} onCapture={(ev) => onChange([...value, ev])} onQueued={(blob, meta) => void queue.enqueue(blob, meta)} onClose={() => setMode(null)} />
    </div>);

}