// Tests for Sign in with Google, sessions and Stripe billing in src/accounts.js and src/billing.js.
// D1 is stood in for by an in-memory SQLite database built from the real migrations,
// and Google and Stripe are replaced by a fake fetch.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/worker.js";
import { verifyStripeSignature } from "../src/billing.js";

function d1() {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations").sort()) db.exec(readFileSync("migrations/" + file, "utf8"));
  return {
    raw: db,
    prepare(sql) {
      const bound = (args) => {
        const params = args.length ? Object.fromEntries(args.map((a, i) => [i + 1, a])) : {};
        return {
          first: async () => (args.length ? db.prepare(sql).get(params) : db.prepare(sql).get()) ?? null,
          all: async () => ({ results: args.length ? db.prepare(sql).all(params) : db.prepare(sql).all() }),
          run: async () => {
            const r = args.length ? db.prepare(sql).run(params) : db.prepare(sql).run();
            return { success: true, meta: { changes: r.changes } };
          }
        };
      };
      return { bind: (...args) => bound(args), ...bound([]) };
    }
  };
}

const ORIGIN = "https://certiflowapp.com";
const GOOGLE = { GOOGLE_CLIENT_ID: "client-123.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "google-secret" };
const STRIPE = { STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_test" };

let calls, stripeState;
beforeEach(() => {
  calls = [];
  stripeState = { prices: [], subscriptions: {}, nextId: 1 };
});

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
function idToken(overrides = {}) {
  const claims = {
    iss: "https://accounts.google.com", aud: GOOGLE.GOOGLE_CLIENT_ID, sub: "google-user-1",
    email: "Pat@HarborMain.example", email_verified: true, name: "Pat Lee",
    exp: Math.floor(Date.now() / 1000) + 3600, ...overrides
  };
  return b64url({ alg: "RS256" }) + "." + b64url(claims) + ".sig";
}

function fakeFetch({ token = idToken(), tokenStatus = 200 } = {}) {
  return async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const body = init.body ? new URLSearchParams(init.body.toString()) : null;
    calls.push({ url, method: init.method || "GET", body });
    const ok = (data) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.host === "oauth2.googleapis.com") {
      return new Response(JSON.stringify({ id_token: token }), { status: tokenStatus });
    }
    if (url.host === "api.stripe.com") {
      const path = url.pathname.replace("/v1/", "");
      if (path === "prices" && init.method === "GET") {
        const key = url.searchParams.get("lookup_keys[0]");
        return ok({ data: stripeState.prices.filter((p) => p.lookup_key === key) });
      }
      if (path === "prices") {
        const price = { id: "price_" + stripeState.nextId++, lookup_key: body.get("lookup_key"), unit_amount: Number(body.get("unit_amount")) };
        stripeState.prices.push(price);
        return ok(price);
      }
      if (path === "customers") return ok({ id: "cus_" + stripeState.nextId++ });
      if (path === "checkout/sessions") return ok({ id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" });
      if (path === "billing_portal/sessions") return ok({ url: "https://billing.stripe.com/p/session/1" });
      if (path.startsWith("subscriptions/")) return ok(stripeState.subscriptions[path.split("/")[1]]);
    }
    throw new Error("unexpected fetch " + url);
  };
}

function setup(extraEnv = {}, fetchOptions) {
  globalThis.fetch = fakeFetch(fetchOptions);
  const env = { LEADS_DB: d1(), ASSETS: { fetch: async () => new Response("404 page", { status: 404 }) }, ...extraEnv };
  const ctx = { waitUntil() {} };
  const call = (path, init = {}) => worker.fetch(new Request(ORIGIN + path, init), env, ctx);
  return { env, call };
}

const cookieValue = (res, name) => {
  const c = res.headers.getSetCookie().find((h) => h.startsWith(name + "="));
  return c ? c.split(";")[0].slice(name.length + 1) : null;
};

// Runs the whole Google round trip and returns the response from the callback.
async function signIn(call, plan = "growth") {
  const start = await call("/auth/google?plan=" + plan);
  const state = new URL(start.headers.get("Location")).searchParams.get("state");
  const oauth = cookieValue(start, "__Host-cf_oauth");
  return call(`/auth/google/callback?state=${state}&code=auth-code`, { headers: { Cookie: "__Host-cf_oauth=" + oauth } });
}
const sessionCookie = (res) => ({ Cookie: "__Host-cf_session=" + cookieValue(res, "__Host-cf_session") });

test("sign-in redirects to Google with state and PKCE, remembering the chosen plan", async () => {
  const { call } = setup(GOOGLE);
  const res = await call("/auth/google?plan=pro");
  assert.equal(res.status, 302);
  const google = new URL(res.headers.get("Location"));
  assert.equal(google.host, "accounts.google.com");
  assert.equal(google.searchParams.get("redirect_uri"), ORIGIN + "/auth/google/callback");
  assert.equal(google.searchParams.get("code_challenge_method"), "S256");
  assert.equal(google.searchParams.get("scope"), "openid email profile");
  const cookie = res.headers.getSetCookie()[0];
  assert.match(cookie, /^__Host-cf_oauth=[\w-]+\.[\w-]+\.pro; Path=\/; HttpOnly; Secure; SameSite=Lax/);
  assert.ok(cookie.startsWith("__Host-cf_oauth=" + google.searchParams.get("state") + "."));
});

test("sign-in is turned away cleanly until Google is configured", async () => {
  const { call } = setup();
  const res = await call("/auth/google");
  assert.equal(res.headers.get("Location"), "/signup?error=unavailable");
});

test("callback rejects a state that doesn't match the cookie", async () => {
  const { call } = setup(GOOGLE);
  const res = await call("/auth/google/callback?state=forged&code=x", { headers: { Cookie: "__Host-cf_oauth=real.verifier.growth" } });
  assert.equal(res.headers.get("Location"), "/signup?error=expired&plan=growth");
  assert.equal(calls.length, 0);
});

test("callback rejects tokens for another app or with an unverified email", async () => {
  for (const bad of [{ aud: "someone-else" }, { email_verified: false }, { iss: "https://evil.example" }, { exp: 1 }]) {
    const { call, env } = setup(GOOGLE, { token: idToken(bad) });
    const res = await signIn(call);
    assert.match(res.headers.get("Location"), /^\/signup\?error=google/);
    assert.equal(env.LEADS_DB.raw.prepare("SELECT COUNT(*) AS n FROM users").get().n, 0);
  }
});

test("without billing configured, sign-in creates the account and a session", async () => {
  const { call, env } = setup(GOOGLE);
  const res = await signIn(call);
  assert.equal(res.headers.get("Location"), "/account?plan=growth");
  const exchange = calls.find((c) => c.url.host === "oauth2.googleapis.com");
  assert.ok(exchange.body.get("code_verifier"));
  assert.equal(exchange.body.get("client_secret"), "google-secret");

  const user = env.LEADS_DB.raw.prepare("SELECT * FROM users").get();
  assert.equal(user.email, "pat@harbormain.example");
  const stored = env.LEADS_DB.raw.prepare("SELECT token_hash FROM sessions").get();
  assert.notEqual(stored.token_hash, cookieValue(res, "__Host-cf_session")); // only the hash is stored

  const me = await (await call("/api/me", { headers: sessionCookie(res) })).json();
  assert.equal(me.signedIn, true);
  assert.equal(me.user.email, "pat@harbormain.example");
  assert.deepEqual(me.available, { google: true, billing: false });
  assert.equal((await (await call("/api/me")).json()).signedIn, false);
});

test("signing up from a plan goes straight to Stripe with a 14-day trial and the card required", async () => {
  const { call, env } = setup({ ...GOOGLE, ...STRIPE });
  const res = await signIn(call, "growth");
  assert.equal(res.headers.get("Location"), "https://checkout.stripe.com/c/pay/cs_1");

  const price = calls.find((c) => c.url.pathname === "/v1/prices" && c.method === "POST").body;
  assert.equal(price.get("unit_amount"), "9900");
  assert.equal(price.get("recurring[interval]"), "month");
  assert.equal(price.get("lookup_key"), "certiflow_growth_monthly_v1");

  const checkout = calls.find((c) => c.url.pathname === "/v1/checkout/sessions").body;
  assert.equal(checkout.get("mode"), "subscription");
  assert.equal(checkout.get("payment_method_collection"), "always");
  assert.equal(checkout.get("subscription_data[trial_period_days]"), "14");
  assert.equal(checkout.get("subscription_data[trial_settings][end_behavior][missing_payment_method]"), "cancel");
  assert.equal(checkout.get("line_items[0][price]"), "price_2");
  assert.equal(checkout.get("success_url"), ORIGIN + "/account?checkout=success");
  assert.equal(env.LEADS_DB.raw.prepare("SELECT stripe_customer_id FROM users").get().stripe_customer_id, "cus_1");
});

test("a second checkout reuses the Stripe price and customer, and a used trial isn't offered again", async () => {
  const { call, env } = setup({ ...GOOGLE, ...STRIPE });
  const res = await signIn(call, "starter");
  env.LEADS_DB.raw.exec("UPDATE users SET trial_used = 1, subscription_status = 'canceled'");
  calls.length = 0;
  const again = await call("/api/checkout", {
    method: "POST", headers: { ...sessionCookie(res), Origin: ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify({ plan: "starter" })
  });
  assert.equal(again.status, 200);
  assert.equal(calls.filter((c) => c.method === "POST" && c.url.pathname !== "/v1/checkout/sessions").length, 0);
  const checkout = calls.find((c) => c.url.pathname === "/v1/checkout/sessions").body;
  assert.equal(checkout.get("subscription_data[trial_period_days]"), null);
  assert.equal(checkout.get("customer"), "cus_1");
});

test("checkout needs a session, a known plan, a same-site request and no existing plan", async () => {
  const { call, env } = setup({ ...GOOGLE, ...STRIPE });
  const post = (headers, plan = "pro") => call("/api/checkout", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers }, body: JSON.stringify({ plan })
  });
  assert.equal((await post({})).status, 401);
  const res = await signIn(call, "");
  assert.equal(res.headers.get("Location"), "/account");
  assert.equal((await post({ ...sessionCookie(res), Origin: "https://evil.example" })).status, 403);
  assert.equal((await post(sessionCookie(res), "platinum")).status, 422);
  env.LEADS_DB.raw.exec("UPDATE users SET subscription_status = 'trialing'");
  assert.equal((await post(sessionCookie(res))).status, 409);
});

test("billing portal opens for customers and is refused before there's a billing account", async () => {
  const { call, env } = setup({ ...GOOGLE, ...STRIPE });
  const res = await signIn(call, "");
  const post = () => call("/api/billing-portal", { method: "POST", headers: { ...sessionCookie(res), Origin: ORIGIN } });
  assert.equal((await post()).status, 409);
  env.LEADS_DB.raw.exec("UPDATE users SET stripe_customer_id = 'cus_9'");
  const ok = await post();
  assert.equal((await ok.json()).url, "https://billing.stripe.com/p/session/1");
  assert.equal(calls.at(-1).body.get("return_url"), ORIGIN + "/account");
});

async function signed(payload, secret = STRIPE.STRIPE_WEBHOOK_SECRET, t = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + "." + payload))).toString("hex");
  return `t=${t},v1=${sig}`;
}

