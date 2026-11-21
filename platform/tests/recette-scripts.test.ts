/**
 * Teste scripts/recette-securite.mjs et scripts/db-concurrency-check.mjs contre de faux serveurs Supabase :
 * un serveur conforme (les scripts doivent conclure « conforme »), puis un serveur défaillant (ils doivent échouer).
 * Les scripts ne parlent qu'en HTTP : aucune vraie base n'est touchée.
 */
import assert from "node:assert/strict";
import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, describe, test } from "node:test";

const SCRIPTS = path.resolve(import.meta.dirname, "..", "scripts");
const RECETTE = path.join(SCRIPTS, "recette-securite.mjs");
const CONCURRENCE = path.join(SCRIPTS, "db-concurrency-check.mjs");

const servers: ReturnType<typeof createServer>[] = [];
after(() => servers.forEach((s) => s.close()));

async function start(handler: (req: IncomingMessage, res: ServerResponse, body: string) => unknown): Promise<string> {
  const s = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => void handler(req, res, body));
  });
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

function run(script: string, env: Record<string, string>, args: string[] = []): Promise<{ status: number | null; out: string }> {
  return new Promise((resolve) => {
    const options: SpawnOptionsWithoutStdio = { env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...env } };
    const p = spawn("node", [script, ...args], options);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (status) => resolve({ status, out }));
  });
}

const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) =>
  res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(body));

// ───────────────────────── faux Supabase pour la recette d'isolation ─────────────────────────
type Row = Record<string, unknown>;
const A = "id-a";
const B = "id-b";

function fakeSupabase(leaky: boolean) {
  const db: Record<string, Row[]> = {
    applications: [],
    user_settings: [{ user_id: A, cv_md: "cv de A" }, { user_id: B, cv_md: "cv de B" }],
    profiles: [{ id: A, email: "a@test" }, { id: B, email: "b@test" }],
    reports: [],
    documents: [],
    runs: [],
  };
  let seq = 0;
  const WRITE: Record<string, string[]> = {
    POST: ["applications"],
    PATCH: ["applications", "user_settings"],
    DELETE: ["applications", "reports", "documents"],
  };
  const ownerCol = (t: string) => (t === "profiles" ? "id" : "user_id");

  return async (req: IncomingMessage, res: ServerResponse, body: string) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/auth/v1/token") {
      const { email } = JSON.parse(body) as { email: string };
      const id = email.startsWith("a@") ? A : B;
      return json(res, 200, { access_token: `tok:${id}`, user: { id } });
    }
    const me = (req.headers.authorization ?? "").replace("Bearer tok:", "");
    if (url.pathname === "/rest/v1/rpc/start_run") return leaky ? json(res, 200, "run-1") : json(res, 403, { code: "42501", message: "permission denied" });

    const table = url.pathname.replace("/rest/v1/", "");
    const method = req.method ?? "GET";
    const matches = (r: Row) => {
      for (const [k, v] of url.searchParams) if (v.startsWith("eq.") && String(r[k]) !== v.slice(3)) return false;
      return leaky || String(r[ownerCol(table)]) === me;
    };
    const data = body ? (JSON.parse(body) as Row) : {};
    if (method === "GET") return json(res, 200, db[table].filter(matches));
    if (method === "POST") {
      if (!leaky && (!WRITE.POST.includes(table) || data.user_id !== me)) return json(res, 403, { code: "42501", message: "violates row-level security" });
      if (!leaky && String(data.company ?? "").length > 200) return json(res, 400, { code: "23514", message: "check violation" });
      const row = { id: `row-${++seq}`, ...data };
      db[table].push(row);
      return json(res, 201, [row]);
    }
    if (!leaky && !WRITE[method]?.includes(table)) return json(res, 403, { code: "42501", message: "permission denied" });
    const hit = db[table].filter(matches);
    if (method === "PATCH") {
      if (!leaky && String(data.cv_md ?? "").length > 60000) return json(res, 400, { code: "23514", message: "check violation" });
      hit.forEach((r) => Object.assign(r, data));
      return json(res, 200, hit);
    }
    if (method === "DELETE") {
      db[table] = db[table].filter((r) => !hit.includes(r));
      return json(res, 200, hit);
    }
    return json(res, 405, {});
  };
}

const recetteEnv = (url: string) => ({
  SUPABASE_URL: url,
  SUPABASE_PUBLISHABLE_KEY: "cle-publique-factice",
  A_EMAIL: "a@test",
  A_PASSWORD: "x",
  B_EMAIL: "b@test",
  B_PASSWORD: "x",
});

