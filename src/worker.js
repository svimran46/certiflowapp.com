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

async function handleAuditRequest(request, env) {
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
    notes: clean(body.notes, 2000)
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
      "INSERT INTO audit_requests (company, name, email, phone, subs, notes, ip, country, user_agent) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"
    )
    .bind(
      lead.company, lead.name, lead.email, lead.phone, lead.subs, lead.notes,
      ip, (request.cf && request.cf.country) || "", clean(request.headers.get("User-Agent"), 300)
    )
    .run();

  console.log("audit request stored", lead.company, lead.subs);
  return json(201, { ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/audit") {
      try {
        return await handleAuditRequest(request, env);
      } catch (err) {
        console.error("audit request failed", err && err.stack);
        return json(500, { error: "Something went wrong storing the request." });
      }
    }
    // Anything else that isn't a static file gets the 404 page (not_found_handling in wrangler.jsonc).
    return env.ASSETS.fetch(request);
  }
};
