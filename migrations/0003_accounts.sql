-- Accounts (Sign in with Google), sign-in sessions and Stripe subscription state.
-- Only CREATE ... IF NOT EXISTS, so applying it twice is harmless.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT,
  stripe_customer_id TEXT UNIQUE,
  plan TEXT,
  subscription_id TEXT,
  subscription_status TEXT,
  trial_end TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  trial_used INTEGER NOT NULL DEFAULT 0
);

-- Only a SHA-256 hash of each session token is stored; the token itself lives in the visitor's cookie.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- Stripe retries webhooks; remembering event ids makes handling idempotent.
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
