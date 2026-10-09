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

The site is a static page in `public/` served by a Cloudflare Worker with static assets (`wrangler.jsonc`). One small script, `src/worker.js`, handles the free-audit form at `POST /api/audit` and stores requests in the D1 database `certiflow-leads`.

```
public/            static site (index.html, styles.css, app.js, fonts, _headers, privacy, 404)
src/worker.js      audit-request API -> D1
migrations/        D1 schema
scripts/check.mjs  pre-deploy link check (npm run build)
docs/              strategy notes (see AUDIT.md: move these out of a public repo)
```

| Command | What it does |
|---|---|
| `npm run dev` | Local server at http://localhost:8787 (run `npx wrangler d1 migrations apply certiflow-leads --local` once first) |
| `npm run build` | Checks that every local link and asset exists |
| `npm run deploy` | Deploys to the `certiflowapp-com` Worker |
| `npm run leads` | Lists the latest audit requests from D1 |

Workers Builds (Git integration) deploys `main` automatically with `npx wrangler deploy`. See `AUDIT.md` for the October 2026 site audit and open items.

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