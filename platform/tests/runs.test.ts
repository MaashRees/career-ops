import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeRun, sweepIfStale, STALE_RUN_MS } from "../src/lib/runs.ts";
import type { Run } from "../src/lib/types.ts";
import { FakeDb } from "./helpers/fake-db.ts";

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

const JD = "Product Marketing Manager chez Acme. ".repeat(20);
const REPORT = (score = "4.2/5", extra = "") => `# Evaluation: Acme — Product Marketing Manager

**Date:** 2026-11-20
**URL:** https://acme.com/jobs/42
**Archetype:** Not a target — closest default: PMM
**Score:** ${score}
**Decision:** Apply
**Legitimacy:** High Confidence

${"Analyse détaillée du poste et du profil. ".repeat(40)}
${extra}
## A) Role Summary
| Champ | Valeur |
`;

const KEYS = ["ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "LLM_PROVIDER", "LLM_FALLBACK"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const realFetch = globalThis.fetch;
let anthropicBodies: any[] = [];
let reply: () => string = () => REPORT();
let stopReason = "end_turn";

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  anthropicBodies = [];
  reply = () => REPORT();
  stopReason = "end_turn";
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    anthropicBodies.push(JSON.parse(String(init.body)));
    return new Response(
      JSON.stringify({
        content: [{ type: "text", text: reply() }],
        stop_reason: stopReason,
        usage: { input_tokens: 30000, output_tokens: 4000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }),
      { status: 200 },
    );
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function newRun(db: FakeDb, kind: string, input: Record<string, unknown>, userId = USER): string {
  const row = { id: crypto.randomUUID(), user_id: userId, kind, input, status: "running", created_at: new Date().toISOString(), provider: null, error: null, output: null, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 };
  db.tables.runs.push(row);
  return row.id;
}
const asClient = (db: FakeDb) => db as unknown as SupabaseClient;
const runRow = (db: FakeDb, id: string) => db.tables.runs.find((r) => r.id === id)! as Record<string, any>;

test("évaluation d'un texte collé : candidature + rapport + usage enregistrés", async () => {
  const db = new FakeDb();
  db.seedSettings(USER);
  const id = newRun(db, "evaluate", { jd_text: JD, url: "https://acme.com/jobs/42?utm_source=x", depth: "essential" });
  await executeRun(asClient(db), id);

  const run = runRow(db, id);
  assert.equal(run.status, "done", run.error);
  assert.equal(run.result_type, "report");
  assert.equal(run.provider, "anthropic");
  assert.equal(run.input_tokens, 30000);

  const [app] = db.tables.applications as Array<Record<string, any>>;
  assert.equal(app.company, "Acme");
  assert.equal(app.role, "Product Marketing Manager");
  assert.equal(app.score, 4.2);
  assert.equal(app.status, "Evaluated");
  assert.equal(app.num, 1);
  assert.equal(app.user_id, USER);
  assert.equal(app.url_key, "https://acme.com/jobs/42");

  const [report] = db.tables.reports as Array<Record<string, any>>;
  assert.match(report.markdown, /## Job Description \(archived verbatim\)/);
  assert.equal(report.application_id, app.id);

  // Le CV de l'utilisateur est bien dans le prompt système, l'offre dans le message, et le cache est demandé.
  const body = anthropicBodies[0];
  assert.match(body.system[0].text, /Jane Dupont/);
  assert.match(body.system[0].text, /Lancé 3 produits/);
  assert.equal(body.system[0].cache_control.type, "ephemeral");
  assert.match(body.messages[0].content, /<job_posting>/);
  assert.equal(body.model, "claude-sonnet-5-5");
});

test("même URL réévaluée : on met à jour la candidature, sans doublon, statut conservé", async () => {
  const db = new FakeDb();
  db.seedSettings(USER);
  await executeRun(asClient(db), newRun(db, "evaluate", { jd_text: JD, url: "https://acme.com/jobs/42" }));
  (db.tables.applications[0] as any).status = "Applied";
  reply = () => REPORT("3.6/5");
  await executeRun(asClient(db), newRun(db, "evaluate", { jd_text: JD, url: "https://acme.com/jobs/42/?utm_campaign=z" }));

  assert.equal(db.tables.applications.length, 1);
  const app = db.tables.applications[0] as any;
  assert.equal(app.score, 3.6);
  assert.equal(app.status, "Applied");
  assert.equal(db.tables.reports.length, 2);
});

test("deux offres différentes : numéros 1 puis 2", async () => {
  const db = new FakeDb();
  db.seedSettings(USER);
  await executeRun(asClient(db), newRun(db, "evaluate", { jd_text: JD, url: "https://acme.com/jobs/1" }));
  await executeRun(asClient(db), newRun(db, "evaluate", { jd_text: JD, url: "https://acme.com/jobs/2" }));
  assert.deepEqual((db.tables.applications as any[]).map((a) => a.num), [1, 2]);
});

test("sans CV : échec propre, aucun appel IA", async () => {
  const db = new FakeDb();
  db.seedSettings(USER, { cv_md: "" });
  const id = newRun(db, "evaluate", { jd_text: JD });
  await executeRun(asClient(db), id);
  const run = runRow(db, id);
  assert.equal(run.status, "failed");
  assert.equal(run.error_code, "no_cv");
  assert.equal(anthropicBodies.length, 0);
});

test("texte collé trop court ou entrée vide : échec sans appel IA", async () => {
  const db = new FakeDb();
  db.seedSettings(USER);
  const a = newRun(db, "evaluate", { jd_text: "trop court" });
  const b = newRun(db, "evaluate", {});
  await executeRun(asClient(db), a);
  await executeRun(asClient(db), b);
  assert.equal(runRow(db, a).error_code, "jd_short");
  assert.equal(runRow(db, b).error_code, "no_input");
  assert.equal(anthropicBodies.length, 0);
});

test("URL interne refusée avant tout appel réseau (SSRF)", async () => {
  const db = new FakeDb();
  db.seedSettings(USER);
  const id = newRun(db, "evaluate", { url: "http://169.254.169.254/latest/meta-data/" });
  await executeRun(asClient(db), id);
  assert.equal(runRow(db, id).status, "failed");
  assert.equal(runRow(db, id).error_code, "jd_unsafe_url");
  assert.equal(anthropicBodies.length, 0);
});

test("LinkedIn : on demande de coller le texte", async () => {
  const db = new FakeDb();
  db.seedSettings(USER);
  const id = newRun(db, "evaluate", { url: "https://www.linkedin.com/jobs/view/123" });
  await executeRun(asClient(db), id);
  assert.equal(runRow(db, id).error_code, "jd_linkedin");
});

test("règle bloquante : needs_confirmation, rien n'est enregistré, usage conservé", async () => {
  const db = new FakeDb();
  db.seedSettings(USER);
  reply = () => 'needs_confirmation: dealbreaker "Pas de poste 100 % sur site" - 5 jours sur site par semaine';
  const id = newRun(db, "evaluate", { jd_text: JD, url: "https://acme.com/jobs/9" });
  await executeRun(asClient(db), id);
  const run = runRow(db, id);
  assert.equal(run.status, "failed");
  assert.equal(run.error_code, "needs_confirmation");
  assert.match(run.error, /5 jours sur site/);
  assert.equal(run.input_tokens, 30000);
  assert.equal(db.tables.applications.length, 0);
  assert.equal(db.tables.reports.length, 0);
});

test("rapport tronqué mais avec sa note : enregistré avec un avertissement visible", async () => {
  const db = new FakeDb();
  db.seedSettings(USER);
  stopReason = "max_tokens";
  const id = newRun(db, "evaluate", { jd_text: JD, url: "https://acme.com/jobs/77" });
  await executeRun(asClient(db), id);
  assert.equal(runRow(db, id).status, "done", runRow(db, id).error);
  const [report] = db.tables.reports as Array<Record<string, any>>;
  assert.match(report.markdown, /Rapport tronqué/);
  assert.equal((db.tables.applications[0] as any).score, 4.2);
  assert.equal(anthropicBodies[0].max_tokens, 12000);
});

test("rapport coupé AVANT la note : échec clair, usage conservé, rien d'enregistré", async () => {
  const db = new FakeDb();
  db.seedSettings(USER);
  stopReason = "max_tokens";
  reply = () => "# Evaluation: Acme — PM\n\nDébut de l'analyse sans jamais arriver à la note. ".repeat(20);
  const id = newRun(db, "evaluate", { jd_text: JD });
  await executeRun(asClient(db), id);
  const run = runRow(db, id);
  assert.equal(run.status, "failed");
  assert.equal(run.error_code, "truncated");
  assert.equal(run.input_tokens, 30000);
  assert.equal(db.tables.reports.length, 0);
});

test("lettre ou CV tronqués : refusés (un document incomplet serait trompeur)", async () => {
  const db = new FakeDb();
  db.seedSettings(USER);
  await executeRun(asClient(db), newRun(db, "evaluate", { jd_text: JD, url: "https://acme.com/jobs/42" }));
  const appId = (db.tables.applications[0] as any).id;
  stopReason = "max_tokens";
  reply = () => "Madame, Monsieur, " + "Je souhaite rejoindre Acme. ".repeat(20);
  const id = newRun(db, "cover_letter", { application_id: appId });
  await executeRun(asClient(db), id);
  assert.equal(runRow(db, id).status, "failed");
  assert.equal(runRow(db, id).error_code, "llm_error");
  assert.equal(db.tables.documents.length, 0);
});

test("aucun tiret long enregistré (rapport, lettre, CV adapté), mais l'offre archivée reste telle quelle", async () => {
  const EM = "\u2014", EN = "\u2013";
  const db = new FakeDb();
  db.seedSettings(USER);
  const jdWithDash = `Chef de projet ${EM} équipe produit (2020${EN}2023). ` + "Missions variées. ".repeat(20);
  reply = () => REPORT().replace("Analyse détaillée", `Analyse ${EM} détaillée (2020${EN}2023)`);
  const evalId = newRun(db, "evaluate", { jd_text: jdWithDash, url: "https://acme.com/jobs/55" });
  await executeRun(asClient(db), evalId);
  assert.equal(runRow(db, evalId).status, "done", String(runRow(db, evalId).error));
  const [report] = db.tables.reports as Array<Record<string, any>>;
  const body = report.markdown.split("## Job Description (archived verbatim)")[0];
  assert.doesNotMatch(body, /[\u2014\u2013]/);
  assert.match(body, /# Evaluation: Acme - Product Marketing Manager/);
  assert.equal((db.tables.applications[0] as any).company, "Acme");
  assert.match(report.markdown, new RegExp(`Chef de projet ${EM} équipe produit`)); // archive verbatim : inchangée
  assert.match(report.jd_text, new RegExp(EM));

  const appId = (db.tables.applications[0] as any).id;
  reply = () => `Madame, Monsieur ${EM} merci.\n\n` + `Je souhaite rejoindre Acme (2020${EN}2023). `.repeat(12);
  await executeRun(asClient(db), newRun(db, "cover_letter", { application_id: appId }));
  assert.doesNotMatch((db.tables.documents[0] as any).markdown, /[\u2014\u2013]/);

  reply = () => `# Jane Dupont\n\n## Experience\n### Acme ${EM} Paris\n**PMM**\n2019 ${EN} 2024\n` + "- Lancé 3 produits\n".repeat(10);
  await executeRun(asClient(db), newRun(db, "tailored_cv", { application_id: appId }));
  const cv = (db.tables.documents[1] as any).markdown as string;
  assert.doesNotMatch(cv, /[\u2014\u2013]/);
  assert.match(cv, /### Acme - Paris/);
  assert.match(cv, /2019 - 2024/);
});

test("réponse qui n'est pas un rapport : rejetée, rien d'enregistré", async () => {
  const db = new FakeDb();
  db.seedSettings(USER);
  reply = () => '<tool_call>{"name":"browser_navigate"}</tool_call>';
  const id = newRun(db, "evaluate", { jd_text: JD });
  await executeRun(asClient(db), id);
  assert.equal(runRow(db, id).error_code, "bad_report");
  assert.equal(db.tables.applications.length, 0);
});

test("échec fournisseur : message utilisateur, aucune clé dans l'erreur", async () => {
  const db = new FakeDb();
  db.seedSettings(USER);
  globalThis.fetch = (async () => new Response("invalid key sk-ant-test-LEAKME123456789", { status: 401 })) as typeof fetch;
  const id = newRun(db, "evaluate", { jd_text: JD });
  await executeRun(asClient(db), id);
  const run = runRow(db, id);
  assert.equal(run.error_code, "llm_error");
  assert.doesNotMatch(String(run.error), /LEAKME/);
});

test("lettre de motivation : généré à partir du rapport de SA candidature uniquement", async () => {
  const db = new FakeDb();
  db.seedSettings(USER);
  await executeRun(asClient(db), newRun(db, "evaluate", { jd_text: JD, url: "https://acme.com/jobs/42" }));
  const appId = (db.tables.applications[0] as any).id;

  reply = () => "Madame, Monsieur,\n\n" + "Je souhaite rejoindre Acme pour y lancer des produits. ".repeat(12);
  const id = newRun(db, "cover_letter", { application_id: appId });
  await executeRun(asClient(db), id);
  assert.equal(runRow(db, id).status, "done");
  const [doc] = db.tables.documents as any[];
  assert.equal(doc.kind, "cover_letter");
  assert.equal(doc.user_id, USER);

  // Un autre utilisateur ne peut pas viser cette candidature.
  db.seedSettings(OTHER);
  const intrus = newRun(db, "cover_letter", { application_id: appId }, OTHER);
  await executeRun(asClient(db), intrus);
  assert.equal(runRow(db, intrus).status, "failed");
  assert.equal(runRow(db, intrus).error_code, "no_application");
});

test("CV adapté : signale les chiffres absents du CV d'origine", async () => {
  const db = new FakeDb();
  db.seedSettings(USER);
  await executeRun(asClient(db), newRun(db, "evaluate", { jd_text: JD, url: "https://acme.com/jobs/42" }));
  const appId = (db.tables.applications[0] as any).id;
  reply = () => "# Jane Dupont\n\n## Experience\n### Acme — Paris\n**Product Marketing Manager**\n2019 – 2024\n- Lancé 3 produits, +90% de revenus, équipe de 15 personnes\n" + "- Responsable du go-to-market.\n".repeat(8);
  const id = newRun(db, "tailored_cv", { application_id: appId });
  await executeRun(asClient(db), id);
  const [doc] = db.tables.documents as any[];
  assert.equal(doc.kind, "tailored_cv");
  assert.deepEqual([...doc.warnings].sort(), ["15", "90"]);
});

test("import de CV : sortie conservée pour validation, modèle économique", async () => {
  const db = new FakeDb();
  db.seedSettings(USER, { cv_md: "" });
  reply = () => "# Jane Dupont\n\n## Experience\n- Poste";
  const id = newRun(db, "cv_import", { text: "Jane Dupont\nExperience ".repeat(20) });
  await executeRun(asClient(db), id);
  const run = runRow(db, id);
  assert.equal(run.status, "done");
  assert.match(run.output, /^# Jane Dupont/);
  assert.equal(anthropicBodies[0].model, "claude-haiku-5-5");
});

test("executeRun ignore une analyse déjà terminée", async () => {
  const db = new FakeDb();
  db.seedSettings(USER);
  const id = newRun(db, "evaluate", { jd_text: JD });
  runRow(db, id).status = "done";
  await executeRun(asClient(db), id);
  assert.equal(anthropicBodies.length, 0);
});

test("sweepIfStale marque échouée une analyse bloquée trop longtemps", async () => {
  const db = new FakeDb();
  const id = newRun(db, "evaluate", {});
  const row = runRow(db, id);
  const fresh = await sweepIfStale(asClient(db), row as unknown as Run);
  assert.equal(fresh.status, "running");
  row.created_at = new Date(Date.now() - STALE_RUN_MS - 1000).toISOString();
  const swept = await sweepIfStale(asClient(db), row as unknown as Run);
  assert.equal(swept.status, "failed");
  assert.equal(runRow(db, id).error_code, "stale");
});
