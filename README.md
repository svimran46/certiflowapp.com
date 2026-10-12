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

## 🚀 Live Demo & Features

The web platform in this repository (`index.html`) includes:

- **Security-paper design:** Intaglio blue, brass and engraved guilloché seals, set in Libre Caslon and Instrument Sans. Hand-written CSS with no framework or build step.
- **Interactive Auditor Sandbox:** Live scenario simulator demonstrating:
  - Scenario A: Fully Compliant HVAC Subcontractor (Audit badge issued).
  - Scenario B: Missing CG 20 37 Completed Operations Endorsement (Deficiency alert).
  - Scenario C: Lapsed Workers Compensation (Stop-work safety red flag).
- **Automated Broker Message Generator:** 1-click copyable deficiency notifications.
- **Free Audit Request Dialog:** Captures GC company name, contact, active subcontractor volume and plan of interest, then opens a pre-filled email to support@certiflowapp.com.
- **Transparent Tiered Pricing:** Starter ($49/mo), Commercial Growth ($99/mo), and Commercial Pro ($199/mo).

---

## 🌐 Instant Cloudflare Pages Deployment (Unlimited Free Tier)

Cloudflare Pages provides unlimited bandwidth, 500 builds/month, and enterprise-grade DDoS protection with zero build limits.

### 2-Minute Setup on Cloudflare Pages:
1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/) and navigate to **Workers & Pages**.
2. Click **Create Application** $\rightarrow$ **Pages** $\rightarrow$ **Connect to Git**.
3. Select your GitHub repository: `svimran46/certiflowapp.com`.
4. Configure Build Settings:
   - **Framework preset:** `None`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. Click **Save and Deploy**. Your site will build in 5 seconds and deploy live!
6. Under **Custom domains**, click **Set up a domain**, enter `certiflowapp.com`, and Cloudflare automatically provisions SSL and global DNS routing.

### Deploy to GitHub Pages:
1. Go to the repository **Settings $\rightarrow$ Pages**.
2. Under **Build and deployment**, select `Deploy from a branch` $\rightarrow$ `main` $\rightarrow$ `/ (root)`.
3. Under **Custom domain**, enter `certiflowapp.com` and click Save.
4. Check **Enforce HTTPS**.

---

## 📁 Repository Structure

```
certiflowapp.com/
├── index.html                  # Production landing page & interactive audit portal
├── favicon.svg                 # Site icon
├── og-image.png                # Social share preview (1200×630)
├── README.md                   # Platform documentation & deployment guide
├── docs/
│   ├── initial-prospect-list.csv   # 18 verified commercial GCs for initial outreach
│   ├── day-1-action-guide.md       # Cold outreach scripts, phone pitch, & audit prompts
│   └── final-recommendation.md     # Market teardown, unit economics, & validation roadmap
```

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