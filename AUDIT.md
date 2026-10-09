# CertiFlow site audit (October 2026)

## What the site is for

CertiFlow is at the **pre-validation stage** (see `docs/final-recommendation.md`). The product (magic-link uploads, vision extraction, broker follow-up) isn't built yet. The site has one job: get commercial GCs with 25–100 subs to **request a free 24-hour COI gap audit**. That audit is the concierge MVP that leads to founding-pilot deposits and LOIs (the go/kill gate on day 14).

Everything below is judged against that goal.

## Findings

### Critical

| # | Issue | Impact | Status |
|---|---|---|---|
| 1 | The audit form never sent anything. `handleAuditSubmit` showed a success message and an `alert()`, and nothing was stored. | Every lead from the site was lost, and visitors were told it had worked. | **Fixed.** `src/worker.js` handles `POST /api/audit` and stores requests in the D1 database `certiflow-leads`, with validation, a honeypot and per-IP rate limiting. If saving fails, the page offers a pre-filled email instead. |
| 2 | The repo is **public** and `docs/initial-prospect-list.csv` contains named people's work emails and phone numbers. `docs/day-1-action-guide.md` contains the outreach playbook (including "Do NOT say I am an AI developer") and names those same prospects. | Privacy exposure for third parties. A prospect who searches the company name finds the playbook. | **Not changed. Owner decision.** Make the repo private, or move `docs/` to a private repo. Deleting the files won't remove them from git history. |
| 3 | The demo used a **real prospect** ("Novel Builders LLC") as the GC, in a form placeholder too, and broker names resembling real firms (Wortham, Gallagher). | Looks like a real client's data on a public page. Possible misrepresentation. | **Fixed.** All sample data is fictional and labeled as such, with `.example` email domains. |
| 4 | `certiflowapp.com` didn't resolve from the audit environment (`ENOTFOUND` from two different fetchers). The Worker `certiflowapp-com` exists in Cloudflare. | If the custom domain isn't attached, nobody can reach the site. | **Verify** in Cloudflare → Workers & Pages → certiflowapp-com → Settings → Domains & Routes. The audit environment couldn't resolve outside DNS, so it couldn't be confirmed either way. |

### High: claims and trust

- **Unsupportable claims** were removed: "100% extraction accuracy" (your own docs plan human review for anything under 95% confidence), "$0 audit penalties", "Most popular" (no customers yet), and "© CertiFlow Inc." (use the legal name once one is registered).
- **"Start 14-day free trial"** buttons opened the audit form, for a product that doesn't exist yet. They're replaced with honest "planned launch pricing" and the free-audit CTA.
- **"Enterprise Software Extortion"** named myCOI and Procore alongside price claims. This is a legal and credibility risk, so the text now describes the category without naming competitors.
- **Insurance accuracy:**
  - Workers' comp is statutory. The $1M figure is the employers' liability limit, so it's now labeled that way.
  - The WC waiver of subrogation is WC 00 03 13, not CG 24 04.
  - "Box 1 expiration date" was wrong: the producer is top-left and expirations are in the coverage grid.
- **No disclaimer** existed. Added: "not an insurance agency, not legal advice".
- **No privacy notice** existed even though the site collects contact details. Added `/privacy`. *Review it: it commits you to deleting data on request and to not sharing documents.*

### High: technical

- **Tailwind Play CDN in production.** It loads ~300 KB of JS that compiles CSS in the browser, shows a console warning, and causes a flash of unstyled content. Font Awesome loaded another ~100 KB. Both are replaced with ~16 KB of hand-written CSS and inline SVG.
- **`og-image.png` was a 404**, so every LinkedIn or email share had no preview image. Now added.
- **No favicon, robots.txt, sitemap, canonical URL, structured data or 404 page.** All added.
- **Three copies of `index.html`** (root, `dist/`, `public/`) and two copies of `_headers` could drift apart. There's now one source: `public/`.
- **No deploy config in the repo.** The Worker was configured only in the dashboard. Added `wrangler.jsonc` with the Worker name `certiflowapp-com`, so Workers Builds keeps deploying to the same Worker.
- **Headers:**
  - Added a strict Content-Security-Policy (no third-party scripts, styles or fonts remain).
  - Replaced `X-Frame-Options` with `frame-ancestors 'none'`.
  - Removed HSTS `preload`, which is a one-way commitment to submit to the preload list. Add it back on purpose if you want it.
- `CNAME` was a GitHub Pages leftover (the repo has Pages disabled). Removed.

