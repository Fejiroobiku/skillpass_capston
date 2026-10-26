import type { Evidence } from '../types/skillpass';
import type { EvidenceMeta } from './evidence';
import { api } from './client';

/**
 * Send a live-camera photo of a job site (before work starts, or the finished work).
 * The server refuses a photo that was already used anywhere in SkillPass.
 * Returns an Evidence-shaped record so the shared camera can use it.
 */
export function jobPhotoUploader(agreementId: string, stage: 'before' | 'after') {
  return async (blob: Blob, meta: EvidenceMeta): Promise<Evidence> => {
    const form = new FormData();
    form.append('file', blob, blob.type.includes('png') ? 'photo.png' : 'photo.jpg');
    form.append('stage', stage);
    form.append('locationLabel', meta.locationLabel);
    if (meta.lat !== undefined) form.append('lat', String(meta.lat));
    if (meta.lng !== undefined) form.append('lng', String(meta.lng));
    if (meta.locationSource) form.append('locationSource', meta.locationSource);
    const r = await api.upload<{photo: {id: string;stage: string;};}>(`/api/agreements/${agreementId}/photos`, form);
    return {
      id: r.photo.id, kind: 'photo', url: '', caption: meta.caption, capturedAt: new Date().toISOString(),
      locationLabel: meta.locationLabel, locationSource: meta.locationSource ?? 'declared', hash: ''
    } as Evidence;
  };
}

/** Banks an artisan can be paid into (from Paystack when connected). */
export const loadBanks = async () => (await api.get<{banks: {code: string;name: string;}[];}>('/api/payments/banks')).banks;

export interface PaymentInfo {
  agreementId: string;
  title: string;
  artisan: string;
  status: string;
  amount: number;
  materialsBy: 'employer' | 'artisan';
  materialsAmount: number;
  workmanshipAmount: number;
  provider: 'simulated' | 'paystack';
  testMode: boolean;
}

export const loadPayment = (reference: string) => api.get<PaymentInfo>(`/api/payments/${encodeURIComponent(reference)}`);
export const simulatePayment = (reference: string) => api.post(`/api/payments/${encodeURIComponent(reference)}/simulate`);
export const confirmPayment = (reference: string) => api.post(`/api/payments/${encodeURIComponent(reference)}/confirm`);
export const acceptLatestTerms = (version: string) => api.post('/api/terms/accept', { version });

export const naira = (n: number | null | undefined) => `₦${Number(n ?? 0).toLocaleString('en-NG')}`;
