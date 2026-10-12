# CertiFlow: project state and handoff notes

Read this before changing anything. It describes the site as it is on `main` and the rules that keep it working. Keep it up to date when you change how the site works.

Last updated: 12 October 2026.

---

## 1. Rules for anyone (person or AI) working on this repo

1. **Deploy only from GitHub.** Cloudflare Workers Builds deploys `main` automatically. Never run `npm run deploy` or `wrangler deploy` from a local copy: an out-of-date folder overwrites the live site. This happened on 12 October, when a manual deploy put a removed checkout back live.
2. **Pull before you start.** Run `git pull origin main` first. Several tools have worked on this repo, and an old local copy will reintroduce removed code.
3. **Change things through pull requests**, not direct pushes to `main`. CI (`.github/workflows/ci.yml`) runs the build, the tests and a `wrangler deploy --dry-run` on every PR.
4. **Never commit secrets, or parts of them**, to this repo. It is public. Secret names are fine; values and prefixes are not.
5. **Keep the Content Security Policy** in `public/_headers`. That means no inline `<style>`, no inline `<script>`, no `style=""` attributes, and no third-party scripts, styles or fonts. Put CSS in `public/styles.css`, JS in `public/*.js`, and fonts in `public/fonts/`.
6. **No free service.** The only way to get certificates reviewed is a 14-day trial that needs a Google account and a card on file. Free guides, the self-check and the broker-notice tool are lead magnets, not the service.
7. Before opening a PR, run `npm run build`, `npm test` and `npx wrangler deploy --dry-run`.

---

## 2. What the product is

CertiFlow checks subcontractors' certificates of insurance (ACORD 25) **and the endorsement pages behind them** (CG 20 10, CG 20 37, CG 24 04, WC 00 03 13) for commercial general contractors with 25–100 subs. It reports what's missing and drafts the notice to each sub's broker.

While the portal is being built, the team does the checks and follow-ups by hand for paying customers. The pricing section says so.

| Plan | Active subs | Price |
|---|---|---|
| Starter | up to 25 | USD 49 / month |
| Growth | up to 75 | USD 99 / month |
| Pro | up to 200 | USD 199 / month |

Every plan starts with a **14-day free trial. A card is required, and nothing is charged until the trial ends.**

---

## 3. How a customer signs up

1. On the homepage (`#request` or the pricing rows) or on `/signup`, they choose a plan and click **Continue with Google**.
2. `/auth/google` sends them to Google with `state` and PKCE. `/auth/google/callback` checks the ID token, then creates or updates the user and starts a session.
3. They go straight on to **Stripe Checkout** in subscription mode:
   - 14-day trial
   - card always collected
   - if there's no card at the trial's end, the subscription is cancelled rather than billed
   - one trial per account
