#!/usr/bin/env node
/**
 * Test de concurrence de jobhunter.start_run sur la VRAIE base (Sprint 2, S2-08).
 *
 * Il prouve que les quotas tiennent même sous requêtes simultanées : 12 appels en parallèle, avec une limite de N,
 * doivent démarrer EXACTEMENT N analyses (avant le correctif, tous passaient la vérification en même temps).
 *
 * Trois scénarios : limite par utilisateur sur 24 h, analyses simultanées par utilisateur, limite globale.
 * Les lignes créées dans `runs` sont supprimées à la fin, quoi qu'il arrive.
 *
 * Ce script a besoin de la clé service_role : lance-le TOI-MÊME, depuis ton terminal, et ne la colle nulle part
 * (ni dans le dépôt, ni dans une conversation). Elle n'est lue que dans la variable d'environnement.
 *
 *   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... TEST_EMAIL=compte-de-test@exemple.com \
 *   node platform/scripts/db-concurrency-check.mjs [nombre d'appels simultanés, 12 par défaut]
 *
 * TEST_EMAIL : un compte de test existant (pas celui d'une vraie personne). Ses analyses déjà faites aujourd'hui sont
 * prises en compte dans les limites choisies : le résultat attendu reste exact.
 * Code de sortie : 0 = conforme, 1 = échec, 2 = usage.
 */
const env = process.env;
const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "TEST_EMAIL"].filter((k) => !env[k]);
if (missing.length) {
  console.log(`Usage : définis ${missing.join(", ")} puis relance (voir l'en-tête du script).`);
  process.exit(2);
}

const URL = env.SUPABASE_URL.replace(/\/+$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const SCHEMA = env.SUPABASE_SCHEMA || "jobhunter";
const CALLS = Math.max(4, Number.parseInt(process.argv[2] ?? "12", 10) || 12);
const WANT = Math.max(2, Math.floor(CALLS / 3)); // nombre de démarrages attendus dans chaque scénario

// Les nouvelles clés « sb_secret_… » ne sont pas des JWT : elles ne se placent que dans l'en-tête apikey.
const authHeaders = () => (KEY.startsWith("sb_") ? { apikey: KEY } : { apikey: KEY, Authorization: `Bearer ${KEY}` });

let fails = 0;
const color = (c, s) => (process.stdout.isTTY ? `\x1b[${c}m${s}\x1b[0m` : s);
const ok = (m) => console.log(`  ${color(32, "✓")} ${m}`);
const ko = (m) => {
  fails++;
  console.log(`  ${color(31, "✗")} ${m}`);
};

async function rest(method, path, { body, headers = {} } = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: { ...authHeaders(), "Content-Type": "application/json", "Accept-Profile": SCHEMA, "Content-Profile": SCHEMA, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* corps non JSON */
  }
  return { status: res.status, ok: res.ok, json, range: res.headers.get("content-range") };
}

async function count(query) {
  const r = await rest("GET", `runs?select=id&${query}`, { headers: { Prefer: "count=exact", Range: "0-0" } });
  const total = Number.parseInt(r.range?.split("/")[1] ?? "", 10);
  if (!(r.status < 300) || Number.isNaN(total)) throw new Error(`comptage impossible (HTTP ${r.status}) : clé service_role correcte ? schéma « ${SCHEMA} » exposé ?`);
  return total;
}

const created = [];
async function startRun(userId, limits) {
  const r = await rest("POST", "rpc/start_run", {
    body: { p_user_id: userId, p_kind: "evaluate", p_input: { recette: "concurrence" }, p_application_id: null, ...limits },
  });
  if (r.ok && typeof r.json === "string") {
    created.push(r.json);
    return "started";
  }
  const message = String(r.json?.message ?? "");
  return message.startsWith("quota:") ? message : `erreur HTTP ${r.status} ${message}`.trim();
}

async function scenario(title, userId, limits, expected) {
  console.log(title);
  const results = await Promise.all(Array.from({ length: CALLS }, () => startRun(userId, limits)));
  const started = results.filter((x) => x === "started").length;
  const refused = results.filter((x) => x.startsWith("quota:")).length;
  const other = results.filter((x) => x !== "started" && !x.startsWith("quota:"));
  if (other.length) ko(`${other.length} appel(s) en erreur inattendue : ${[...new Set(other)].join(" | ")}`);
  if (started === expected && refused === CALLS - expected) {
    ok(`${CALLS} appels simultanés → exactement ${started} démarrage(s), ${refused} refusé(s) pour quota`);
  } else {
    ko(`${CALLS} appels simultanés → ${started} démarrage(s) au lieu de ${expected} (${refused} refusé(s) pour quota) : les quotas ne sont PAS atomiques !`);
  }
  // On libère avant le scénario suivant, pour qu'ils ne se faussent pas.
  await cleanup();
}

async function cleanup() {
  while (created.length) {
    const ids = created.splice(0, 50);
    const r = await rest("DELETE", `runs?id=in.(${ids.join(",")})`, { headers: { Prefer: "return=minimal" } });
    if (!r.ok) ko(`suppression des analyses de test impossible (HTTP ${r.status}) : supprime à la main les lignes de runs dont input = {"recette":"concurrence"}`);
  }
}

async function main() {
  console.log(`Test de concurrence de ${SCHEMA}.start_run (${CALLS} appels simultanés, ${WANT} démarrages attendus)`);
  const who = await rest("GET", `profiles?email=eq.${encodeURIComponent(env.TEST_EMAIL)}&select=id`);
  const userId = Array.isArray(who.json) ? who.json[0]?.id : undefined;
  if (!who.ok || !userId) throw new Error(`compte de test introuvable pour ${env.TEST_EMAIL} (HTTP ${who.status})`);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const costs = "or=(status.neq.failed,provider.not.is.null)";
  const stale = new Date(Date.now() - 12 * 60 * 1000).toISOString();
  try {
    const usedByUser = await count(`user_id=eq.${userId}&created_at=gte.${since}&${costs}`);
    const runningByUser = await count(`user_id=eq.${userId}&status=eq.running&created_at=gt.${stale}`);
    const usedGlobal = await count(`created_at=gte.${since}&${costs}`);

    await scenario("Limite par utilisateur sur 24 h", userId, { p_user_limit: usedByUser + WANT, p_global_limit: 0, p_max_concurrent: 1000 }, WANT);
    await scenario("Analyses simultanées par utilisateur", userId, { p_user_limit: 0, p_global_limit: 0, p_max_concurrent: runningByUser + WANT }, WANT);
    await scenario("Limite globale (tous utilisateurs)", userId, { p_user_limit: 0, p_global_limit: usedGlobal + WANT, p_max_concurrent: 1000 }, WANT);
  } finally {
    await cleanup();
    ok("analyses de test supprimées de la table runs");
  }
  console.log();
  if (fails === 0) {
    console.log(color(32, "Quotas atomiques : conforme."));
    return 0;
  }
  console.log(color(31, `${fails} contrôle(s) en échec.`));
  return 1;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.log(`  ${color(31, "✗")} ${e.message}`);
    process.exit(1);
  },
);