describe("recette-securite.mjs", () => {
  test("sans variables : message d'usage et code 2", async () => {
    const r = await run(RECETTE, {});
    assert.equal(r.status, 2);
    assert.match(r.out, /Usage/);
    assert.match(r.out, /A_PASSWORD/);
  });

  test("base conforme : isolation confirmée, tout est nettoyé", async () => {
    const url = await start(fakeSupabase(false));
    const r = await run(RECETTE, recetteEnv(url));
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /Isolation conforme/);
    for (const attendu of [
      "applications : aucune ligne de A visible par B",
      "B ne peut pas modifier le CV de A",
      "B ne peut pas supprimer la candidature de A",
      "B ne peut pas créer une candidature au nom de A",
      "B ne peut pas appeler start_run",
      "B ne peut pas écrire dans runs",
      "nom d'entreprise de 201 caractères refusé",
      "CV de 60 001 caractères refusé",
      "CV de A restauré",
    ]) assert.ok(r.out.includes(attendu), `« ${attendu} » attendu dans :\n${r.out}`);
    assert.doesNotMatch(r.out, /✗/);
    assert.match(r.out, /\/admin doit être refusé/);
  });

  test("base sans isolation : chaque fuite est signalée et le code de sortie est 1", async () => {
    const url = await start(fakeSupabase(true));
    const r = await run(RECETTE, recetteEnv(url));
    assert.equal(r.status, 1, r.out);
    for (const fuite of ["B voit", "B a modifié le CV de A", "B a supprimé la candidature de A", "B a créé une candidature au nom de A", "B peut appeler start_run", "plafond absent"]) {
      assert.ok(r.out.includes(fuite), `« ${fuite} » attendu dans :\n${r.out}`);
    }
  });

  test("mauvais mot de passe : erreur claire, pas de trace de secret", async () => {
    const url = await start((_req, res) => json(res, 400, { error: "invalid_grant" }));
    const r = await run(RECETTE, { ...recetteEnv(url), A_PASSWORD: "mot-de-passe-secret" });
    assert.equal(r.status, 1);
    assert.match(r.out, /connexion impossible pour le compte A/);
    assert.ok(!r.out.includes("mot-de-passe-secret"));
  });
});

// ───────────────────────── faux Supabase pour le test de concurrence ─────────────────────────
function fakeStartRun(atomic: boolean) {
  const runs: string[] = [];
  let seq = 0;
  return async (req: IncomingMessage, res: ServerResponse, body: string) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/rest/v1/profiles") return json(res, 200, [{ id: "user-test" }]);
    if (url.pathname === "/rest/v1/runs" && req.method === "GET") return json(res, 206, [], { "content-range": `0-0/${runs.length}` });
    if (url.pathname === "/rest/v1/runs" && req.method === "DELETE") {
      const ids = /in\.\((.*)\)/.exec(url.searchParams.get("id") ?? "")?.[1].split(",") ?? [];
      for (const id of ids) runs.splice(runs.indexOf(id), 1);
      return void res.writeHead(204).end();
    }
    if (url.pathname === "/rest/v1/rpc/start_run") {
      const p = JSON.parse(body) as { p_user_limit: number; p_global_limit: number; p_max_concurrent: number };
      const refuse = () =>
        (p.p_max_concurrent > 0 && runs.length >= Math.max(p.p_max_concurrent, 1) && "quota:concurrent") ||
        (p.p_user_limit > 0 && runs.length >= p.p_user_limit && "quota:user_daily") ||
        (p.p_global_limit > 0 && runs.length >= p.p_global_limit && "quota:global_daily");
      const quota = refuse();
      if (!atomic) await new Promise((r) => setTimeout(r, 40)); // vérification puis écriture non atomiques : la course
      if (quota) return json(res, 400, { code: "P0001", message: quota });
      const id = `run-${++seq}`;
      runs.push(id);
      return json(res, 200, id);
    }
    return json(res, 404, {});
  };
}

const concurrenceEnv = (url: string) => ({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: "cle-factice", TEST_EMAIL: "test@exemple.com" });

describe("db-concurrency-check.mjs", () => {
  test("sans variables : message d'usage et code 2", async () => {
    const r = await run(CONCURRENCE, {});
    assert.equal(r.status, 2);
    assert.match(r.out, /SUPABASE_SERVICE_ROLE_KEY/);
  });

  test("quotas atomiques : exactement la limite démarre, les lignes de test sont supprimées", async () => {
    const url = await start(fakeStartRun(true));
    const r = await run(CONCURRENCE, concurrenceEnv(url), ["12"]);
    assert.equal(r.status, 0, r.out);
    assert.equal((r.out.match(/exactement 4 démarrage\(s\), 8 refusé\(s\)/g) ?? []).length, 3, r.out);
    assert.match(r.out, /Quotas atomiques : conforme/);
    assert.match(r.out, /supprimées de la table runs/);
  });

  test("vérification non atomique (la faille d'origine) : détectée, code 1", async () => {
    const url = await start(fakeStartRun(false));
    const r = await run(CONCURRENCE, concurrenceEnv(url), ["12"]);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /12 démarrage\(s\) au lieu de 4/);
    assert.match(r.out, /PAS atomiques/);
  });

  test("compte de test introuvable : erreur claire", async () => {
    const url = await start((_req, res) => json(res, 200, []));
    const r = await run(CONCURRENCE, concurrenceEnv(url));
    assert.equal(r.status, 1);
    assert.match(r.out, /compte de test introuvable/);
  });
});

describe("scripts de recette : hygiène", () => {
  test("aucune clé ni mot de passe écrit dans les scripts", () => {
    for (const f of [RECETTE, CONCURRENCE]) {
      const src = readFileSync(f, "utf8");
      assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]{20,}|sb_(secret|publishable)_[A-Za-z0-9]{10,}|sk-ant-|sk-or-/, path.basename(f));
    }
  });

  test("aucun tiret long dans les messages des scripts", () => {
    const dash = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    for (const f of [RECETTE, CONCURRENCE]) assert.doesNotMatch(readFileSync(f, "utf8"), dash, path.basename(f));
  });
});
