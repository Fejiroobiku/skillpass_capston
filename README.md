# SkillPass

An assessor-verified digital skills passport for informal artisans in Nigeria, with safe job payments through escrow.

| | |
|---|---|
| **Walkthrough video** | [paste your video link here] |
| **Code repository** | https://github.com/Fejiroobiku/skillpass_capston |
| **Technical report (PDF)** | [docs/SkillPass_Technical_Report.pdf](docs/SkillPass_Technical_Report.pdf) |
| **Live demo** | [paste the deployed link here, if deployed] |
| **Author** | Fejiro Obiku, BSc Software Engineering, African Leadership University. Supervisor: Tunde Isiaq Gbadamosi |

## Project overview

About 93% of employment in Nigeria is informal, and most tradespeople learn through workshop apprenticeships. They finish with real skills but no record that an employer outside their area can check, and employers have no quick way to tell real skill from a bought certificate.

SkillPass lets an **assessor** (an approved, experienced tradesperson) record a skill they **watched** an **artisan** perform, backed by a live photo or video. The artisan confirms it, and anyone can verify it in under a minute through a QR code or link, with no login. Integrity safeguards keep assessors honest, and verified skills feed job referrals.

When an employer hires through SkillPass, both sides agree the price in the app with **materials and workmanship shown separately**. The employer pays into **escrow** before work starts: materials money goes to the artisan at once, and workmanship is held until the employer confirms the job (or released automatically after 3 days). Disputes freeze the money and an administrator decides how it is shared. Both sides rate each other. Everything is governed by a plain-language [Terms of Service](src/data/terms.ts) (English and Pidgin) that everyone accepts.

> **Names:** the app calls the two main roles **Assessor** and **Artisan** (an artisan may have learned as an apprentice or be self-taught). In the code and database the role ids are still `trainer` and `apprentice`, so URLs such as `/trainer` and `/apprentice` are unchanged.

The pilot covers three trades (electrical installation, auto mechanics and tailoring) in Lagos State.

### What each role can do

| Role | Main features |
|---|---|
| **Assessor** | Assess a skill against its rubric; record live video evidence showing a one-time code; issue a signed credential; see their trust score; propose new skills |
| **Artisan** | Confirm or reject each credential; share a passport link and QR code (switch it off or make a new link at any time); send a quote for referred jobs; accept job terms; take before/after photos; get paid; raise a dispute; rate employers; report an assessor privately |
| **Employer** | Verify a credential; post a job (who buys materials, materials and workmanship budgets); compare quotes; offer a job with clear terms; pay into escrow; confirm the work to release payment, or raise a dispute; rate the artisan |
| **Administrator** | Approve assessors and employers; review flags, held credentials, random audits, confidential reports and **job disputes** (split held money 0–100%); revoke; manage skills; set the review period; read pilot metrics; check the tamper-evident audit log |
| **Public** | Verify any credential by ID, link or QR code, with no account |

### Integrity safeguards

- **Evidence before credential:** a video must show a one-time code from the server; files are SHA-256 hashed and a file can never back two credentials.
- **Artisan confirmation:** a credential is only valid once the artisan confirms it.
- **Escrow:** job money is held by SkillPass until the employer confirms the work; disputes freeze it until an administrator decides (Terms of Service, sections 6 and 8).
- **Co-signing:** advanced skills and new assessors on probation need a second assessor's signature.
- **Risk rules and trust score:** fast issuing, passing everyone, clustered days, poor employer ratings and open reports raise an assessor's risk; trust combines audit agreement, ratings and flags.
- **Random audits:** about 10% of credentials are re-checked by an independent assessor.
- **Signatures:** every credential carries an HMAC-SHA256 server signature; the public page shows whether it still matches.
- **Tamper-evident audit log:** entries are sealed in an HMAC hash chain, so any edit, deletion or reordering is detected.
- **Private evidence:** files are only served through signed links that expire after 30 minutes.
- **Privacy (Nigeria Data Protection Act 2023):** 18+ only, phone verification, no exact GPS or phone numbers in public, and withdrawing consent removes a person's data and evidence.

### Built for Lagos conditions

