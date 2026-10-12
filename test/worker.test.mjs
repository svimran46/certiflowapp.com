// Tests for the audit-request API in src/worker.js, using an in-memory stand-in for D1.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

function fakeDb() {
  const rows = [];
  const links = [];
  return {
    rows,
    links,
    prepare(sql) {
      const stmt = {
        all: () => stmt.bind().all(),
        bind(...args) {
          return {
            async first() {
              if (sql.startsWith("SELECT COUNT(*)")) return { n: rows.filter((r) => r[6] === args[0]).length };
              if (sql.startsWith("SELECT token, email")) {
                const link = links.find((l) => l.token === args[0]);
                return link || null;
              }
              if (sql.startsWith("SELECT email FROM magic_links")) {
                const link = links.find((l) => l.token === args[0] && l.used_at);
                return link || null;
              }
              throw new Error("unexpected query: " + sql);
            },
            async all() {
              if (sql.startsWith("SELECT created_at")) {
                const cols = ["company", "name", "email", "phone", "subs", "notes", "ip", "country", "user_agent", "source", "self_check"];
                return { results: rows.slice().reverse().map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]]).concat([["created_at", "2026-10-09 12:00:00"], ["status", "new"]]))) };
              }
              throw new Error("unexpected query: " + sql);
            },
            async run() {
              if (sql.startsWith("INSERT INTO audit_requests")) rows.push(args);
              else if (sql.startsWith("INSERT INTO magic_links")) {
                links.push({ token: args[0], email: args[1], expires_at: args[2], used_at: null });
              } else if (sql.startsWith("UPDATE magic_links")) {
                const link = links.find((l) => l.token === args[0]);
                if (link) link.used_at = new Date().toISOString();
              } else throw new Error("unexpected query: " + sql);
              return { success: true };
            }
          };
        }
      };
      return stmt;
    }
  };
}

function setup(extraEnv = {}) {
  const db = fakeDb();
  const waits = [];
  const env = { LEADS_DB: db, ASSETS: { fetch: async () => new Response("asset", { status: 200 }) }, ...extraEnv };
  const ctx = { waitUntil: (p) => waits.push(p) };
  return { db, env, ctx, waits };
}

const valid = { company: "Test GC", name: "Pat Lee", email: "Pat@TestGC.com", subs: "25-50", source: "utm_source=email", selfCheck: "gaps: CG 20 37" };

