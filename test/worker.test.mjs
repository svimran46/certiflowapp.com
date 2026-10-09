// Tests for the audit-request API in src/worker.js, using an in-memory stand-in for D1.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

function fakeDb() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.startsWith("SELECT COUNT(*)")) return { n: rows.filter((r) => r[6] === args[0]).length };
              throw new Error("unexpected query: " + sql);
            },
            async run() {
              if (sql.startsWith("INSERT INTO audit_requests")) rows.push(args);
              else throw new Error("unexpected query: " + sql);
              return { success: true };
            }
          };
        }
      };
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