- **English and Nigerian Pidgin** on the artisan, sign-in, Terms and public pages (`src/i18n`).
- **Weak signal:** failed uploads are kept on the phone (IndexedDB) and sent when the connection returns; video is capped at about 3 MB per 30 s; a service worker lets the app open without signal.
- **Low-end phones:** signed-in pages load on demand. On a throttled low-end Android profile (6× CPU, 3G) the sign-in page is ready in 1.96 s and a credential check in 2.54 s (see the report).

## Technical requirements

| Component | Version | Notes |
|---|---|---|
| Node.js | 22 or later | Tested on 22.22 |
| npm | 10 or later | Comes with Node 22 |
| PostgreSQL | 14 or later | Tested on 16 |
| Browser | Recent Chrome, Edge, Opera, Firefox or Safari | Mobile-first; tested from 360 px wide |
| Operating system | Windows (with WSL), macOS or Linux | Developed on Windows 11 + WSL Ubuntu |

Main frameworks and libraries:

| Layer | Technology |
|---|---|
| Frontend | React 18.3, TypeScript 5.5, Vite 5, Tailwind CSS 3.4, React Router 6 |
| Backend | Express 5, node-postgres 8, Zod 3 (validation), jsonwebtoken, bcryptjs, Helmet, express-rate-limit, Multer |
| Database | PostgreSQL (schema in `backend/database/schema.sql`) |
| Testing | Node's built-in test runner (backend), Vitest 2 + Testing Library (frontend), Playwright (browser checks) |
| Messaging | Console mode for demos; Termii (SMS) and Resend (email) ready to switch on |
| Payments | Simulated escrow for demos (no money moves); Paystack (Checkout, Transfers, Refunds) in test mode with `PAYMENT_PROVIDER=paystack` |

## Installation

### 1. Get the code

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
```

### 2. Database

Create an empty PostgreSQL database and user, for example:

```bash
sudo -u postgres psql -c "CREATE USER skillpass WITH PASSWORD 'skillpass';"
sudo -u postgres psql -c "CREATE DATABASE skillpass OWNER skillpass;"
```

### 3. Backend API

```bash
cd backend
cp .env.example .env      # then set DATABASE_URL, JWT_SECRET and SIGNING_KEY (two different long random strings)
npm install
npm run db:schema         # create the tables
npm run db:seed           # demo accounts and data (demo databases only)
npm run dev               # API on http://localhost:4000
```

Generate the two secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Upgrading an older database instead of creating a new one: `npm run db:migrate`. To start again with fresh demo data (development only): `npm run db:reset`.

**Payments.** By default `PAYMENT_PROVIDER=simulated`: employers pay on a test checkout page and no money moves. To use Paystack in test mode, set `PAYMENT_PROVIDER=paystack` and `PAYSTACK_SECRET_KEY=sk_test_…`, and point the Paystack webhook at `<PUBLIC_URL>/api/payments/paystack/webhook`. Live keys are refused unless `PAYSTACK_ALLOW_LIVE=true`.

### 4. Frontend

In a second terminal, from the project root:

```bash
cp .env.example .env.local   # VITE_API_URL=http://localhost:4000; VITE_DEMO_MODE=true shows quick-login buttons
npm install
npm run dev                  # open http://localhost:5173
```

### 5. Demo accounts

All use the password `demo1234`.

| Role | Email |
|---|---|
| Administrator | admin@skillpass.ng |
| Assessor | babatunde@skillpass.ng |
| Artisan | tobi@skillpass.ng (a job in progress) · emeka@skillpass.ng (a dispute waiting for the admin) |
| Employer | folake@skillpass.ng (quotes, jobs, a decided and an open dispute) |

Texts and emails (verification codes, password resets) are printed in the backend terminal while `SMS_PROVIDER` and `EMAIL_PROVIDER` are `console`.

### 6. Run the tests

```bash
createdb skillpass_test                   # once; the tests wipe and re-seed this database
cd backend && npm test                    # 137 API, integration and unit tests
cd .. && npm test                         # 24 UI tests: the real app against the real API
npm run typecheck && npm run lint         # type check and lint
```

Set `TEST_DATABASE_URL` if your test database is not at `postgres://skillpass:skillpass@localhost:5432/skillpass_test`.

### 7. Production build

```bash
npm run build      # frontend into dist/ (deploy to Netlify or Vercel)
cd backend && npm start
```

## Repository structure

