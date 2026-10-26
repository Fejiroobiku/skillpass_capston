import path from 'node:path';
import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`);
  return value;
}

// The sample values in .env.example are public, so they must never be accepted as real secrets.
const PLACEHOLDER = /change-?me|replace-?me/i;

function secret(name) {
  const value = required(name);
  if (value.length < 32) throw new Error(`${name} must be at least 32 characters long.`);
  if (PLACEHOLDER.test(value)) {
    throw new Error(`${name} is still the placeholder from .env.example. Generate a real one with:\n  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`);
  }
  return value;
}

const flag = (value) => ['1', 'true', 'yes'].includes(String(value ?? '').toLowerCase());

const choice = (name, allowed, fallback) => {
  const value = (process.env[name] ?? fallback).toLowerCase();
  if (!allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(', ')}.`);
  return value;
};
const smsProvider = choice('SMS_PROVIDER', ['console', 'termii'], 'console');
const emailProvider = choice('EMAIL_PROVIDER', ['console', 'resend'], 'console');
const paymentProvider = choice('PAYMENT_PROVIDER', ['simulated', 'paystack'], 'simulated');

function paystackKey() {
  const key = required('PAYSTACK_SECRET_KEY');
  if (!/^sk_(test|live)_/.test(key)) throw new Error('PAYSTACK_SECRET_KEY must start with sk_test_ or sk_live_.');
  // The pilot runs in Paystack test mode. Live keys move real money, so they need a deliberate extra switch.
  if (key.startsWith('sk_live_') && !flag(process.env.PAYSTACK_ALLOW_LIVE)) {
    throw new Error('PAYSTACK_SECRET_KEY is a live key. The pilot uses test mode (sk_test_…). Set PAYSTACK_ALLOW_LIVE=true only after ethics approval for real payments.');
  }
  return key;
}
const port = Number(process.env.PORT ?? 4000);

const jwtSecret = secret('JWT_SECRET');
const signingKey = secret('SIGNING_KEY');
if (jwtSecret === signingKey) throw new Error('JWT_SECRET and SIGNING_KEY must be two different values.');

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port,
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: flag(process.env.DATABASE_SSL),
  jwtSecret,
  signingKey,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? 'uploads'),
  // Evidence links expire after this many minutes; pages fetch fresh links each time they load.
  evidenceUrlMinutes: Number(process.env.EVIDENCE_URL_MINUTES ?? 30),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 40),
  // Lets the demo build upload generated sample evidence marked source=demo. Never enable with real participants.
  allowDemoEvidence: flag(process.env.ALLOW_DEMO_EVIDENCE),
  publicUrl: (process.env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, ''),
  // "Today" for the daily issuing limit means today in Lagos, not UTC.
  timezone: 'Africa/Lagos',
  // Where people open the app, used in email links. Defaults to the first CORS origin.
  appUrl: (process.env.APP_URL ?? (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',')[0]).trim().replace(/\/$/, ''),
  smsProvider,
  termii: smsProvider === 'termii' ? {
    apiKey: required('TERMII_API_KEY'),
    senderId: required('TERMII_SENDER_ID'),
    baseUrl: required('TERMII_BASE_URL').replace(/\/$/, ''),
    channel: process.env.TERMII_CHANNEL ?? 'dnd',
  } : null,
  paymentProvider,
  paystack: paymentProvider === 'paystack' ? {
    secretKey: paystackKey(),
    baseUrl: (process.env.PAYSTACK_BASE_URL ?? 'https://api.paystack.co').replace(/\/$/, ''),
  } : null,
  emailProvider,
  resendApiKey: emailProvider === 'resend' ? required('RESEND_API_KEY') : null,
  emailFrom: emailProvider === 'resend' ? required('EMAIL_FROM') : null,
};
