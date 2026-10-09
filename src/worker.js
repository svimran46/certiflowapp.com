// Handles the free-audit request form. Everything else is served from ./public
// by Workers static assets before this script runs.

const SUB_RANGES = new Set(["under-25", "25-50", "50-100", "100+"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_PER_IP_PER_HOUR = 5;

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

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Send the form as JSON." });
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
    // Anything else that isn't a static file gets the 404 page (not_found_handling in wrangler.jsonc).
    return env.ASSETS.fetch(request);
  }
};