```
skillpass/
├── src/                        Frontend (React + TypeScript)
│   ├── api/                    HTTP client, ApiError and token storage
│   ├── components/             Reusable UI: layout, evidence capture, QR codes, score ring, passport view
│   ├── contexts/               Auth and app data providers
│   ├── i18n/                   English and Nigerian Pidgin text
│   ├── offline/                Upload queue for weak signal (IndexedDB)
│   ├── pages/                  One folder per role: trainer (assessor), apprentice (artisan), employer, admin, public, shared, auth
│   ├── pageLoaders.ts          On-demand page loading and preloading by role
│   ├── utils/                  Matching, trust and risk calculations shown in the UI
│   └── test/                   UI tests (Vitest + Testing Library)
├── backend/
│   ├── src/
│   │   ├── routes/             REST endpoints, one file per area (auth, credentials, evidence, verify, jobs, admin…)
│   │   ├── lib/                Domain logic: scoring (TrustScoreCalculator, RiskAssessor + rules), matching (JobMatcher),
│   │   │                       messaging (MessageChannel family), storage (EvidenceStore, signed links), audit chain,
│   │   │                       signing, privacy, phone numbers
│   │   ├── middleware/         Authentication and error handling
│   │   ├── app.js / server.js  Express app and start-up
│   │   └── config.js           Validated environment settings
│   ├── database/               schema.sql, seed.sql and migrations/
│   ├── scripts/db.js           Create, migrate, seed and reset the database
│   └── tests/                  API, module, verification, config and unit tests
├── public/                     Icons, manifest, service worker, demo evidence images
├── docs/                       Technical report and screenshots
└── README.md
```

## Testing and performance (summary)

| Strategy | What | Result |
|---|---|---|
| Unit | Classes for signed links, matching, trust score, risk rules, message channels, payment gateways (Paystack requests in kobo, webhook signatures) | 37 tests pass |
| Integration (API + database) | Every endpoint against a real PostgreSQL database, including integrity rules, privacy, and the full job flow: terms, quotes, agreements, escrow, photos, automatic release, disputes and two-way ratings | 100 tests pass |
| End-to-end UI | The real React app against the real API | 24 tests pass |
| Security | Forged, edited and expired evidence links; tampered credential signatures; tampered audit log; role-based access | Included above |
| Performance | Page load on desktop, mid-range and low-end Android profiles; API under load | See report |
| Compatibility | 360, 390, 768 and 1366 px screens; Chromium-based browsers | No layout overflow |

Full method and figures are in the technical report.

## Languages

Text lives in `src/i18n/en.ts` (English, the source) and `src/i18n/pcm.ts` (Pidgin, a draft to be checked by a Pidgin speaker from the pilot). To add Yoruba, Hausa or Igbo, copy `pcm.ts`, translate it with a native speaker and register it in `src/i18n/index.tsx`.

## Deployment plan

| Part | Service | Notes |
|---|---|---|
| Frontend | Netlify or Vercel | `npm run build`, auto-deploys from GitHub |
| Backend API | Render (Frankfurt region) | Environment variables set in the dashboard |
| Database | Render or Supabase PostgreSQL (Frankfurt) | Personal data stays in the EU region named in the ethics application |
| Evidence files | Supabase Storage (Frankfurt) | Add a subclass of `EvidenceStore` in `backend/src/lib/storage.js` |

## Third-party licences

SkillPass reuses only open-source libraries with permissive licences. No external datasets or AI models are used.

| Library | Used for | Licence |
|---|---|---|
| React, React DOM, React Router | Front-end UI and routing | MIT |
| Framer Motion, @emotion/react | Animation and styling | MIT |
| lucide-react | Icons | ISC |
| qrcode.react | QR codes on passports and credentials | ISC |
| Vite, Tailwind CSS, TypeScript | Build tools | MIT / MIT / Apache-2.0 |
| Express, CORS, Helmet, express-rate-limit, Multer | API server, security headers, rate limits, uploads | MIT |
| pg (node-postgres) | PostgreSQL client | MIT |
| Zod | Input validation | MIT |
| jsonwebtoken | Sign-in tokens | MIT |
| bcryptjs | Password hashing | BSD-3-Clause |
| dotenv | Configuration | BSD-2-Clause |

Each library's full licence text ships in its folder under `node_modules`.