test("webhook signatures are checked for secret, payload and age", async () => {
  const payload = '{"id":"evt_1"}';
  assert.equal(await verifyStripeSignature(payload, await signed(payload), "whsec_test"), true);
  assert.equal(await verifyStripeSignature(payload, await signed(payload, "whsec_other"), "whsec_test"), false);
  assert.equal(await verifyStripeSignature(payload + " ", await signed(payload), "whsec_test"), false);
  assert.equal(await verifyStripeSignature(payload, await signed(payload, "whsec_test", 1000), "whsec_test"), false);
  assert.equal(await verifyStripeSignature(payload, null, "whsec_test"), false);
});

test("subscription webhooks update the account from Stripe's current state, once per event", async () => {
  const { call, env } = setup({ ...GOOGLE, ...STRIPE });
  const res = await signIn(call, "growth");
  const trialEnd = Math.floor(Date.now() / 1000) + 14 * 86400;
  stripeState.subscriptions.sub_1 = {
    id: "sub_1", customer: "cus_1", status: "trialing", trial_end: trialEnd, cancel_at_period_end: false,
    metadata: { user_id: "1", plan: "growth" },
    items: { data: [{ current_period_end: trialEnd, price: { lookup_key: "certiflow_growth_monthly_v1" } }] }
  };
  const send = async (event) => {
    const payload = JSON.stringify(event);
    return call("/api/stripe/webhook", { method: "POST", headers: { "Stripe-Signature": await signed(payload) }, body: payload });
  };

  assert.equal((await call("/api/stripe/webhook", { method: "POST", headers: { "Stripe-Signature": "t=1,v1=00" }, body: "{}" })).status, 400);

  const completed = { id: "evt_1", type: "checkout.session.completed", data: { object: { mode: "subscription", customer: "cus_1", subscription: "sub_1", client_reference_id: "1" } } };
  assert.equal((await send(completed)).status, 200);
  const me = (await (await call("/api/me", { headers: sessionCookie(res) })).json()).user;
  assert.equal(me.status, "trialing");
  assert.equal(me.plan, "growth");
  assert.equal(me.trialUsed, true);
  assert.equal(me.trialEnd, new Date(trialEnd * 1000).toISOString());

  // Cancelling in the portal arrives as an update; a retried delivery of it is ignored.
  stripeState.subscriptions.sub_1 = { ...stripeState.subscriptions.sub_1, cancel_at_period_end: true };
  const updated = { id: "evt_2", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } };
  await send(updated);
  assert.equal(env.LEADS_DB.raw.prepare("SELECT cancel_at_period_end FROM users").get().cancel_at_period_end, 1);
  const before = calls.length;
  assert.equal((await (await send(updated)).json()).duplicate, true);
  assert.equal(calls.length, before);
});

