# CertiFlow (certiflowapp.com)

> **Automated Subcontractor Insurance (COI) & Endorsement Compliance Portal**  
> Designed for Commercial General Contractors ($3M–$25M volume) managing 25–100 active trade partners.

[![Live Web Platform](https://img.shields.io/badge/Status-Production%20Ready-emerald.svg)](https://certiflowapp.com)
[![Custom Domain](https://img.shields.io/badge/Domain-certiflowapp.com-blue.svg)](https://certiflowapp.com)
[![License](https://img.shields.io/badge/License-Proprietary-slate.svg)](#)

---

## 🎯 The Problem

Commercial General Contractors (GCs) spend **10 to 15 hours per week** tracking subcontractor Certificate of Insurance (COI) expirations in spreadsheets and chasing down commercial insurance brokers.

- **Spreadsheet Blindspot:** Spreadsheets only track Box 1 expiration dates; they cannot read whether attached endorsement forms (**CG 20 10 Ongoing Operations**, **CG 20 37 Completed Operations**, or **Waiver of Subrogation**) were included.
- **Tort Liability:** If a subcontractor causes a jobsite catastrophe without completed operations coverage, the general contractor is exposed to six-figure personal liability.
- **Audit Penalties:** During annual commercial general liability audits, insurance carriers charge hefty unearned premium clawbacks for any subcontractor who worked without active, endorsed coverage.
- **Enterprise Bloat:** Existing tools (`myCOI`, `Jones`, `Procore`) charge **$5,000–$10,000/year** with mandatory annual contracts and complex sales demos.

---

## 🛡️ The Solution: CertiFlow

CertiFlow is a self-service compliance portal starting at **$49/month**:

1. **Standardized ACORD 25 Extraction:** 95%+ of US certificates use the standardized ACORD 25 form. Multimodal Vision models extract policy limits, dates, and form numbers with high precision.
2. **Endorsement Verification:** Checks attached endorsement pages for mandatory ISO forms (CG 20 10, CG 20 37, CG 24 04).
3. **Passwordless Magic Links:** Subcontractors and brokers drag-and-drop PDFs in 10 seconds without creating accounts or passwords.
4. **Automated Broker Resolution Loop:** Automatically drafts and routes exact deficiency notices directly to the insurance broker listed in Box 1 when coverage is lapsed or missing.
5. **1-Click Audit Binder:** Time-stamped legal archive ready for instant export during annual carrier audits.

---

## Site and deployment

The site is a static page in `public/` (built into `dist/`) served by a Cloudflare Worker with static assets (`wrangler.jsonc`). The Worker in `src/` handles Sign in with Google, Stripe subscriptions with a 14-day free trial, and the onboarding form at `POST /api/audit`, all stored in the D1 database `certiflow-leads`.

```
public/            static site: index.html, styles.css, app.js, fonts, _headers,
                   guides/ (COI checklist, premium audits), tools/ (broker notice), sample-gap-report (.html and .pdf), privacy, 404
src/worker.js      routes: onboarding form (/api/audit), /admin leads page
src/accounts.js    Sign in with Google (/auth/google), sessions, /api/me
src/billing.js     Stripe checkout with a 14-day trial, billing portal, signed webhook
migrations/        D1 schema
scripts/build.mjs  link check, then copy public/ to dist/ (npm run build)
docs/              strategy notes (see AUDIT.md: move these out of a public repo)
```

| Command | What it does |
|---|---|
| `npm run dev` | Local server at http://localhost:8787 (run `npx wrangler d1 migrations apply certiflow-leads --local` once first) |
| `npm run build` | Checks every local link and asset, then writes `dist/` |
| `npm test` | Runs the API, account and billing tests (`test/`) |
| `npm run deploy` | Deploys to the `certiflowapp-com` Worker |
| `npm run leads` | Lists the latest audit requests from D1 |

Workers Builds (Git integration) deploys `main` automatically: build command `npm run build`, deploy command `npx wrangler deploy`. See `AUDIT.md` for the October 2026 site audit and open items.

---

## Accounts and billing setup

Visitors pick a plan, sign in with Google, then add a card on Stripe's checkout page. Stripe starts a 14-day trial and charges nothing until it ends; if there's no card when the trial ends, the subscription is cancelled instead of billed. Each account gets one trial. Customers change their card, switch plans or cancel through Stripe's billing portal, opened from **Manage billing** on `/account`.

Until the secrets below exist, the site still works: sign-up shows "opens shortly" and points people to support@.

**1. Database tables (once):** `npm run db:migrate` applies `migrations/0003_accounts.sql` (users, sessions, Stripe events).

**2. Google sign-in:** in [Google Cloud Console](https://console.cloud.google.com/apis/credentials), configure the OAuth consent screen (app name CertiFlow, scopes `openid`, `email`, `profile`), then create an **OAuth client ID** of type *Web application* with these authorized redirect URIs:

```
https://certiflowapp.com/auth/google/callback
https://certiflowapp-com.svimranmy.workers.dev/auth/google/callback
```

**3. Stripe:** use test mode first (`sk_test_...`, card `4242 4242 4242 4242`). In the Stripe dashboard:
- Developers → API keys: copy the secret key.
- Developers → Webhooks → Add endpoint `https://certiflowapp.com/api/stripe/webhook` with events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy its signing secret.
- Settings → Billing → Customer portal: save the settings once (allow cancelling, updating payment methods and switching between the three CertiFlow plans).

The three monthly prices ($49, $99, $199) are created in Stripe automatically the first time each plan is chosen.

**4. Secrets:** add each as type **Secret** in Cloudflare (Workers & Pages → certiflowapp-com → Settings → Variables and Secrets), or with `npx wrangler secret put NAME`:

| Secret | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID, ends in `.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `STRIPE_SECRET_KEY` | `sk_test_...`, later `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from the webhook endpoint |

For local development put the same names in `.dev.vars` (git-ignored). Sign-ups and trial status show on `/admin` under **Accounts and trials**.

---

## Tracking outreach and reading leads

Every onboarding submission stores where the visitor first came from: any `utm_*` tags or a short `ref` code in the link, plus the referring site. It also stores their answers to the on-page self-check. Tag every link you send so you can see which emails and campaigns turn into audits.

| Where the link goes | Link to use |
|---|---|
| Cold email, template A (finance / office admin) | `https://certiflowapp.com/?utm_source=email&utm_campaign=dfw-oct&utm_content=template-a` |
| Cold email, template B (compliance lead) | `https://certiflowapp.com/?utm_source=email&utm_campaign=dfw-oct&utm_content=template-b` |
| LinkedIn message | `https://certiflowapp.com/?utm_source=linkedin` |
| Follow-up after a phone call | `https://certiflowapp.com/?ref=call` |
| Attach or link the sample report | `https://certiflowapp.com/sample-gap-report.pdf` |
| Send the checklist as a helpful first touch | `https://certiflowapp.com/guides/subcontractor-coi-checklist?utm_source=email&utm_content=checklist` |
| Give a useful tool to an office manager | `https://certiflowapp.com/tools/broker-notice?utm_source=email&utm_content=notice-tool` |
| Follow-up for finance or owners worried about audits | `https://certiflowapp.com/guides/premium-audit-uninsured-subcontractors?utm_source=email&utm_content=premium-audit` |

**See requests in your browser:** set a password once with `npx wrangler secret put ADMIN_PASSWORD` (12+ characters), then open `https://certiflowapp.com/admin` and sign in with any username and that password. It lists the latest 500 requests, with their source and self-check answers, and has a CSV download. Until the secret is set, `/admin` is a normal 404.

From a terminal: `npm run leads`. To compare sources in the D1 console:

```sql
SELECT source, COUNT(*) AS requests FROM audit_requests GROUP BY source ORDER BY requests DESC;
```

**Email alerts for new requests (optional):** create a free [Resend](https://resend.com) account, then:

```sh
npx wrangler secret put RESEND_API_KEY   # the API key from Resend
npx wrangler secret put NOTIFY_EMAIL     # the address you signed up to Resend with
```

Each new request then arrives in your inbox, with reply-to set to the contractor. Once `certiflowapp.com` is verified in Resend, set `NOTIFY_FROM` (for example `CertiFlow <leads@certiflowapp.com>`) to send to any address.

---

## 📊 Unit Economics & Scalability

- **Average Revenue Per User (ARPU):** $99 / month (Commercial Growth Plan)
- **Document Processing Cost:** ~$1.20 / month (approx. 60 vision API calls @ $0.02)
- **Transactional Email Cost:** ~$0.08 / month (Postmark / Resend)
- **Gross Margin:** **~95%** ($94.72 gross margin per customer/month)
- **Churn Rate Benchmark:** <1.5% monthly (compliance records act as an essential legal repository)

---

## ⚖️ License & Intellectual Property

Copyright © 2026 CertiFlow Inc. All rights reserved.
Proprietary software architecture for commercial construction insurance compliance.