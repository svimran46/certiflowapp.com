# CertiFlow Project Status & Session Summary

> **Context for AI Models / Developers:**  
> This document provides the complete context, architectural state, and recent changelog for **CertiFlow** (`certiflowapp.com`), deployed on Cloudflare Workers.

---

## 1. Project Overview & Tech Stack
- **Product:** CertiFlow – Automated Subcontractor Insurance (COI) & Endorsement Compliance Portal for General Contractors.
- **Repository:** `https://github.com/svimran46/certiflowapp.com`
- **Local Path:** `c:\Users\User\Downloads\certiflowapp.com`
- **Hosting / Runtime:** Cloudflare Workers with Static Assets (`wrangler.jsonc`)
  - **Worker Name:** `certiflowapp-com`
  - **Live URL:** `https://certiflowapp-com.svimranmy.workers.dev` (and custom domain `certiflowapp.com`)
  - **Database:** Cloudflare D1 (`certiflow-leads`, database ID: `4f1ed89e-21ba-4a96-80a8-841c284c05ae`)
  - **Email Service:** Resend (`api.resend.com`)
  - **Payments:** Stripe Checkout & Billing API (`stripe` v23.0.0)

---

## 2. Work Completed in This Session

### A. Stripe Checkout Integration
1. **Installed SDK:** Added `stripe` (`^23.0.0`) to `package.json`.
2. **Products Configured:** Verified 3 monthly subscription tiers created in the Stripe dashboard:
   - **Starter** ($49/month): `price_1UPfmOFaQ2FHfDqc2LthKXdt`
   - **Growth** ($99/month): `price_1UPfnkFaQ2FHfDqcH97iYzH4`
   - **Pro** ($199/month): `price_1UPfooFaQ2FHfDqcsjSMYUKa`
3. **Server Endpoint (`src/worker.js`):**
   - Route: `POST /api/create-checkout-session`
   - Parameters:
     - `mode`: `"subscription"`
     - `ui_mode`: `"hosted_page"`
     - `payment_method_collection`: `"always"`
     - `billing_address_collection`: `"auto"`
     - `submit_type`: `"auto"`
     - `success_url`: `${origin}/?session_id={CHECKOUT_SESSION_ID}#pricing`
     - `cancel_url`: `${origin}/#pricing`
     - Accepts JSON `{ "plan": "starter" | "growth" | "pro" }` or URL-encoded form submissions.
     - Responds with `303 See Other` redirect to `session.url` for browser posts, or JSON `{ url, sessionId }` when requested with `Accept: application/json`.
4. **Frontend UI:**
   - Updated `public/index.html` pricing table (`#pricing`) with interactive **"Subscribe"** buttons for each plan.
   - Styled forms in `public/styles.css` with clean layout on desktop and full-width actions on mobile.
5. **Documentation:** Created `STRIPE_INTEGRATION_TODO.md`.

---

### B. Passwordless Magic Link Email Sign-In
1. **UI Page (`public/login.html`):**
   - Passwordless sign-in page where users enter their work email to receive a one-time link.
   - Added **"Sign in"** links to the site header navigation and footer.
2. **Database Migration (`migrations/0003_magic_links.sql`):**
   - Table: `magic_links`
     - `id` (INTEGER PRIMARY KEY)
     - `token` (TEXT NOT NULL UNIQUE)
     - `email` (TEXT NOT NULL)
     - `created_at` (TEXT NOT NULL DEFAULT datetime('now'))
     - `expires_at` (TEXT NOT NULL)
     - `used_at` (TEXT)
   - Index on `token`.
3. **Backend Endpoints (`src/worker.js`):**
   - **`POST /api/auth/magic-link`**:
     - Validates work email.
     - Generates 64-char crypto token expiring in 15 minutes.
     - Saves token into Cloudflare D1 `magic_links`.
     - Sends email via **Resend API** with link: `${origin}/api/auth/verify?token=...`.
   - **`GET /api/auth/verify?token=...`**:
     - Validates token in D1 (checks existence, expiration, and ensures not previously used).
     - Burns token (`UPDATE magic_links SET used_at = datetime('now')`).
     - Issues `HttpOnly`, `Secure` session cookie: `certiflow_session=<token>`.
     - If email is an admin (`support.certiflowapp@gmail.com` or `svimranmy@gmail.com`), redirects directly to `/admin` without requiring HTTP Basic Auth!
     - Otherwise redirects to `/?signed_in=1#pricing`.
4. **Admin Protection (`src/worker.js` - `isAdmin`):**
   - Supports both HTTP Basic Auth and valid admin session cookies from magic link sign-ins.
5. **Automated Testing (`test/worker.test.mjs`):**
   - Unit tests covering token creation, verification, single-use prevention, and admin authentication.
   - **All 16 test cases pass.**

---

### C. Cloudflare Infrastructure, Secrets & Remote Database
1. **Remote Cloudflare Worker Secrets:** Configured via `wrangler secret put`:
   - `STRIPE_SECRET_KEY`: Set to user's test key (`sk_test_51UPfaLFa...`).
   - `RESEND_API_KEY`: Set to user's Resend key (`re_SgfRnJqv...`).
   - `NOTIFY_EMAIL`: Set to `support.certiflowapp@gmail.com`.
2. **Local Environment Variables (`.dev.vars` - Git Ignored):**
   - Contains Stripe keys, Resend key, and Google OAuth credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
3. **Remote D1 Database Migration:**
   - Applied `0003_magic_links.sql` to remote database `certiflow-leads` via `npx wrangler d1 migrations apply certiflow-leads --remote`.
4. **Live Deployment:**
   - Deployed code and static assets via `npm run deploy` to `https://certiflowapp-com.svimranmy.workers.dev`.
   - Live endpoints tested via API calls:
     - `POST /api/auth/magic-link`: Returned `{"ok":true,"message":"Sign-in link sent."}`.
     - `POST /api/create-checkout-session`: Successfully returned live Stripe checkout URL.
5. **Git Sync:**
   - Changes committed and pushed to `origin/main`.

---

## 3. Key Files & Project Structure

| File | Purpose |
| :--- | :--- |
| `src/worker.js` | Cloudflare Worker entry point handling routing, `/api/audit`, Stripe checkout, magic link auth, and `/admin` dashboard. |
| `public/index.html` | Landing page, hero, ACORD 25 preview, pricing table with checkout buttons. |
| `public/login.html` | Magic link passwordless email sign-in page. |
| `public/styles.css` | Handcrafted responsive CSS (WCAG AA compliant, no heavy external frameworks). |
| `public/app.js` | Client-side interactions, form handling, animated certificate display. |
| `migrations/` | D1 SQL migrations (`0001_audit_requests.sql`, `0002_lead_source.sql`, `0003_magic_links.sql`). |
| `test/worker.test.mjs` | Node.js native test runner suite (16 tests). |
| `wrangler.jsonc` | Cloudflare Worker configuration, D1 binding, static assets config. |
| `.dev.vars` | Local development secrets (ignored by Git). |
| `STRIPE_INTEGRATION_TODO.md` | Stripe setup parameters, webhooks, and next steps reference. |

---

## 4. Useful Commands

```bash
# Run local dev server (http://localhost:8787)
npm run dev

# Run unit tests
npm test

# Build static assets to dist/
npm run build

# Apply D1 migrations to remote production database
npm run db:migrate

# Deploy worker and static assets to Cloudflare
npm run deploy

# Inspect recent audit requests in remote D1
npm run leads
```