4. Stripe sends them back to `/account?checkout=success`. The webhook confirms the subscription, and the account page shows the trial end date and the first charge.
5. On `/account` they can open **Manage billing** (Stripe's portal: card, plan, invoices, cancel). While a trial or paid plan is running, they also see the onboarding form and the instructions to email 5–10 certificates to support@certiflowapp.com.

You can see sign-ups, trials and onboarding forms at `/admin`. It's protected by HTTP Basic auth with `ADMIN_PASSWORD`, and shows a 404 until that secret is set.

---

## 4. Architecture

Cloudflare Worker `certiflowapp-com` with static assets. Configuration is in `wrangler.jsonc`.

- `public/` holds the source of the static site. `npm run build` (`scripts/build.mjs`) checks every local link and copies it to `dist/`, which isn't committed.
- `src/` is the Worker. It handles only the routes below; everything else is served from `dist/`.
- The D1 database `certiflow-leads` (binding `LEADS_DB`) holds leads, accounts, sessions and Stripe event IDs.

| Route | File | Purpose |
|---|---|---|
| `GET /auth/google` | `src/accounts.js` | Start Google sign-in (`?plan=starter\|growth\|pro`) |
| `GET /auth/google/callback` | `src/accounts.js` | Finish sign-in, create session, continue to Stripe |
| `POST /auth/logout` | `src/accounts.js` | Sign out |
| `GET /api/me` | `src/accounts.js` | Account and plan state for `/account` and `/signup` |
| `POST /api/checkout` | `src/billing.js` | Stripe Checkout session for the signed-in user |
| `POST /api/billing-portal` | `src/billing.js` | Stripe billing portal session |
| `POST /api/stripe/webhook` | `src/billing.js` | Signed Stripe events, which update the user's plan |
| `POST /api/audit` | `src/worker.js` | Onboarding / company-details form, stored in `audit_requests` |
| `GET /admin`, `/admin/leads.csv` | `src/worker.js` | Founder's view of requests and sign-ups |

`src/http.js` holds shared helpers: JSON responses, cookies, hashing.

**Sessions:** the cookie is `__Host-cf_session` (HttpOnly, Secure, SameSite=Lax, 30 days). Only a SHA-256 hash of the token is stored in `sessions`.

**Stripe prices** are created automatically the first time each plan is chosen, in **USD**, with lookup keys `certiflow_starter_monthly_v1`, `certiflow_growth_monthly_v1` and `certiflow_pro_monthly_v1`. The Stripe account is Malaysian; Stripe converts USD payments to MYR on payout. The MYR prices created by hand in the dashboard are not used and can be archived.

**Webhook:** it verifies `Stripe-Signature` and re-reads each subscription from Stripe. It ignores repeated events (`stripe_events`) and never lets an event about an old subscription overwrite a live one.

### Pages

- `/`: homepage
- `/signup`: plan picker and Google button
- `/account`: trial and billing status, onboarding
- `/guides/subcontractor-coi-checklist`, `/guides/premium-audit-uninsured-subcontractors`: guides
- `/tools/broker-notice`: broker-notice tool
- `/sample-gap-report` (and `.pdf`): sample report
- `/privacy`, plus a 404 page

### Database migrations (`migrations/`)

| File | Tables | Status |
|---|---|---|
| `0001_audit_requests.sql` | `audit_requests` | applied |
| `0002_lead_source.sql` | adds `source`, `self_check` | applied |
| `0003_accounts.sql` | `users`, `sessions`, `stripe_events` | applied |
| `0003_magic_links.sql` | `magic_links` | applied, **unused** (left from a removed email sign-in; keep the file because it is recorded as applied) |

New migrations should start at `0004_`. Apply them with `npm run db:migrate`.

---

## 5. Configuration

### Cloudflare Worker secrets
Set them in Workers & Pages → certiflowapp-com → Settings → Variables and Secrets, as type **Secret**. Names only, never values:

| Secret | Needed for |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in. Without them, sign-up says "opens shortly". |
| `STRIPE_SECRET_KEY` | Checkout and billing portal (`sk_test_…` while testing, `sk_live_…` for real payments) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature check (`whsec_…`). Without it, trials never appear on `/account`. |
| `ADMIN_PASSWORD` | `/admin` (12+ characters) |
| `RESEND_API_KEY`, `NOTIFY_EMAIL`, `NOTIFY_FROM` (optional) | Email alert for each onboarding form |

For local development, put the same names in `.dev.vars`, which is git-ignored.

### Google Cloud (OAuth client, type Web application)
Authorized redirect URIs:
- `https://certiflowapp.com/auth/google/callback`
- `https://certiflowapp-com.svimranmy.workers.dev/auth/google/callback`

No JavaScript origins are needed.

### Stripe
- Webhook endpoint `https://certiflowapp.com/api/stripe/webhook` with events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`.
- Customer portal settings saved once (Settings → Billing → Customer portal).
- Statement descriptor `CERTIFLOWAPP.COM`, shortened `CERTIFLOW`.
- Test with card `4242 4242 4242 4242`. When going live, recreate the webhook in live mode and swap both Stripe secrets.

### Cloudflare Workers Builds
Production environment, branch `main`:
- **Disable builds** must be **off**
- build command `npm run build`
- deploy command `npx wrangler deploy`
- root directory empty

Turn on **Disable builds** in the separate *Preview* environment: its preview builds always fail a Worker-identity check and aren't needed.

---

## 6. Open items

- [ ] **Production builds from GitHub stopped after 09:02 UTC on 12 October.** The live site is a manual deploy from 10:31 UTC, and PRs #3 and #4 aren't live until Cloudflare builds `main` again. See section 5.
- [ ] Confirm all the secrets in section 5 exist in Cloudflare (as of 12 October the Google keys may only have been in a local `.dev.vars`).
- [ ] Run the end-to-end test: Start free trial → Google → card `4242…` → `/account` shows the trial → the customer shows as Trialing in Stripe → the user appears on `/admin`.
- [ ] Archive the unused MYR prices in Stripe.
- [ ] The repo is public, and `docs/` contains prospects' personal contact details. Make the repo private or move `docs/` out.
- [ ] Set up email routing so support@certiflowapp.com receives mail.
- [ ] Possible next feature: "Email me a sign-in link" next to Google, for contractors on Microsoft 365. It must create the same `users`/`sessions` records and go through the same trial; don't build a separate flow.

---

## 7. History

| PR / commit | What changed |
|---|---|
| #1 | Site audit, honest copy, lead capture in D1, guides, tools, strict CSP, `public/` → `dist/` build |
| #2 | Premium "security paper" design: intaglio blue, brass, Caslon, guilloché seal |
| merge into #1 | Combined #1's content and features with #2's design |
| #3 | Google sign-up, Stripe subscriptions with a 14-day trial, `/signup`, `/account`, webhook, accounts on `/admin` |
| d844642 (pushed straight to `main` from another tool) | A separate immediate-charge checkout and email login, deployed manually |
| #4 | Removed d844642's checkout and email login. One sign-up path remains. |
| this file | Rewritten to match the code; removed key fragments that an earlier version contained |
| `run_worker_first` | `/auth/*`, `/api/*` and `/admin` were answered by the 404 page on GET, so Google sign-in never started. `wrangler.jsonc` now sends those paths to the Worker first. Keep this list in step with the Worker's routes. |