### Medium: accessibility and UX

- The modal had no Escape key, focus trap or dialog role, and the close button had no label. Replaced with an inline form, so there's no modal at all.
- The scenario buttons weren't keyboard tabs. They're now a WAI-ARIA tablist with arrow-key navigation.
- The PDF upload box was decorative: its hidden `<input>` was never wired up. Removed. Files are sent after we reply, which also avoids storing unsolicited PDFs.
- 12 px body copy in pricing and slate-on-navy text failed contrast checks. Body text is now 17 px, and all text meets WCAG AA.
- The clipboard copy had no error handling. It now falls back to selecting the text.
- The banner link `href="#audit-modal-trigger"` pointed at an anchor that didn't exist. Removed.

## Redesign rationale

The old page was a generic dark SaaS template (navy, emerald glow, identical rounded cards). It didn't look like anything from a GC office manager's world. The new design is built around the object the buyer actually handles:

- **The hero is a reviewed ACORD 25.** It has the coverage grid, endorsement pages, a highlighter mark on the failing row, an inspection stamp, and the drafted broker notice. Three tabs switch between compliant, missing CG 20 37, and lapsed workers' comp. The demo *is* the pitch.
- **Palette:**
  - Cool office paper `#eef1f6` for the page background
  - Carbon-form blue `#1f3c88` for rules, links and buttons
  - Reviewer's highlighter `#ffe14d`, used only to mark findings
  - Pass, warn and fail colors for status
- **Type:** Archivo, condensed and heavy, for headings, like site signage. Public Sans, a plain US-government sans, for body text. Both are self-hosted.
- **Structure:**
  - Spreadsheet row vs. endorsement pages (the core argument)
  - The six checks
  - The three-step free audit (a real sequence, so the numbers are earned)
  - The roadmap, clearly marked as in development
  - Pricing as a table
  - FAQ
  - The inline request form

## Added after the audit

| Addition | Why it helps the goal |
|---|---|
| **Live review animation** on the hero certificate | Shows the product working in the first two seconds, instead of describing it. |
| **Certificate self-check** (six questions, live result) | Lets a skeptical visitor test one of their own certificates. Most "no" or "not sure" answers point straight at the audit. Their answers are saved with their request. |
| **Sample gap report**, on the page and as a one-page PDF | Shows exactly what they get. The PDF can be forwarded to a boss or attached to cold emails. |
| **Subcontractor COI checklist guide** (`/guides/subcontractor-coi-checklist`) | Shows you know the subject, is useful enough to share, and can rank for COI and endorsement searches. |
| **Reasons to trust you beside the form**, and a **next-steps confirmation** after sending | Answers "is this safe and what happens next?" at the moment of decision. |
| **FAQ on brokers and Procore** | Answers the objection your strategy doc lists as the main risk. |
| **Lead source tracking**, plus **optional email alerts** (Resend) | Shows which outreach produces audits, so you can run the day-14 go/kill check on real numbers. |
| **Phone sticky button**, smoother transitions, scroll-aware header | Keeps the next step one tap away on phones without covering content. |

Quality checks:
- **Lighthouse:** 100 for performance, accessibility, best practices and SEO, on both mobile and desktop.
- **axe accessibility scan:** no violations on any page.
- **Speed:** largest contentful paint is 1.7 s on simulated mobile.

## Leads: where they go

- **See requests:** `npm run leads`, or Cloudflare → D1 → `certiflow-leads` → Console:
  `SELECT * FROM audit_requests ORDER BY id DESC;`
- **Next step (recommended):** turn on email alerts by setting the `RESEND_API_KEY` and `NOTIFY_EMAIL` Worker secrets (steps in the README). Without them you have to check D1 yourself.
- **`support@certiflowapp.com`** is used across the site. Make sure it actually receives mail (for example, Cloudflare Email Routing to your inbox).

## Still open

1. Make the repo private, or move `docs/` out of it (finding 2).
2. Confirm the custom domain is attached and DNS resolves (finding 4).
3. Set up email routing for `support@`, and set the Resend secrets for new-lead alerts.
4. Add a real founder name, photo and LinkedIn link to the page. That's the biggest trust signal still missing, and only you can supply it.
5. Read `/privacy` and the FAQ answers and make sure you can honor them.
6. After the merge, check the first Workers Builds deploy uses the new `wrangler.jsonc`:
   - The build command, if set, should be `npm run build`.
   - The deploy command should be `npx wrangler deploy`.
