import { api } from './client';

/** Phone, email and password-reset calls. `devCode` / `devLink` only appear while the server is in console mode. */
export interface PhoneSent {
  alreadyVerified?: boolean;
  sentTo?: string;
  expiresAt?: string;
  resendAfterSeconds?: number;
  devCode?: string;
}
export interface EmailSent {
  alreadyVerified?: boolean;
  sentTo?: string;
  devLink?: string;
}

export const sendPhoneCode = () => api.post<PhoneSent>('/api/auth/phone/send');
export const verifyPhoneCode = (code: string) => api.post<{verified: boolean;}>('/api/auth/phone/verify', { code });
export const sendEmailLink = () => api.post<EmailSent>('/api/auth/email/send');
export const verifyEmailToken = (token: string) => api.post<{verified: boolean;}>('/api/auth/email/verify', { token });
export const requestPasswordReset = (email: string) => api.post<{message: string;devLink?: string;}>('/api/auth/password/forgot', { email });
export const resetPassword = (token: string, password: string) => api.post<{reset: boolean;}>('/api/auth/password/reset', { token, password });
