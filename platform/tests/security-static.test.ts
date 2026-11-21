/**
 * Garde-fous « statiques » : ils échouent si un futur changement réintroduit une faille classique
 * (secret côté client, HTML brut, action sans authentification, nouvelle route non revue…).
 * Un échec ici n'est pas forcément un bug : c'est un point à REVOIR consciemment, puis à mettre à jour ici.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
const read = (f: string) => readFileSync(f, "utf8");
const clientFiles = files.filter((f) => /^\s*["']use client["']/.test(read(f)));

test("les composants client n'importent aucun module serveur (seulement des types)", () => {
  const SERVER_ONLY = /from\s+["']@\/lib\/(supabase\/|runs|llm|start-run|auth|quota|jd\/|engine\/(?!profile)|env|rate-limit|origin|data)/;
  assert.ok(clientFiles.length >= 6, "des composants client sont attendus");
  const bad: string[] = [];
  for (const f of clientFiles) {
    for (const line of read(f).split("\n")) {
      if (/^import\s/.test(line) && SERVER_ONLY.test(line) && !/^import\s+type\s/.test(line)) bad.push(`${rel(f)} : ${line.trim()}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("les clés secrètes ne sont lues que dans env.ts et llm/index.ts", () => {
  const SECRET = /process\.env\.(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|ANTHROPIC_API_KEY|OPENROUTER_API_KEY)/;
  const where = files.filter((f) => SECRET.test(read(f))).map(rel).sort();
  assert.deepEqual(where, ["lib/env.ts", "lib/llm/index.ts"]);
});

test("aucune clé secrète n'a un nom NEXT_PUBLIC_ (exposé au navigateur)", () => {
  for (const f of [...files, path.join(ROOT, ".env.example"), path.join(ROOT, "Dockerfile")]) {
    assert.doesNotMatch(read(f), /NEXT_PUBLIC_[A-Z_]*(SERVICE|SECRET|ANTHROPIC|OPENROUTER)/, rel(f));
  }
});

test("pas d'API d'injection de HTML ni d'évaluation de code", () => {
  const FORBIDDEN = /dangerouslySetInnerHTML|rehype-raw|\.innerHTML\s*=|\beval\(|new Function\(/;
  assert.deepEqual(files.filter((f) => FORBIDDEN.test(read(f))).map(rel), []);
  assert.doesNotMatch(readFileSync(path.join(ROOT, "package.json"), "utf8"), /rehype-raw/);
});

test("chaque Server Action authentifie l'appelant (sauf connexion et lien magique)", () => {
  const PUBLIC = new Set(["signInWithPassword", "sendMagicLink"]);
  const actionFiles = files.filter((f) => rel(f).startsWith("actions/"));
  assert.ok(actionFiles.length >= 4);
  const bad: string[] = [];
  for (const f of actionFiles) {
    const src = read(f);
    assert.match(src, /^\s*["']use server["']/, `${rel(f)} doit déclarer "use server"`);
    const parts = src.split(/^export async function /m).slice(1);
    for (const part of parts) {
      const name = part.slice(0, part.indexOf("("));
      if (PUBLIC.has(name)) continue;
      if (!/await requireUser\(\)|await requireAdmin\(\)/.test(part)) bad.push(`${rel(f)} : ${name}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("pages privées : layout authentifié, page admin réservée, API protégée", () => {
  assert.match(read(path.join(SRC, "app/(app)/layout.tsx")), /await requireUser\(\)/);
  assert.match(read(path.join(SRC, "app/(app)/admin/page.tsx")), /await requireAdmin\(\)/);
  assert.match(read(path.join(SRC, "app/api/runs/[id]/route.ts")), /getSessionUser\(\)/);
  assert.match(read(path.join(SRC, "proxy.ts")), /updateSession/);
});

test("inventaire des routes : toute nouvelle route doit être revue (auth ou public justifié)", () => {
  const routes = files.filter((f) => /\/route\.ts$/.test(f)).map(rel).sort();
  assert.deepEqual(routes, ["app/api/health/route.ts", "app/api/runs/[id]/route.ts", "app/auth/confirm/route.ts", "app/auth/signout/route.ts"]);
  assert.match(read(path.join(SRC, "app/auth/signout/route.ts")), /isSameOriginRequest/);
});

test("le client « service role » n'est utilisé que dans des fichiers serveur connus", () => {
  const where = files.filter((f) => /createAdminClient\(/.test(read(f)) && rel(f) !== "lib/supabase/admin.ts").map(rel).sort();
  assert.deepEqual(where, [
    "app/(app)/admin/page.tsx",
    "app/(app)/page.tsx",
    "app/(app)/runs/[id]/page.tsx",
    "app/api/runs/[id]/route.ts",
    "lib/start-run.ts",
  ]);
});

test("le démarrage d'une analyse passe par la fonction SQL atomique start_run", () => {
  const src = read(path.join(SRC, "lib/start-run.ts"));
  assert.match(src, /\.rpc\("start_run"/);
  assert.doesNotMatch(src, /from\("runs"\)\s*\.insert/);
});

test("les clients Supabase visent le schéma dédié, et aucun code n'adresse « public » (sauf l'API d'auth)", () => {
  for (const f of ["lib/supabase/server.ts", "lib/supabase/admin.ts"]) {
    assert.match(read(path.join(SRC, f)), /db:\s*\{\s*schema:\s*dbSchema\(\)\s*\}/, `${f} doit fixer db.schema`);
  }
  const bad = files.filter((f) => /\.schema\(\s*["']public["']\s*\)|from\(\s*["']public\./.test(read(f))).map(rel);
  assert.deepEqual(bad, []);
});

test("impression : la mise en page de l'application ne déborde pas sur une page blanche", () => {
  const css = readFileSync(path.join(SRC, "app/globals.css"), "utf8");
  const print = css.slice(css.indexOf("@media print"));
  assert.match(print, /\.app-shell\s*\{[^}]*min-height:\s*0/);
  assert.match(read(path.join(SRC, "app/(app)/layout.tsx")), /app-shell/);
});

test("typographie : aucun tiret long ni demi-cadratin dans l'interface, les messages et les consignes au modèle", () => {
  const DASH = /[\u2014\u2013\u2015\u2012]/;
  // report.ts LIT des titres produits par le modèle (il doit connaître ces caractères) ; text.ts les remplace.
  const EXCLUDED = new Set(["lib/engine/report.ts", "lib/text.ts"]);
  const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const offenders: string[] = [];
  for (const f of files) {
    if (EXCLUDED.has(rel(f))) continue;
    stripComments(read(f)).split("\n").forEach((line, i) => {
      if (DASH.test(line)) offenders.push(`${rel(f)}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test("typographie : l'affichage et la copie passent par normalizeDashes (contenus déjà en base compris)", () => {
  assert.match(read(path.join(SRC, "components/Markdown.tsx")), /normalizeDashes\(children\)/);
  assert.match(read(path.join(SRC, "app/(app)/applications/[id]/page.tsx")), /text=\{normalizeDashes\(report\.markdown\)\}/);
  assert.match(read(path.join(SRC, "app/(app)/documents/[id]/page.tsx")), /text=\{normalizeDashes\(doc\.markdown\)\}/);
});

test("en-têtes de sécurité : CSP stricte, HSTS, anti-framing", () => {
  const cfg = readFileSync(path.join(ROOT, "next.config.mjs"), "utf8");
  for (const needle of ["Content-Security-Policy", "frame-ancestors 'none'", "object-src 'none'", "img-src 'self' data:", "base-uri 'self'", "form-action 'self'", "Strict-Transport-Security", "X-Content-Type-Options", "Permissions-Policy"]) {
    assert.ok(cfg.includes(needle), `next.config.mjs doit contenir « ${needle} »`);
  }
});

test("Docker : exécution sans privilèges, aucun secret dans l'image", () => {
  const d = readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
  assert.match(d, /^USER node$/m);
  assert.doesNotMatch(d, /^\s*(ENV|ARG)\s+\w*(KEY|SECRET|TOKEN|PASSWORD)/im);
  assert.doesNotMatch(d, /COPY[^\n]*\.env(\s|$)/);
  assert.match(readFileSync(path.join(ROOT, ".dockerignore"), "utf8"), /^\.env$/m);
  assert.match(readFileSync(path.join(ROOT, "docker-compose.yml"), "utf8"), /127\.0\.0\.1:3000:3000/);
});

test("aucun fichier .env réel n'est suivi par git", () => {
  let tracked: string[] = [];
  try {
    tracked = execFileSync("git", ["ls-files", "--", "."], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    return; // pas de dépôt git (ex. archive) : rien à vérifier
  }
  assert.deepEqual(tracked.filter((f) => /(^|\/)\.env(\.[^/]*)?$/.test(f) && !f.endsWith(".env.example")), []);
});
