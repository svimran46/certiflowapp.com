"use strict";

// The account page: trial and billing status, starting a trial, and company details for onboarding.

const $ = (id) => document.getElementById(id);
const DATE = { month: "long", day: "numeric", year: "numeric" };
const formatDate = (value) => new Date(value).toLocaleDateString("en-US", DATE);
const LIVE = new Set(["trialing", "active", "past_due", "unpaid", "incomplete"]);
// The service itself (sending certificates for review) opens only once a card is on file and the plan is running.
const SERVICE_OPEN = new Set(["trialing", "active"]);

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { Accept: "application/json", "Content-Type": "application/json" }, ...options });
  let body = {};
  try { body = await res.json(); } catch {}
  if (!res.ok) throw new Error(body.error || "Something went wrong. Please try again.");
  return body;
}

function showError(id, message) {
  const el = $(id);
  el.textContent = message;
  el.hidden = !message;
}

function selectedPlan() {
  const checked = document.querySelector('#start-trial input[name="plan"]:checked');
  return checked ? checked.value : "growth";
}

function describe(me) {
  const u = me.user;
  const plan = me.plans[u.plan];
  const price = plan ? "$" + plan.price : "your plan price";
  const planName = plan ? plan.label + " plan" : "Your plan";
  switch (u.status) {
    case "trialing":
      return u.cancelAtPeriodEnd
        ? { title: "Your free trial ends " + formatDate(u.trialEnd), body: "You’ve cancelled, so the trial won’t turn into a paid plan and your card won’t be charged.", portal: true }
        : { title: "Your free trial runs until " + formatDate(u.trialEnd), body: "Your card will be charged " + price + " for the " + planName + " on " + formatDate(u.trialEnd) + ", then monthly. Cancel before then and you pay nothing.", portal: true };
    case "active":
      return u.cancelAtPeriodEnd
        ? { title: planName + ", ending " + formatDate(u.currentPeriodEnd), body: "You’ve cancelled. You keep full access until then and won’t be charged again.", portal: true }
        : { title: planName + ", active", body: "Renews on " + formatDate(u.currentPeriodEnd) + " at " + price + " a month.", portal: true };
    case "past_due":
    case "unpaid":
      return { title: "Payment needed", body: "Your last payment didn’t go through. Update your card to keep your plan running.", portal: true };
    case "incomplete":
      return { title: "Finish setting up payment", body: "Your card needs confirming before your plan can start.", portal: true };
    default: {
      const ends = new Date(Date.now() + me.trialDays * 86400000);
      return u.trialUsed
        ? { title: "Choose a plan", body: "Your free trial has already been used. Pick a plan to continue; you can cancel any time.", start: true, button: "Add card and subscribe" }
        : { title: "Start your " + me.trialDays + "\u2011day free trial", body: "Add a card on Stripe’s secure page. Nothing is charged until " + formatDate(ends) + ", and you can cancel any time before then.", start: true };
    }
  }
}

function render(me) {
  const u = me.user;
  const first = (u.name || "").split(" ")[0];
  $("account-title").textContent = first ? "Welcome, " + first + "." : "Your account";
  $("account-email").textContent = "Signed in as " + u.email;
  document.querySelectorAll('[data-me="email"]').forEach((n) => (n.textContent = u.email));

  const state = describe(me);
  $("status-title").textContent = state.title;
  $("status-body").textContent = state.body;
  $("start-trial").hidden = !state.start;
  if (state.button) $("checkout-btn").textContent = state.button;
  $("portal-btn").hidden = !(state.portal || (!state.start && u.hasBillingAccount));
  $("onboarding").hidden = !SERVICE_OPEN.has(u.status);

  if (state.start && !me.available.billing) {
    $("start-trial").hidden = true;
    $("status-body").textContent = "Card sign-up opens shortly. Email support@certiflowapp.com and we’ll start your trial for you.";
  }

  const wanted = new URLSearchParams(location.search).get("plan");
  const option = wanted && document.querySelector('#start-trial input[value="' + CSS.escape(wanted) + '"]');
  if (option) option.checked = true;

  $("account-loading").hidden = true;
  $("account").hidden = false;
}

async function load(attempt = 0) {
  const me = await api("/api/me");
  if (!me.signedIn) {
    location.replace("/signup" + location.search);
    return;
  }
  const checkout = new URLSearchParams(location.search).get("checkout");
  const banner = $("account-banner");
  if (checkout === "success" && !LIVE.has(me.user.status) && attempt < 8) {
    // Stripe confirms the subscription by webhook a moment after redirecting back.
    banner.textContent = "Confirming your trial with Stripe…";
    banner.hidden = false;
    $("account-loading").hidden = true;
    setTimeout(() => load(attempt + 1), 1500);
    return;
  }
  if (checkout === "success") {
    banner.textContent = LIVE.has(me.user.status)
      ? "You’re all set. Your free trial has started and nothing has been charged."
      : "Stripe is still confirming your card. Refresh in a minute; there’s no need to pay again.";
    banner.hidden = false;
  } else if (checkout === "cancelled") {
    banner.textContent = "Checkout was cancelled. Nothing was charged.";
    banner.hidden = false;
  }
  render(me);
}

async function goTo(path, body, button) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Opening Stripe…";
  showError("billing-error", "");
  try {
    const { url } = await api(path, { method: "POST", body: JSON.stringify(body || {}) });
    location.assign(url);
  } catch (err) {
    showError("billing-error", err.message);
    button.disabled = false;
    button.textContent = label;
  }
}

$("checkout-btn").addEventListener("click", (e) => goTo("/api/checkout", { plan: selectedPlan() }, e.currentTarget));
$("portal-btn").addEventListener("click", (e) => goTo("/api/billing-portal", null, e.currentTarget));

$("onboarding-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const status = $("onboarding-status");
  const company = $("f-company");
  if (!company.value.trim()) {
    status.className = "form-status is-error";
    status.textContent = "Fill in your company name to continue.";
    company.focus();
    return;
  }
  const data = Object.fromEntries(new FormData(form).entries());
  const me = await api("/api/me");
  data.name = me.user.name || me.user.email;
  data.email = me.user.email;
  try {
    data.source = sessionStorage.getItem("cf-source") || "";
    data.selfCheck = sessionStorage.getItem("cf-selfcheck") || "";
  } catch {}
  $("onboarding-submit").disabled = true;
  try {
    await api("/api/audit", { method: "POST", body: JSON.stringify(data) });
    status.className = "form-status is-ok";
    status.textContent = "Saved. Now email your certificates to support@certiflowapp.com and we’ll take it from there.";
  } catch (err) {
    status.className = "form-status is-error";
    status.textContent = err.message;
    $("onboarding-submit").disabled = false;
  }
});

load().catch(() => {
  $("account-loading").textContent = "Your account couldn’t be loaded. Refresh the page, or email support@certiflowapp.com.";
});
