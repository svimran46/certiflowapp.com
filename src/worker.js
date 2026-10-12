// Handles the free-audit request form. Everything else is served from ./public
// by Workers static assets before this script runs.

import Stripe from "stripe";

const SUB_RANGES = new Set(["under-25", "25-50", "50-100", "100+"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_PER_IP_PER_HOUR = 5;
const MAX_BODY_BYTES = 20000;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

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
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/certiflow_session=([^;]+)/);
  if (match && env.LEADS_DB) {
    try {
      const token = match[1].trim();
      const row = await env.LEADS_DB.prepare(
        "SELECT email FROM magic_links WHERE token = ? AND used_at IS NOT NULL"
      ).bind(token).first();
      if (row && (row.email === env.NOTIFY_EMAIL || row.email === env.ADMIN_EMAIL || row.email === "support.certiflowapp@gmail.com" || row.email === "svimranmy@gmail.com")) {
        return true;
      }
    } catch {}
  }

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
</table></div></body></html>`;
  return new Response(html, { headers: { ...ADMIN_HEADERS, "Content-Type": "text/html; charset=utf-8" } });
}

const PLAN_PRICES = {
  starter: "price_1UPfmOFaQ2FHfDqc2LthKXdt",
  growth: "price_1UPfnkFaQ2FHfDqcH97iYzH4",
  pro: "price_1UPfooFaQ2FHfDqcsjSMYUKa"
};

async function handleCreateCheckoutSession(request, env) {
  if (request.method !== "POST") return json(405, { error: "Use POST." });

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  let price = PLAN_PRICES.starter;
  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    try {
      const body = await request.json();
      if (body?.price) price = body.price;
      else if (body?.plan && PLAN_PRICES[String(body.plan).toLowerCase()]) {
        price = PLAN_PRICES[String(body.plan).toLowerCase()];
      }
    } catch {}
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    try {
      const formData = await request.formData();
      const p = formData.get("plan");
      const pr = formData.get("price");
      if (pr) price = String(pr);
      else if (p && PLAN_PRICES[String(p).toLowerCase()]) {
        price = PLAN_PRICES[String(p).toLowerCase()];
      }
    } catch {}
  }

  const origin = request.headers.get("Origin") || new URL(request.url).origin;
  const mode = "subscription";

  const sessionParams = {
    ui_mode: "hosted_page",
    mode,
    billing_address_collection: "auto",
    phone_number_collection: {
      enabled: false
    },
    automatic_tax: {
      enabled: false
    },
    allow_promotion_codes: false,
    payment_method_collection: "always",
    submit_type: "auto",
    integration_identifier: "hosted_mobile_app_0001",
    origin_context: "mobile_app",
    success_url: `${origin}/?session_id={CHECKOUT_SESSION_ID}#pricing`,
    cancel_url: `${origin}/#pricing`,
    line_items: [
      {
        price,
        quantity: 1
      }
    ]
  };

  const session = await stripe.checkout.sessions.create(sessionParams);

  if (request.headers.get("Accept")?.includes("application/json")) {
    return json(200, { url: session.url, sessionId: session.id });
  }
  return Response.redirect(session.url, 303);
}

async function handleMagicLinkRequest(request, env) {
  if (request.method !== "POST") return json(405, { error: "Use POST." });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Send JSON body." });
  }

  const email = clean(body?.email, 200).toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return json(422, { error: "Valid email address is required." });
  }

  if (!env.LEADS_DB) {
    return json(503, { error: "Service temporarily unavailable." });
  }

  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await env.LEADS_DB.prepare(
    "INSERT INTO magic_links (token, email, expires_at) VALUES (?, ?, ?)"
  ).bind(token, email, expiresAt).run();

  const origin = request.headers.get("Origin") || new URL(request.url).origin;
  const magicUrl = `${origin}/api/auth/verify?token=${encodeURIComponent(token)}`;

  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.NOTIFY_FROM || "CertiFlow <onboarding@resend.dev>",
        to: [email],
        subject: "Your CertiFlow sign-in link",
        text: [
          "Hello,",
          "",
          "Click the link below to sign in to CertiFlow:",
          "",
          magicUrl,
          "",
          "This link expires in 15 minutes and can only be used once.",
          "",
          "If you did not request this link, you can safely ignore this email.",
          "",
          "— CertiFlow"
        ].join("\n")
      })
    });
    if (!res.ok) console.error("Resend magic link email failed", res.status, await res.text());
  } else {
    console.log("[DEV] Magic link for " + email + ": " + magicUrl);
  }

  return json(200, { ok: true, message: "Sign-in link sent." });
}

async function handleMagicLinkVerify(request, env, url) {
  const token = url.searchParams.get("token");
  if (!token || !env.LEADS_DB) {
    return new Response("Invalid request.", { status: 400 });
  }

  const record = await env.LEADS_DB.prepare(
    "SELECT token, email, expires_at, used_at FROM magic_links WHERE token = ?"
  ).bind(token).first();

  if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
    return new Response(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Link Expired · CertiFlow</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:40px;background:#eef1f6;color:#171a21}a{color:#1f3c88}.box{background:#fff;padding:36px;max-width:440px;margin:40px auto;border:1px solid #c5cee0;border-radius:6px;text-align:center}</style></head><body><div class="box"><h2>Link expired or invalid</h2><p>This sign-in link is no longer valid. Links expire in 15 minutes and can only be used once.</p><p><a href="/login.html">Request a new sign-in link &rarr;</a></p></div></body></html>`,
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  await env.LEADS_DB.prepare(
    "UPDATE magic_links SET used_at = datetime('now') WHERE token = ?"
  ).bind(token).run();

  const isAdminEmail = record.email === env.NOTIFY_EMAIL || record.email === env.ADMIN_EMAIL || record.email === "support.certiflowapp@gmail.com" || record.email === "svimranmy@gmail.com";
  const target = isAdminEmail ? `${url.origin}/admin` : `${url.origin}/?signed_in=1#pricing`;

  const headers = new Headers();
  headers.set("Location", target);
  headers.set("Set-Cookie", `certiflow_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);
  return new Response(null, { status: 302, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/auth/magic-link") {
      try {
        return await handleMagicLinkRequest(request, env);
      } catch (err) {
        console.error("magic link request failed", err && err.stack);
        return json(500, { error: "Failed to process sign-in link." });
      }
    }
    if (url.pathname === "/api/auth/verify") {
      try {
        return await handleMagicLinkVerify(request, env, url);
      } catch (err) {
        console.error("magic link verify failed", err && err.stack);
        return new Response("Failed to verify sign-in link.", { status: 500 });
      }
    }
    if (url.pathname === "/api/create-checkout-session") {
      try {
        return await handleCreateCheckoutSession(request, env);
      } catch (err) {
        console.error("checkout session creation failed", err && err.stack);
        return json(500, { error: "Failed to create checkout session." });
      }
    }
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
    // Anything else that isn't a static file gets the 404 page (not_found_handling in wrangler.jsonc).
    return env.ASSETS.fetch(request);
  }
};

