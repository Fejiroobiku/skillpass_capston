import type { EvidenceMeta } from '../api/evidence';

/**
 * Evidence that could not be uploaded because there was no signal, kept on this phone until it can be sent.
 * Stored in IndexedDB so it survives closing the browser. Each item belongs to the trainer who captured it,
 * so a different account signed in on the same phone never uploads someone else's recording.
 */
export interface QueuedUpload {
  id: string;
  owner: string;
  blob: Blob;
  meta: EvidenceMeta;
  createdAt: number;
  /** Set when the server refused the file (for example an expired code); the trainer must retry or discard. */
  error?: string;
}

const DB_NAME = 'skillpass-offline';
const STORE = 'uploads';

// Fallback when IndexedDB is unavailable (some private browsing modes): items last until the tab closes.
const memory = new Map<string, QueuedUpload>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDb().then((db) => db ? new Promise<T | undefined>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }) : undefined);
}

export async function saveUpload(item: QueuedUpload): Promise<void> {
  if (!(await openDb())) {
    memory.set(item.id, item);
    return;
  }
  await run('readwrite', (s) => s.put(item));
}

export async function listUploads(owner: string): Promise<QueuedUpload[]> {
  const all = (await openDb()) ? (await run<QueuedUpload[]>('readonly', (s) => s.getAll())) ?? [] : [...memory.values()];
  return all.filter((i) => i.owner === owner).sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeUpload(id: string): Promise<void> {
  if (!(await openDb())) {
    memory.delete(id);
    return;
  }
  await run('readwrite', (s) => s.delete(id));
}

export const newUploadId = () => `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