function post(body, headers = {}) {
  return new Request("https://certiflowapp.com/api/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

test("stores a valid request and normalizes the email", async () => {
  const { db, env, ctx } = setup();
  const res = await worker.fetch(post(valid), env, ctx);
  assert.equal(res.status, 201);
  assert.equal(db.rows.length, 1);
  const [company, name, email, , subs, , ip, , , source, selfCheck] = db.rows[0];
  assert.deepEqual([company, name, email, subs, ip, source, selfCheck],
    ["Test GC", "Pat Lee", "pat@testgc.com", "25-50", "203.0.113.7", "utm_source=email", "gaps: CG 20 37"]);
});

test("rejects missing fields and bad email", async () => {
  const { db, env, ctx } = setup();
  for (const body of [{ ...valid, company: "" }, { ...valid, name: " " }, { ...valid, email: "not-an-email" }]) {
    const res = await worker.fetch(post(body), env, ctx);
    assert.equal(res.status, 422);
  }
  assert.equal(db.rows.length, 0);
});

test("unknown subcontractor ranges are stored as unknown", async () => {
  const { db, env, ctx } = setup();
  await worker.fetch(post({ ...valid, subs: "<script>" }), env, ctx);
  assert.equal(db.rows[0][4], "unknown");
});

test("honeypot submissions get a quiet success and are not stored", async () => {
  const { db, env, ctx } = setup();
  const res = await worker.fetch(post({ ...valid, website: "spam.example" }), env, ctx);
  assert.equal(res.status, 200);
  assert.equal(db.rows.length, 0);
});

test("rate limits after five requests per IP per hour", async () => {
  const { env, ctx } = setup();
  for (let i = 0; i < 5; i++) assert.equal((await worker.fetch(post(valid), env, ctx)).status, 201);
  assert.equal((await worker.fetch(post(valid), env, ctx)).status, 429);
  assert.equal((await worker.fetch(post(valid, { "CF-Connecting-IP": "198.51.100.1" }), env, ctx)).status, 201);
});

test("rejects cross-origin posts, wrong methods, non-JSON and oversized bodies", async () => {
  const { db, env, ctx } = setup();
  assert.equal((await worker.fetch(post(valid, { Origin: "https://evil.example" }), env, ctx)).status, 403);
  assert.equal((await worker.fetch(new Request("https://certiflowapp.com/api/audit"), env, ctx)).status, 405);
  assert.equal((await worker.fetch(post(valid, { "Content-Type": "text/plain" }), env, ctx)).status, 415);
  assert.equal((await worker.fetch(post("{not json"), env, ctx)).status, 400);
  assert.equal((await worker.fetch(post("[1,2]"), env, ctx)).status, 400);
  assert.equal((await worker.fetch(post({ ...valid, notes: "x".repeat(30000) }), env, ctx)).status, 413);
  assert.equal(db.rows.length, 0);
});

test("same-origin posts are accepted", async () => {
  const { env, ctx } = setup();
  const res = await worker.fetch(post(valid, { Origin: "https://certiflowapp.com" }), env, ctx);
  assert.equal(res.status, 201);
});

test("returns 503 without a database binding", async () => {
  const { env, ctx } = setup({ LEADS_DB: undefined });
  assert.equal((await worker.fetch(post(valid), env, ctx)).status, 503);
});

test("sends a lead alert only when Resend secrets are set", async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response("{}", { status: 200 }); };
  try {
    const off = setup();
    await worker.fetch(post(valid), off.env, off.ctx);
    await Promise.all(off.waits);
    assert.equal(sent.length, 0);

    const on = setup({ RESEND_API_KEY: "re_test", NOTIFY_EMAIL: "founder@example.com" });
    await worker.fetch(post(valid), on.env, on.ctx);
    await Promise.all(on.waits);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, "https://api.resend.com/emails");
    assert.deepEqual(sent[0].body.to, ["founder@example.com"]);
    assert.equal(sent[0].body.reply_to, "pat@testgc.com");
    assert.match(sent[0].body.text, /Self-check: gaps: CG 20 37/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("non-API paths are served from static assets", async () => {
  const { env, ctx } = setup();
  const res = await worker.fetch(new Request("https://certiflowapp.com/missing"), env, ctx);
  assert.equal(await res.text(), "asset");
});

const ADMIN_PW = "correct horse battery";
const basic = (pw) => ({ Authorization: "Basic " + btoa("admin:" + pw) });
const getAdmin = (path, headers = {}) => new Request("https://certiflowapp.com" + path, { headers });

test("admin page is a 404 unless a strong password is configured", async () => {
  for (const pw of [undefined, "short"]) {
    const { env, ctx } = setup({ ADMIN_PASSWORD: pw, ASSETS: { fetch: async () => new Response("not found", { status: 404 }) } });
    const res = await worker.fetch(getAdmin("/admin", basic(pw || "")), env, ctx);
    assert.equal(res.status, 404);
  }
});

test("admin page requires the password", async () => {
  const { env, ctx } = setup({ ADMIN_PASSWORD: ADMIN_PW });
  const none = await worker.fetch(getAdmin("/admin"), env, ctx);
  assert.equal(none.status, 401);
  assert.match(none.headers.get("WWW-Authenticate"), /Basic/);
  assert.equal((await worker.fetch(getAdmin("/admin", basic("wrong password!!")), env, ctx)).status, 401);
  assert.equal((await worker.fetch(getAdmin("/admin", { Authorization: "Basic %%%" }), env, ctx)).status, 401);
  assert.equal((await worker.fetch(new Request("https://certiflowapp.com/admin", { method: "POST", headers: basic(ADMIN_PW) }), env, ctx)).status, 405);
});

test("admin page lists requests with all user input escaped", async () => {
  const { env, ctx } = setup({ ADMIN_PASSWORD: ADMIN_PW });
  await worker.fetch(post({ ...valid, company: "<script>alert(1)</script> GC", notes: "audit in March" }), env, ctx);
  const res = await worker.fetch(getAdmin("/admin", basic(ADMIN_PW)), env, ctx);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.match(res.headers.get("Content-Security-Policy"), /default-src 'none'/);
  const html = await res.text();
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; GC/);
  assert.match(html, /audit in March/);
  assert.match(html, /gaps: CG 20 37/);
});

test("CSV export neutralizes spreadsheet formulas", async () => {
  const { env, ctx } = setup({ ADMIN_PASSWORD: ADMIN_PW });
  await worker.fetch(post({ ...valid, company: '=HYPERLINK("http://evil.example")', notes: 'say "hi"' }), env, ctx);
  const res = await worker.fetch(getAdmin("/admin/leads.csv", basic(ADMIN_PW)), env, ctx);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type"), /text\/csv/);
  const csv = await res.text();
  assert.ok(csv.startsWith("created_at,company,"));
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil.example"")"`));
  assert.ok(csv.includes('"say ""hi"""'));
});

test("rejects invalid magic link request", async () => {
  const { env, ctx } = setup();
  const res = await worker.fetch(new Request("https://certiflowapp.com/api/auth/magic-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "invalid-email" })
  }), env, ctx);
  assert.equal(res.status, 422);
});

test("creates magic link and verifies sign-in for admin", async () => {
  const { db, env, ctx } = setup({ NOTIFY_EMAIL: "support.certiflowapp@gmail.com", ADMIN_PASSWORD: ADMIN_PW });
  const reqRes = await worker.fetch(new Request("https://certiflowapp.com/api/auth/magic-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "support.certiflowapp@gmail.com" })
  }), env, ctx);
  assert.equal(reqRes.status, 200);
  assert.equal(db.links.length, 1);
  const token = db.links[0].token;

  // Verify the magic link
  const verifyRes = await worker.fetch(new Request(`https://certiflowapp.com/api/auth/verify?token=${token}`), env, ctx);
  assert.equal(verifyRes.status, 302);
  assert.equal(verifyRes.headers.get("Location"), "https://certiflowapp.com/admin");
  assert.match(verifyRes.headers.get("Set-Cookie"), /certiflow_session=/);
  assert.ok(db.links[0].used_at);

  // Authenticate admin with session cookie
  const cookie = `certiflow_session=${token}`;
  const adminRes = await worker.fetch(new Request("https://certiflowapp.com/admin", {
    headers: { Cookie: cookie }
  }), env, ctx);
  assert.equal(adminRes.status, 200);

  // Reusing the same token fails
  const reuseRes = await worker.fetch(new Request(`https://certiflowapp.com/api/auth/verify?token=${token}`), env, ctx);
  assert.equal(reuseRes.status, 400);
});

