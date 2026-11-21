/**
 * Le client Supabase doit viser le schéma dédié (en-têtes Accept-Profile / Content-Profile), jamais « public ».
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { DEFAULT_DB_SCHEMA, dbSchema } from "../src/lib/env.ts";
import { createAdminClient } from "../src/lib/supabase/admin.ts";

const KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_SCHEMA"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;
let seen: Array<{ method: string; url: string; headers: Record<string, string> }> = [];

beforeEach(() => {
  seen = [];
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key-test";
  delete process.env.SUPABASE_DB_SCHEMA;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    seen.push({ method: init?.method ?? "GET", url: String(input), headers });
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

test("par défaut le schéma est « jobhunter », jamais « public »", () => {
  assert.equal(DEFAULT_DB_SCHEMA, "jobhunter");
  assert.equal(dbSchema(), "jobhunter");
});

test("SUPABASE_DB_SCHEMA : valeur valide acceptée, valeur douteuse refusée (elle part dans un en-tête HTTP)", () => {
  process.env.SUPABASE_DB_SCHEMA = "mon_schema2";
  assert.equal(dbSchema(), "mon_schema2");
  for (const bad of ["Public Schema", "a;drop table x", "x\r\nHost: evil", "1abc", "", "a".repeat(64)]) {
    process.env.SUPABASE_DB_SCHEMA = bad;
    assert.equal(dbSchema(), "jobhunter", `refusé : ${JSON.stringify(bad)}`);
  }
});

test("lecture : l'en-tête Accept-Profile vise le schéma dédié", async () => {
  await createAdminClient().from("runs").select("id");
  assert.equal(seen[0].headers["accept-profile"], "jobhunter");
  assert.match(seen[0].url, /\/rest\/v1\/runs/);
});

test("écriture et appel de fonction : l'en-tête Content-Profile vise le schéma dédié", async () => {
  const db = createAdminClient();
  await db.from("reports").insert({ markdown: "x" });
  await db.rpc("start_run", { p_user_id: "00000000-0000-0000-0000-000000000000" });
  assert.equal(seen[0].headers["content-profile"], "jobhunter");
  assert.equal(seen[1].headers["content-profile"], "jobhunter");
  assert.match(seen[1].url, /\/rest\/v1\/rpc\/start_run/);
});

test("un schéma personnalisé est bien utilisé", async () => {
  process.env.SUPABASE_DB_SCHEMA = "autre";
  await createAdminClient().from("runs").select("id");
  assert.equal(seen[0].headers["accept-profile"], "autre");
});
