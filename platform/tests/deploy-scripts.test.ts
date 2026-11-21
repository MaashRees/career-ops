/**
 * Teste scripts/post-deploy-check.sh contre de faux serveurs : un serveur conforme, puis un serveur « ouvert à tous ».
 * (Le script est en lecture seule : requêtes HTTP uniquement.)
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, describe, test } from "node:test";

const SCRIPT = path.resolve(import.meta.dirname, "..", "scripts", "post-deploy-check.sh");
const EXPOSURE = path.resolve(import.meta.dirname, "..", "scripts", "supabase-exposure-check.sh");
const SECURE_HEADERS = {
  "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
};

function compliant(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? "/";
  if (url === "/api/health") return void res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
  if (url === "/login") return void res.writeHead(200, SECURE_HEADERS).end("login");
  if (url.startsWith("/api/runs/")) return void res.writeHead(401).end("{}");
  if (url === "/auth/signout") return void res.writeHead(403).end("{}");
  return void res.writeHead(307, { location: "/login" }).end();
}
const open = (_req: IncomingMessage, res: ServerResponse) => void res.writeHead(200, { "x-powered-by": "Express" }).end("tout est ouvert");

const servers: ReturnType<typeof createServer>[] = [];
async function start(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  const s = createServer(handler);
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}
// spawnSync bloquerait la boucle d'événements du faux serveur : on passe par un processus asynchrone.
function run(url: string, script = SCRIPT, extra: string[] = []): Promise<{ status: number | null; out: string }> {
  return new Promise((resolve) => {
    import("node:child_process").then(({ spawn }) => {
      const p = spawn("sh", [script, url, ...extra]);
      let out = "";
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => (out += d));
      p.on("close", (status) => resolve({ status, out }));
    });
  });
}
after(() => servers.forEach((s) => s.close()));

describe("post-deploy-check.sh", () => {
  test("sans argument : message d'usage et code 2", () => {
    const r = spawnSync("sh", [SCRIPT], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.match(r.stdout, /Usage/);
  });

  test("serveur conforme en http : tout est ✓ sauf l'exigence https (seul échec)", async () => {
    const { status, out } = await run(await start(compliant));
    assert.equal(status, 1);
    assert.match(out, /1 contrôle\(s\) en échec/);
    assert.match(out, /n'est pas en https/);
    for (const ok of ["/api/health répond", "redirige vers la connexion", "API sans connexion → 401", "déconnexion sans origine → 403", "Content-Security-Policy", "anti-framing", "nosniff"]) {
      assert.ok(out.includes(ok), `« ${ok} » attendu`);
    }
  });

  test("serveur ouvert à tous : les contrôles d'accès et d'en-têtes échouent", async () => {
    const { status, out } = await run(await start(open));
    assert.equal(status, 1);
    assert.match(out, /\/api\/health ne répond pas correctement/);
    assert.match(out, /API sans connexion renvoie 200/);
    assert.match(out, /déconnexion sans origine renvoie 200/);
    assert.match(out, /Content-Security-Policy absente/);
    assert.match(out, /X-Powered-By exposé/);
  });

  test("serveur injoignable : échec, pas de plantage", async () => {
    const { status, out } = await run("http://127.0.0.1:9");
    assert.equal(status, 1);
    assert.match(out, /ne répond pas correctement/);
  });
});

// Faux « Supabase » : se comporte comme PostgREST selon le profil de schéma demandé.
function fakeSupabase(mode: "good" | "public-exposed" | "schema-not-exposed" | "anon-readable") {
  return (req: IncomingMessage, res: ServerResponse) => {
    const profile = String(req.headers["accept-profile"] ?? req.headers["content-profile"] ?? "public");
    const url = req.url ?? "";
    const json = (code: number, body: unknown) => void res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (url === "/rest/v1/") return json(200, { paths: mode === "public-exposed" ? { "/applications": {}, "/runs": {} } : { "/": {} } });
    if (profile === "public") return mode === "public-exposed" ? json(200, []) : json(404, { code: "PGRST205" });
    if (mode === "schema-not-exposed") return json(406, { code: "PGRST106" });
    if (mode === "anon-readable") return json(200, [{ id: 1 }]);
    return json(401, { code: "42501", message: "permission denied for schema jobhunter" });
  };
}

describe("supabase-exposure-check.sh", () => {
  test("sans argument : usage et code 2", () => {
    assert.equal(spawnSync("sh", [EXPOSURE], { encoding: "utf8" }).status, 2);
  });
  test("configuration conforme : tout est ✓", async () => {
    const { status, out } = await run(await start(fakeSupabase("good")), EXPOSURE, ["cle-publique"]);
    assert.equal(status, 0, out);
    assert.match(out, /Exposition conforme/);
    assert.match(out, /exposé mais fermé aux anonymes/);
  });
  test("tables restées dans public : échec", async () => {
    const { status, out } = await run(await start(fakeSupabase("public-exposed")), EXPOSURE, ["cle-publique"]);
    assert.equal(status, 1);
    assert.match(out, /public expose encore des tables/);
    assert.match(out, /lisible dans public/);
  });
  test("schéma dédié non exposé (406) : échec avec la marche à suivre", async () => {
    const { status, out } = await run(await start(fakeSupabase("schema-not-exposed")), EXPOSURE, ["cle-publique"]);
    assert.equal(status, 1);
    assert.match(out, /PAS exposé/);
    assert.match(out, /Exposed schemas/);
  });
  test("données lisibles par un anonyme : échec", async () => {
    const { status, out } = await run(await start(fakeSupabase("anon-readable")), EXPOSURE, ["cle-publique"]);
    assert.equal(status, 1);
    assert.match(out, /lisibles/);
  });
});
