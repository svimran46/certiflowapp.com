// API routes: audit requests, accounts (Sign in with Google), Stripe billing and the founder's
// leads page. Everything else is served from ./public by Workers static assets before this runs.

import { json, clean } from "./http.js";
import { startGoogleSignIn, finishGoogleSignIn, currentUser, signOut, describeMe } from "./accounts.js";
import { handleCheckout, handleBillingPortal, handleStripeWebhook } from "./billing.js";

const SUB_RANGES = new Set(["under-25", "25-50", "50-100", "100+"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_PER_IP_PER_HOUR = 5;
const MAX_BODY_BYTES = 20000;

// Optional heads-up email for each new request. Needs two Worker secrets:
//   RESEND_API_KEY  - an API key from resend.com
//   NOTIFY_EMAIL    - where to send it (with Resend's default sender this must be
//                     the address your Resend account is registered with)
// NOTIFY_FROM can override the sender once certiflowapp.com is verified in Resend.
async function notifyNewLead(env, lead) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL) return;
  const lines = [
    "New free-audit request",
    "",
    "Company: " + lead.company,
    "Name: " + lead.name,
    "Email: " + lead.email,
    "Phone: " + (lead.phone || "-"),
    "Active subs: " + lead.subs,
    "Self-check: " + (lead.selfCheck || "-"),
    "Source: " + (lead.source || "-"),
    "",
    lead.notes || "(no notes)"
  ];
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.NOTIFY_FROM || "CertiFlow leads <onboarding@resend.dev>",
      to: [env.NOTIFY_EMAIL],
      reply_to: lead.email,
      subject: "Audit request: " + lead.company + " (" + lead.subs + " subs)",
      text: lines.join("\n")
    })
  });
  if (!res.ok) console.error("lead notification failed", res.status, await res.text());
}

async function handleAuditRequest(request, env, ctx) {
  if (request.method !== "POST") return json(405, { error: "Use POST." });

  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return json(403, { error: "Cross-origin requests are not accepted." });
  }

  if (!(request.headers.get("Content-Type") || "").includes("application/json")) {
    return json(415, { error: "Send the form as JSON." });
  }
  if (Number(request.headers.get("Content-Length") || 0) > MAX_BODY_BYTES) {
    return json(413, { error: "The request is too large." });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "The request is too large." });

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "Send the form as JSON." });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json(400, { error: "Send the form as a JSON object." });
  }

  // Honeypot: real visitors never see this field.
  if (clean(body.website, 200)) return json(200, { ok: true });

  const lead = {
    company: clean(body.company, 120),
    name: clean(body.name, 120),
    email: clean(body.email, 200).toLowerCase(),
    phone: clean(body.phone, 40),
    subs: SUB_RANGES.has(body.subs) ? body.subs : "unknown",
    notes: clean(body.notes, 2000),
    source: clean(body.source, 500),
    selfCheck: clean(body.selfCheck, 500)
  };
  if (!lead.company || !lead.name || !EMAIL_RE.test(lead.email)) {
    return json(422, { error: "Company, name and a valid work email are required." });
  }

  if (!env.LEADS_DB) {
    console.error("LEADS_DB binding missing; lead not stored", JSON.stringify(lead));
    return json(503, { error: "Requests can't be stored right now." });
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const recent = await env.LEADS_DB
    .prepare("SELECT COUNT(*) AS n FROM audit_requests WHERE ip = ?1 AND created_at > datetime('now', '-1 hour')")
    .bind(ip)
    .first();
  if (recent && recent.n >= MAX_PER_IP_PER_HOUR) {
    return json(429, { error: "Too many requests. Try again later or email support@certiflowapp.com." });
  }

  await env.LEADS_DB
    .prepare(
      "INSERT INTO audit_requests (company, name, email, phone, subs, notes, ip, country, user_agent, source, self_check) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"
    )
    .bind(
      lead.company, lead.name, lead.email, lead.phone, lead.subs, lead.notes,
      ip, (request.cf && request.cf.country) || "", clean(request.headers.get("User-Agent"), 300),
      lead.source, lead.selfCheck
    )
    .run();

  console.log("audit request stored", lead.company, lead.subs);
  ctx.waitUntil(notifyNewLead(env, lead).catch((err) => console.error("lead notification failed", err && err.stack)));
  return json(201, { ok: true });
}

