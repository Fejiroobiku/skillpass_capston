import { useCallback, useEffect, useRef, useState } from 'react';
import type { Evidence } from '../types/skillpass';
import { ApiError, messageOf } from '../api/client';
import { uploadEvidence, type EvidenceMeta } from '../api/evidence';
import { listUploads, newUploadId, removeUpload, saveUpload, type QueuedUpload } from './uploadQueue';

/** True while the browser thinks it has a connection. */
export function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** "No signal" as opposed to the server refusing the file. */
export const isNetworkError = (e: unknown) => e instanceof ApiError && e.status === 0;

const RETRY_MS = 20_000;

/**
 * Evidence waiting on this phone for a signal. Items upload automatically when the connection comes back
 * (and every 20 seconds while any are waiting); each one that gets through is handed to `onUploaded`.
 */
export function useUploadQueue(ownerId: string | undefined, onUploaded: (ev: Evidence) => void) {
  const [items, setItems] = useState<QueuedUpload[]>([]);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const uploaded = useRef(onUploaded);
  uploaded.current = onUploaded;

  const refresh = useCallback(async () => {
    if (ownerId) setItems(await listUploads(ownerId));
  }, [ownerId]);

  const flush = useCallback(async () => {
    if (!ownerId || busy.current) return;
    busy.current = true;
    setSending(true);
    try {
      for (const item of await listUploads(ownerId)) {
        if (item.error) continue; // refused by the server: waits for the trainer to retry or discard
        try {
          const ev = await uploadEvidence(item.blob, item.meta);
          await removeUpload(item.id);
          uploaded.current(ev);
        } catch (e) {
          if (isNetworkError(e)) break; // still no signal: try again later
          await saveUpload({ ...item, error: messageOf(e) });
        }
      }
    } finally {
      busy.current = false;
      setSending(false);
      await refresh();
    }
  }, [ownerId, refresh]);

  const enqueue = useCallback(async (blob: Blob, meta: EvidenceMeta) => {
    if (!ownerId) return;
    await saveUpload({ id: newUploadId(), owner: ownerId, blob, meta, createdAt: Date.now() });
    await refresh();
  }, [ownerId, refresh]);

  const retry = useCallback(async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (item) await saveUpload({ ...item, error: undefined });
    await flush();
  }, [items, flush]);

  const discard = useCallback(async (id: string) => {
    await removeUpload(id);
    await refresh();
  }, [refresh]);

  // On open, and whenever the connection comes back, send anything waiting.
  useEffect(() => {
    void flush();
    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flush]);

  const waiting = items.some((i) => !i.error);
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => void flush(), RETRY_MS);
    return () => window.clearInterval(timer);
  }, [waiting, flush]);

  return { items, sending, enqueue, retry, discard, flush };
}