test("an event about an old subscription doesn't overwrite a newer live one", async () => {
  const { call, env } = setup({ ...GOOGLE, ...STRIPE });
  await signIn(call, "growth");
  env.LEADS_DB.raw.exec("UPDATE users SET subscription_id = 'sub_new', subscription_status = 'active', plan = 'pro'");
  stripeState.subscriptions.sub_old = { id: "sub_old", customer: "cus_1", status: "canceled", metadata: { user_id: "1" }, items: { data: [] } };
  const payload = JSON.stringify({ id: "evt_9", type: "customer.subscription.deleted", data: { object: { id: "sub_old" } } });
  await call("/api/stripe/webhook", { method: "POST", headers: { "Stripe-Signature": await signed(payload) }, body: payload });
  const user = env.LEADS_DB.raw.prepare("SELECT subscription_id, subscription_status, plan FROM users").get();
  assert.deepEqual({ ...user }, { subscription_id: "sub_new", subscription_status: "active", plan: "pro" });
});

test("signing out deletes the session", async () => {
  const { call, env } = setup(GOOGLE);
  const res = await signIn(call);
  const out = await call("/auth/logout", { method: "POST", headers: { ...sessionCookie(res), Origin: ORIGIN } });
  assert.equal(out.status, 303);
  assert.match(out.headers.getSetCookie()[0], /^__Host-cf_session=; .*Max-Age=0/);
  assert.equal(env.LEADS_DB.raw.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
  assert.equal((await (await call("/api/me", { headers: sessionCookie(res) })).json()).signedIn, false);
});
