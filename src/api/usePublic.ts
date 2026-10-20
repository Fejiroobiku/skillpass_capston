import { useCallback, useEffect, useState } from 'react';
import { api, messageOf } from './client';
import type { PublicCredential, PublicPassportData } from './types';

type Status = 'idle' | 'loading' | 'found' | 'missing' | 'error';

function usePublicResource<T>(path: string | null, pick: (r: any) => T, nonce = 0) {
  const [state, setState] = useState<{status: Status;data: T | null;error: string | null;}>({ status: 'idle', data: null, error: null });

  const load = useCallback(async () => {
    if (!path) return setState({ status: 'idle', data: null, error: null });
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      setState({ status: 'found', data: pick(await api.get(path)), error: null });
    } catch (e) {
      const missing = (e as {status?: number;}).status === 404;
      setState({ status: missing ? 'missing' : 'error', data: null, error: missing ? null : messageOf(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {void load();}, [load, nonce]);
  return { ...state, reload: load };
}

/** The public view of a credential, from the server. Works without signing in. */
export const useVerifiedCredential = (id: string | null, nonce = 0) =>
usePublicResource<PublicCredential>(id ? `/api/verify/${encodeURIComponent(id)}` : null, (r) => r.credential, nonce);

/**
 * Where a passport comes from: a shared link's token (anyone), an account ID (only the apprentice's own trainer
 * and administrators, signed in), or "me" (the signed-in apprentice's own, even while the public link is off).
 */
export type PassportSource = {token: string;} | {apprenticeId: string;} | {me: true;};

const passportPath = (s: PassportSource) =>
'token' in s ? `/api/passport/${encodeURIComponent(s.token)}` :
'apprenticeId' in s ? `/api/passport/people/${encodeURIComponent(s.apprenticeId)}` :
'/api/passport/me';

export const usePassport = (source: PassportSource | null) =>
usePublicResource<PublicPassportData>(source ? passportPath(source) : null, (r) => r.passport);
