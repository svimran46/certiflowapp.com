// Sign in with Google and sign-in sessions.
// Needs two Worker secrets, from a "Web application" OAuth client in Google Cloud:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
// with https://<your domain>/auth/google/callback listed as an authorized redirect URI.

import { json, redirect, clean, isCrossOrigin, readCookie, setCookie, base64url, randomToken, sha256, hex } from "./http.js";
import { PLANS, TRIAL_DAYS, billingAvailable, hasSubscription, createCheckoutUrl } from "./billing.js";

const SESSION_COOKIE = "__Host-cf_session";
const OAUTH_COOKIE = "__Host-cf_oauth";
const SESSION_DAYS = 30;
const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

export const googleAvailable = (env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const callbackUrl = (request) => new URL(request.url).origin + "/auth/google/callback";
const validPlan = (plan) => (plan && Object.prototype.hasOwnProperty.call(PLANS, plan) ? plan : "");

export async function startGoogleSignIn(request, env) {
  if (!googleAvailable(env)) return redirect("/signup?error=unavailable");
  const plan = validPlan(new URL(request.url).searchParams.get("plan"));
  const state = randomToken(16);
  const verifier = randomToken(32);
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: base64url(await sha256(verifier)),
    code_challenge_method: "S256",
    prompt: "select_account"
  }).toString();
  return redirect(auth.toString(), [setCookie(OAUTH_COOKIE, `${state}.${verifier}.${plan}`, 600)]);
}

function jwtClaims(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
  } catch {
    return null;
  }
}

export async function finishGoogleSignIn(request, env) {
  const url = new URL(request.url);
  const [state, verifier, cookiePlan] = readCookie(request, OAUTH_COOKIE).split(".");
  const plan = validPlan(cookiePlan);
  const clearOauth = setCookie(OAUTH_COOKIE, "", 0);
  const fail = (reason) => redirect("/signup?error=" + reason + (plan ? "&plan=" + plan : ""), [clearOauth]);

  if (!googleAvailable(env)) return fail("unavailable");
  if (url.searchParams.get("error")) return fail("cancelled");
  const code = url.searchParams.get("code");
  if (!state || !verifier || !code || url.searchParams.get("state") !== state) return fail("expired");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl(request), grant_type: "authorization_code", code_verifier: verifier
    })
  });
  if (!res.ok) {
    console.error("google token exchange failed", res.status, await res.text());
    return fail("google");
  }
  // The ID token came straight from Google's token endpoint over TLS, so its claims can be
  // trusted without checking the signature; the checks below make sure it was issued for us.
  const claims = jwtClaims((await res.json()).id_token || "");
  if (!claims || !GOOGLE_ISSUERS.includes(claims.iss) || claims.aud !== env.GOOGLE_CLIENT_ID ||
      !(claims.exp * 1000 > Date.now()) || !claims.sub || !claims.email || claims.email_verified !== true) {
    return fail("google");
  }

  const user = await env.LEADS_DB.prepare(
    "INSERT INTO users (google_sub, email, name, last_login_at) VALUES (?1, ?2, ?3, datetime('now')) " +
    "ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name, last_login_at = excluded.last_login_at " +
    "RETURNING *"
  ).bind(String(claims.sub), clean(claims.email, 200).toLowerCase(), clean(claims.name, 120)).first();

  const token = randomToken(32);
  await env.LEADS_DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, datetime('now', ?3))")
    .bind(hex(await sha256(token)), user.id, "+" + SESSION_DAYS + " days").run();
  const cookies = [setCookie(SESSION_COOKIE, token, SESSION_DAYS * 86400), clearOauth];

  // Signing up from a plan goes straight on to Stripe to add a card and start the trial.
  let next = "/account" + (plan ? "?plan=" + plan : "");
  if (plan && billingAvailable(env) && !hasSubscription(user)) {
    try {
      next = await createCheckoutUrl(env, user, plan, url.origin);
    } catch (err) {
      console.error("checkout after sign-in failed", err && err.stack);
    }
  }
  return redirect(next, cookies);
}

export async function currentUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !env.LEADS_DB) return null;
  return env.LEADS_DB.prepare(
    "SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id " +
    "WHERE sessions.token_hash = ?1 AND sessions.expires_at > datetime('now')"
  ).bind(hex(await sha256(token))).first();
}

export async function signOut(request, env) {
  if (request.method !== "POST") return json(405, { error: "Use POST." });
  if (isCrossOrigin(request)) return json(403, { error: "Cross-origin requests are not accepted." });
  const token = readCookie(request, SESSION_COOKIE);
  if (token && env.LEADS_DB) {
    await env.LEADS_DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(hex(await sha256(token))).run();
  }
  return redirect("/", [setCookie(SESSION_COOKIE, "", 0)], 303);
}

// What the account and sign-up pages need to know about the visitor.
export async function describeMe(request, env, user) {
  const available = { google: googleAvailable(env), billing: billingAvailable(env) };
  const plans = Object.fromEntries(Object.entries(PLANS).map(([k, p]) => [k, { label: p.label, price: p.amount / 100, subs: p.subs }]));
  if (!user) return json(200, { signedIn: false, available, plans, trialDays: TRIAL_DAYS });
  return json(200, {
    signedIn: true,
    available, plans, trialDays: TRIAL_DAYS,
    user: {
      email: user.email,
      name: user.name || "",
      plan: user.plan,
      status: user.subscription_status,
      trialEnd: user.trial_end,
      currentPeriodEnd: user.current_period_end,
      cancelAtPeriodEnd: Boolean(user.cancel_at_period_end),
      trialUsed: Boolean(user.trial_used),
      hasBillingAccount: Boolean(user.stripe_customer_id)
    }
  });
}
