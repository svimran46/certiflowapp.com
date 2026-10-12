// Stripe subscriptions: a 14-day trial with the card collected up front.
// Needs two Worker secrets:
//   STRIPE_SECRET_KEY      - sk_test_... while testing, sk_live_... to take real payments
//   STRIPE_WEBHOOK_SECRET  - whsec_... from the webhook endpoint pointing at /api/stripe/webhook
// The three monthly prices are created in Stripe automatically the first time each plan is used.

import { json, isCrossOrigin, hex } from "./http.js";

export const TRIAL_DAYS = 14;
export const PLANS = {
  starter: { name: "CertiFlow Starter", label: "Starter", amount: 4900, subs: 25 },
  growth: { name: "CertiFlow Growth", label: "Growth", amount: 9900, subs: 75 },
  pro: { name: "CertiFlow Pro", label: "Pro", amount: 19900, subs: 200 }
};
const LIVE_STATUSES = new Set(["trialing", "active", "past_due", "unpaid", "incomplete"]);

export const billingAvailable = (env) => Boolean(env.STRIPE_SECRET_KEY);
export const hasSubscription = (user) => LIVE_STATUSES.has(user.subscription_status);
const lookupKey = (plan) => `certiflow_${plan}_monthly_v1`;

// Stripe's API takes nested form fields: line_items[0][price]=..., metadata[plan]=...
function encode(params, prefix = "", out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object") encode(value, name, out);
    else out.append(name, String(value));
  }
  return out;
}

async function stripe(env, method, path, params = {}) {
  const query = method === "GET" ? "?" + encode(params) : "";
  const res = await fetch("https://api.stripe.com/v1/" + path + query, {
    method,
    headers: {
      Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
      ...(method === "GET" ? {} : { "Content-Type": "application/x-www-form-urlencoded" })
    },
    body: method === "GET" ? undefined : encode(params)
  });
  const body = await res.json();
  if (!res.ok) throw new Error("Stripe " + method + " " + path + ": " + ((body.error && body.error.message) || res.status));
  return body;
}

const priceIds = new Map();
async function priceFor(env, plan) {
  const key = lookupKey(plan);
  const cacheKey = env.STRIPE_SECRET_KEY.slice(0, 8) + ":" + key; // test and live keys never share a price
  if (priceIds.has(cacheKey)) return priceIds.get(cacheKey);
  const find = async () => {
    const list = await stripe(env, "GET", "prices", { lookup_keys: [key], active: true, limit: 1 });
    return list.data[0] && list.data[0].id;
  };
  let id = await find();
  if (!id) {
    try {
      const price = await stripe(env, "POST", "prices", {
        currency: "usd", unit_amount: PLANS[plan].amount, recurring: { interval: "month" },
        lookup_key: key, product_data: { name: PLANS[plan].name }
      });
      id = price.id;
    } catch (err) {
      id = await find(); // another request created it first
      if (!id) throw err;
    }
  }
  priceIds.set(cacheKey, id);
  return id;
}

// Returns the URL of a Stripe-hosted checkout page for this user and plan.
export async function createCheckoutUrl(env, user, plan, origin) {
  if (!PLANS[plan]) throw new Error("Unknown plan: " + plan);
  let customer = user.stripe_customer_id;
  if (!customer) {
    customer = (await stripe(env, "POST", "customers", {
      email: user.email, name: user.name || undefined, metadata: { user_id: String(user.id) }
    })).id;
    await env.LEADS_DB.prepare("UPDATE users SET stripe_customer_id = ?1 WHERE id = ?2 AND stripe_customer_id IS NULL")
      .bind(customer, user.id).run();
  }

  const subscriptionData = { metadata: { user_id: String(user.id), plan } };
  if (!user.trial_used) {
    subscriptionData.trial_period_days = TRIAL_DAYS;
    // If the card is somehow missing when the trial ends, cancel instead of billing.
    subscriptionData.trial_settings = { end_behavior: { missing_payment_method: "cancel" } };
  }

  const session = await stripe(env, "POST", "checkout/sessions", {
    mode: "subscription",
    customer,
    client_reference_id: String(user.id),
    line_items: [{ price: await priceFor(env, plan), quantity: 1 }],
    payment_method_collection: "always",
    subscription_data: subscriptionData,
    metadata: { user_id: String(user.id), plan },
    success_url: origin + "/account?checkout=success",
    cancel_url: origin + "/account?checkout=cancelled&plan=" + plan
  });
  return session.url;
}