// ---------- Leads page for the founder ----------
// GET /admin shows recent audit requests; GET /admin/leads.csv downloads them.
// Off (404) unless the ADMIN_PASSWORD secret is set to 12+ characters:
//   npx wrangler secret put ADMIN_PASSWORD
// Sign in with any username and that password.

const ADMIN_HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
};

async function sameSecret(a, b) {
  // Compare SHA-256 digests in constant time so response timing doesn't leak the password.
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b))
  ]);
  const xa = new Uint8Array(x), ya = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ ya[i];
  return diff === 0;
}

async function isAdmin(request, env) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Basic ")) return false;
  let decoded = "";
  try { decoded = atob(header.slice(6)); } catch { return false; }
  const password = decoded.slice(decoded.indexOf(":") + 1);
  return sameSecret(password, env.ADMIN_PASSWORD);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function csvCell(value) {
  let v = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; // stop spreadsheets treating input as a formula
  return '"' + v.replace(/"/g, '""') + '"';
}

const LEAD_COLUMNS = ["created_at", "company", "name", "email", "phone", "subs", "self_check", "source", "notes", "country", "status"];

async function handleAdmin(request, env, url) {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12 || !env.LEADS_DB) {
    return env.ASSETS.fetch(request); // no asset at this path, so this is the normal 404 page
  }
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: ADMIN_HEADERS });
  if (!(await isAdmin(request, env))) {
    return new Response("Sign in to see audit requests.", {
      status: 401,
      headers: { ...ADMIN_HEADERS, "WWW-Authenticate": 'Basic realm="CertiFlow leads", charset="UTF-8"' }
    });
  }

  const { results = [] } = await env.LEADS_DB
    .prepare("SELECT " + LEAD_COLUMNS.join(", ") + " FROM audit_requests ORDER BY id DESC LIMIT 500")
    .all();

  if (url.pathname === "/admin/leads.csv") {
    const csv = [LEAD_COLUMNS.join(",")]
      .concat(results.map((r) => LEAD_COLUMNS.map((c) => csvCell(r[c])).join(",")))
      .join("\r\n");
    return new Response(csv, {
      headers: { ...ADMIN_HEADERS, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="certiflow-leads.csv"' }
    });
  }

  const rows = results.map((r) => `<tr>
      <td>${escapeHtml(r.created_at)} UTC</td>
      <td><strong>${escapeHtml(r.company)}</strong><br>${escapeHtml(r.name)}</td>
      <td><a href="mailto:${escapeHtml(r.email)}">${escapeHtml(r.email)}</a><br>${escapeHtml(r.phone)}</td>
      <td>${escapeHtml(r.subs)}</td>
      <td>${escapeHtml(r.self_check)}</td>
      <td>${escapeHtml(r.source)}</td>
      <td class="notes">${escapeHtml(r.notes)}</td>
    </tr>`).join("");

  // Sign-ups and trials. Missing until migration 0003 is applied, so a failure here only hides the table.
  let accounts = [];
  try {
    accounts = (await env.LEADS_DB.prepare(
      "SELECT created_at, email, name, plan, subscription_status, trial_end, current_period_end, cancel_at_period_end " +
      "FROM users ORDER BY id DESC LIMIT 500"
    ).all()).results || [];
  } catch {}
  const accountRows = accounts.map((u) => `<tr>
      <td>${escapeHtml(u.created_at)} UTC</td>
      <td><strong>${escapeHtml(u.name)}</strong><br><a href="mailto:${escapeHtml(u.email)}">${escapeHtml(u.email)}</a></td>
      <td>${escapeHtml(u.plan || "-")}</td>
      <td>${escapeHtml(u.subscription_status || "no card yet")}${u.cancel_at_period_end ? " (cancelling)" : ""}</td>
      <td>${escapeHtml(u.trial_end ? u.trial_end.slice(0, 10) : "-")}</td>
      <td>${escapeHtml(u.current_period_end ? u.current_period_end.slice(0, 10) : "-")}</td>
    </tr>`).join("");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Audit requests · CertiFlow</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; margin: 24px; color: #171a21; background: #eef1f6; }
  h1 { font-size: 22px; margin: 0 0 4px; } p { margin: 0 0 16px; color: #4a5161; }
  a { color: #1f3c88; }
  .wrap { overflow-x: auto; background: #fff; border: 1px solid #c5cee0; }
  table { border-collapse: collapse; width: 100%; min-width: 900px; }
  th, td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid #dde3ee; }
  th { font-size: 13px; color: #4a5161; background: #f8f9fc; }
  .notes { max-width: 320px; white-space: pre-wrap; }
</style></head><body>
<h1>Audit requests</h1>
<p>${results.length} most recent, newest first. <a href="/admin/leads.csv">Download CSV</a></p>
<div class="wrap"><table>
<thead><tr><th>Received</th><th>Company</th><th>Contact</th><th>Subs</th><th>Self-check</th><th>Source</th><th>Notes</th></tr></thead>
<tbody>${rows || '<tr><td colspan="7">No requests yet.</td></tr>'}</tbody>
</table></div>
<h1 style="margin-top:32px">Accounts and trials</h1>
<p>${accounts.length} most recent sign-ups. Payment details live in Stripe.</p>
<div class="wrap"><table>
<thead><tr><th>Signed up</th><th>Account</th><th>Plan</th><th>Status</th><th>Trial ends</th><th>Current period ends</th></tr></thead>
<tbody>${accountRows || '<tr><td colspan="6">No sign-ups yet.</td></tr>'}</tbody>
</table></div></body></html>`;
  return new Response(html, { headers: { ...ADMIN_HEADERS, "Content-Type": "text/html; charset=utf-8" } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/audit") {
      try {
        return await handleAuditRequest(request, env, ctx);
      } catch (err) {
        console.error("audit request failed", err && err.stack);
        return json(500, { error: "Something went wrong storing the request." });
      }
    }
    if (url.pathname === "/admin" || url.pathname === "/admin/leads.csv") {
      try {
        return await handleAdmin(request, env, url);
      } catch (err) {
        console.error("admin page failed", err && err.stack);
        return new Response("Couldn't load audit requests.", { status: 500, headers: ADMIN_HEADERS });
      }
    }
    const routes = {
      "/auth/google": () => startGoogleSignIn(request, env),
      "/auth/google/callback": () => finishGoogleSignIn(request, env),
      "/auth/logout": () => signOut(request, env),
      "/api/me": async () => describeMe(request, env, await currentUser(request, env)),
      "/api/checkout": async () => handleCheckout(request, env, await currentUser(request, env)),
      "/api/billing-portal": async () => handleBillingPortal(request, env, await currentUser(request, env)),
      "/api/stripe/webhook": () => handleStripeWebhook(request, env)
    };
    if (Object.prototype.hasOwnProperty.call(routes, url.pathname)) {
      try {
        return await routes[url.pathname]();
      } catch (err) {
        console.error(url.pathname + " failed", err && err.stack);
        return json(500, { error: "Something went wrong. Please try again, or email support@certiflowapp.com." });
      }
    }
    // Anything else that isn't a static file gets the 404 page (not_found_handling in wrangler.jsonc).
    return env.ASSETS.fetch(request);
  }
};
