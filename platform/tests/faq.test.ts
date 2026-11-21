import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { faqSections, type FaqParams } from "../src/lib/faq.ts";
import { APPLY_MIN, STATUSES, STATUS_LABELS } from "../src/lib/states.ts";
import { normalizeDashes } from "../src/lib/text.ts";

const params: FaqParams = { dailyLimit: 20, maxConcurrent: 2, maxTier: "standard" };
const all = (p: FaqParams = params) => faqSections(p);
const flat = (p: FaqParams = params) => all(p).flatMap((s) => s.items.map((i) => `${i.q}\n${i.a}`)).join("\n\n");

test("structure : sections à identifiants uniques, questions et réponses non vides", () => {
  const sections = all();
  assert.ok(sections.length >= 5);
  assert.equal(new Set(sections.map((s) => s.id)).size, sections.length);
  for (const s of sections) {
    assert.ok(s.title.length > 3 && s.items.length >= 1, s.id);
    for (const i of s.items) {
      assert.ok(i.q.trim().endsWith("?") || i.q.length > 10, i.q);
      assert.ok(i.a.trim().length > 40, i.q);
    }
  }
  const questions = sections.flatMap((s) => s.items.map((i) => i.q));
  assert.equal(new Set(questions).size, questions.length, "questions en double");
});

test("typographie : aucun tiret long ni demi-cadratin (déjà conforme sans normalisation)", () => {
  const text = flat();
  assert.equal(normalizeDashes(text), text);
});

test("les statuts affichés sont exactement ceux de l'application, avec leurs libellés", () => {
  const text = flat();
  for (const s of STATUSES) assert.ok(text.includes(`**${STATUS_LABELS[s]}**`), `statut absent : ${s}`);
});

test("le seuil de la note vient de la configuration du produit (4,0)", () => {
  assert.equal(APPLY_MIN, 4);
  const text = flat();
  assert.match(text, /\*\*Moins de 4,0\*\*/);
  assert.match(text, /\*\*4,0 à 4,4\*\*/);
});

test("les limites affichées sont celles du serveur, et le texte s'adapte", () => {
  const t = flat({ dailyLimit: 12, maxConcurrent: 3, maxTier: "premium" });
  assert.match(t, /\*\*12\*\* par période glissante de 24 h et \*\*3\*\* en même temps/);
  assert.match(t, /maximum autorisé est \*\*premium\*\*/);
  const unlimited = flat({ dailyLimit: 0, maxConcurrent: 2, maxTier: "economy" });
  assert.match(unlimited, /sans limite journalière/);
  assert.match(unlimited, /maximum autorisé est \*\*économique\*\*/);
  assert.doesNotMatch(unlimited, /\{|\}|undefined|NaN/);
});

test("les chiffres cités (5 Mo, 15 pages) correspondent aux limites réelles de l'import", () => {
  const actions = readFileSync(path.resolve(import.meta.dirname, "..", "src/actions/profile.ts"), "utf8");
  assert.match(actions, /MAX_UPLOAD_BYTES = 5 \* 1024 \* 1024/);
  assert.match(actions, /MAX_PDF_PAGES = 15/);
  const text = flat();
  assert.match(text, /5 Mo maximum, 15 pages maximum/);
});

test("promesses clés présentes : jamais d'envoi à la place de l'utilisateur, relecture, PDF non conservé, validation du CV", () => {
  const text = flat();
  assert.match(text, /n'envoie jamais rien à ta place/);
  assert.match(text, /Non, jamais/);
  assert.match(text, /Relis toujours/);
  assert.match(text, /n'est \*\*pas conservé\*\*/);
  assert.match(text, /Rien n'est enregistré tant que tu n'as pas cliqué sur « Utiliser ce CV »/);
});

test("aucune donnée sensible ni secret dans la FAQ", () => {
  const text = flat();
  assert.doesNotMatch(text, /sk-|service_role|SUPABASE|api[_ -]?key|@gmail|password=/i);
});