export async function handleCheckout(request, env, user) {
  if (request.method !== "POST") return json(405, { error: "Use POST." });
  if (isCrossOrigin(request)) return json(403, { error: "Cross-origin requests are not accepted." });
  if (!user) return json(401, { error: "Sign in to start your trial." });
  if (!billingAvailable(env)) return json(503, { error: "Checkout isn't available yet. Email support@certiflowapp.com and we'll set you up." });
  if (hasSubscription(user)) return json(409, { error: "You already have a plan. Use Manage billing to change it." });

  let body = {};
  try { body = await request.json(); } catch {}
  const plan = body && typeof body.plan === "string" ? body.plan : "";
  if (!PLANS[plan]) return json(422, { error: "Choose a plan." });

  return json(200, { url: await createCheckoutUrl(env, user, plan, new URL(request.url).origin) });
}

// Stripe's hosted billing portal: update the card, switch plans, cancel, download invoices.
export async function handleBillingPortal(request, env, user) {
  if (request.method !== "POST") return json(405, { error: "Use POST." });
  if (isCrossOrigin(request)) return json(403, { error: "Cross-origin requests are not accepted." });
  if (!user) return json(401, { error: "Sign in first." });
  if (!billingAvailable(env) || !user.stripe_customer_id) return json(409, { error: "There's no billing account yet. Start a plan first." });
  const session = await stripe(env, "POST", "billing_portal/sessions", {
    customer: user.stripe_customer_id, return_url: new URL(request.url).origin + "/account"
  });
  return json(200, { url: session.url });
}

// Stripe-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.payload">
export async function verifyStripeSignature(payload, header, secret, now = Date.now(), toleranceSeconds = 300) {
  if (!header || !secret) return false;
  let timestamp = "";
  const signatures = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "t") timestamp = v;
    if (k === "v1") signatures.push(v);
  }
  if (!timestamp || !signatures.length || Math.abs(now / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp + "." + payload))));
  return signatures.some((sig) => {
    if (sig.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

const iso = (seconds) => (seconds ? new Date(seconds * 1000).toISOString() : null);

function planOf(sub) {
  const item = sub.items && sub.items.data && sub.items.data[0];
  const key = item && item.price && item.price.lookup_key;
  const match = key && /^certiflow_([a-z]+)_monthly/.exec(key);
  if (match && PLANS[match[1]]) return match[1];
  return sub.metadata && PLANS[sub.metadata.plan] ? sub.metadata.plan : null;
}

async function syncSubscription(env, sub) {
  const item = sub.items && sub.items.data && sub.items.data[0];
  const periodEnd = sub.current_period_end || (item && item.current_period_end);
  const userId = Number(sub.metadata && sub.metadata.user_id) || 0;
  // An event about an old, finished subscription must not overwrite a newer live one.
  await env.LEADS_DB.prepare(
    "UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, ?1), plan = ?2, subscription_id = ?3, " +
    "subscription_status = ?4, trial_end = ?5, current_period_end = ?6, cancel_at_period_end = ?7, " +
    "trial_used = CASE WHEN ?5 IS NOT NULL THEN 1 ELSE trial_used END " +
    "WHERE (id = ?8 OR stripe_customer_id = ?1) " +
    "AND (subscription_id IS NULL OR subscription_id = ?3 OR ?4 IN ('trialing', 'active', 'past_due', 'unpaid', 'incomplete'))"
  ).bind(sub.customer, planOf(sub), sub.id, sub.status, iso(sub.trial_end), iso(periodEnd), sub.cancel_at_period_end ? 1 : 0, userId).run();
}

export async function handleStripeWebhook(request, env) {
  if (request.method !== "POST") return json(405, { error: "Use POST." });
  if (!env.STRIPE_WEBHOOK_SECRET || !billingAvailable(env)) return json(503, { error: "Billing isn't configured." });
  const payload = await request.text();
  if (!(await verifyStripeSignature(payload, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET))) {
    return json(400, { error: "Invalid signature." });
  }
  const event = JSON.parse(payload);
  const seen = await env.LEADS_DB.prepare("SELECT 1 AS seen FROM stripe_events WHERE id = ?1").bind(event.id).first();
  if (seen) return json(200, { ok: true, duplicate: true });

  const obj = event.data && event.data.object;
  if (event.type === "checkout.session.completed" && obj.mode === "subscription") {
    await env.LEADS_DB.prepare(
      "UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, ?1), subscription_id = ?2, trial_used = 1 WHERE id = ?3"
    ).bind(obj.customer, obj.subscription, Number(obj.client_reference_id) || 0).run();
    if (obj.subscription) await syncSubscription(env, await stripe(env, "GET", "subscriptions/" + obj.subscription));
  } else if (event.type.startsWith("customer.subscription.")) {
    // Re-read the subscription so events that arrive out of order can't leave stale state behind.
    await syncSubscription(env, await stripe(env, "GET", "subscriptions/" + obj.id));
  }

  // Recorded only after the work succeeded, so a failed attempt is retried by Stripe.
  await env.LEADS_DB.prepare("INSERT OR IGNORE INTO stripe_events (id, type) VALUES (?1, ?2)").bind(event.id, event.type).run();
  return json(200, { ok: true });
}
