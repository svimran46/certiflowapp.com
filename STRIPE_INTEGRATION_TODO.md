# Stripe Integration Setup & Next Steps

This document is the single source of truth for completing the Stripe Checkout integration.

## Values to Replace

The following values were previously placeholders and have now been configured with your live/test Stripe products and pricing:

**Files containing values:**
- [src/worker.js](src/worker.js)

| Field | Current Configured Value | Status / Note |
|-------|--------------------------|---------------|
| mode | `subscription` | Set for recurring monthly subscriptions. |
| success_url | `${origin}/?session_id={CHECKOUT_SESSION_ID}#pricing` | Dynamically redirects to current domain with session ID. |
| cancel_url | `${origin}/#pricing` | Dynamically returns to pricing section on cancel. |
| line_items[].price (Starter) | `price_1UPfmOFaQ2FHfDqc2LthKXdt` ($49/mo) | Verified & Active in Stripe account. |
| line_items[].price (Growth) | `price_1UPfnkFaQ2FHfDqcH97iYzH4` ($99/mo) | Verified & Active in Stripe account. |
| line_items[].price (Pro) | `price_1UPfooFaQ2FHfDqcsjSMYUKa` ($199/mo) | Verified & Active in Stripe account. |

## Configured Parameters

These parameters were configured in Checkout Studio and are already set correctly.

**Files containing these parameters:**
- [src/worker.js](src/worker.js)

| Parameter | Value |
|-----------|-------|
| ui_mode | hosted_page |
| billing_address_collection | auto |
| phone_number_collection.enabled | false |
| automatic_tax.enabled | false |
| allow_promotion_codes | false |
| payment_method_collection | always (included when mode is "subscription") |
| submit_type | auto |
| integration_identifier | hosted_mobile_app_0001 |
| origin_context | mobile_app |

> **Note on `ui_mode` versioning:** The `stripe` SDK installed is version `^23.0.0` (version 21.0.0+), which uses `ui_mode: "hosted_page"`. (SDK versions below 21.0.0 use `ui_mode: "hosted"`).

---

## Setup and Next Steps

### 1. Environment Variables & API Keys
Configure your Stripe API keys in your environment:
- Local development: Add your secret key to `.dev.vars` (or `.env`):
  ```env
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_PUBLISHABLE_KEY=pk_test_...
  DOMAIN=http://localhost:8787
  ```
- Production (Cloudflare Workers):
  ```bash
  npx wrangler secret put STRIPE_SECRET_KEY
  ```

### 2. Project Structure & Files Modified
- **[src/worker.js](src/worker.js)**: Added the `handleCreateCheckoutSession` handler and routed `POST /api/create-checkout-session`.
- **[package.json](package.json)**: Added `stripe` (`^23.0.0`) dependency.
- **[.env](.env)**: Added template environment configuration (ignored by git).
- **[STRIPE_INTEGRATION_TODO.md](STRIPE_INTEGRATION_TODO.md)**: Setup guide and checklist.

### 3. How the Integration Works
1. Client initiates a `POST` request to `/api/create-checkout-session`.
2. The Cloudflare Worker calls `stripe.checkout.sessions.create(...)` with the configured session parameters.
3. The server either:
   - Responds with `303 See Other` redirect to `session.url` (for standard form posts or link clicks).
   - Returns JSON `{ url: session.url, sessionId: session.id }` if the client sent an `Accept: application/json` header.
4. The customer completes payment on Stripe's hosted Checkout page.
5. Upon completion or cancellation, Stripe redirects the customer to `success_url` or `cancel_url`.

### 4. Testing Card Numbers & Test Mode
Use Stripe test credentials and test payment methods:
- Enable **Test Mode** in your Stripe Dashboard.
- Use official Stripe test card numbers (e.g., `4242 4242 4242 4242`, any future MM/YY expiry, and any 3-digit CVC).
- Refer to [Stripe Testing Documentation](https://docs.stripe.com/testing) for scenario-specific test cards.

### 5. Next Steps
1. **Update Price IDs & Mode**: In [src/worker.js](src/worker.js), replace `"price_..."` with your Stripe Price ID and adjust `mode` to `"subscription"` if selling recurring subscriptions.
2. **Success & Cancel Pages**: Create dedicated landing pages (e.g., `/success.html` and `/cancel.html`) and update `success_url` and `cancel_url`.
3. **Fulfillment & Webhooks**: To fulfill purchases upon successful payment, set up a Stripe webhook endpoint listening for `checkout.session.completed`.

### Resources
- [Stripe Support](https://support.stripe.com)
- [Stripe Developer Documentation](https://docs.stripe.com)
- [Stripe MCP Tools](https://docs.stripe.com/mcp)
