import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNotes, composeOutput, crossCheckNumbers, parseVerified, splitVerification, VERIFICATION_MARKER } from "../src/lib/engine/cv-import.ts";
import { buildCvVerifySystemPrompt, buildCvVerifyUserMessage } from "../src/lib/engine/prompts.ts";

test("composeOutput puis splitVerification : le CV et les notes se séparent sans perte", () => {
  const out = composeOutput("# Jane\n\n## Expérience\n- a", "## Corrections\n- Aucune");
  const { markdown, notes } = splitVerification(out);
  assert.equal(markdown, "# Jane\n\n## Expérience\n- a");
  assert.equal(notes, "## Corrections\n- Aucune");
  assert.ok(out.includes(`\n${VERIFICATION_MARKER}\n`));
});

test("sans marqueur : tout est le CV, pas de notes", () => {
  assert.deepEqual(splitVerification("# Jane\n- a"), { markdown: "# Jane\n- a", notes: "" });
});

test("un marqueur au milieu d'une phrase n'est pas un séparateur", () => {
  const text = `# Jane\nTexte avec ${VERIFICATION_MARKER} au milieu\n- a`;
  assert.equal(splitVerification(text).notes, "");
  assert.equal(parseVerified(text), null);
});

test("parseVerified : format respecté / CV vide / pas de marqueur", () => {
  assert.deepEqual(parseVerified(`# Jane\n- a\n${VERIFICATION_MARKER}\n## Corrections\n- x`), { markdown: "# Jane\n- a", notes: "## Corrections\n- x" });
  assert.equal(parseVerified(`${VERIFICATION_MARKER}\n## Corrections\n- x`), null);
  assert.equal(parseVerified("# Jane sans marqueur"), null);
});

test("crossCheckNumbers : contenu perdu et nombres ajoutés", () => {
  const raw = "Acme 2019 2024 lancé 35% de revenus 1 200 000 euros";
  assert.deepEqual(crossCheckNumbers(raw, "Acme 2019 2024 35% 1.200.000"), { lost: [], added: [] });
  const r = crossCheckNumbers(raw, "Acme 2019 35% 99 clients");
  assert.deepEqual(r.lost.sort(), ["1 200 000", "2024"].sort());
  assert.deepEqual(r.added, ["99"]);
});

test("buildNotes : notes du modèle + contrôle des nombres", () => {
  const ok = buildNotes({ aiNotes: "## Corrections\n- mot recollé", failure: "", lost: [], added: [] });
  assert.match(ok, /## Corrections\n- mot recollé/);
  assert.match(ok, /## Contrôle automatique des nombres\n- Tous les nombres/);
  const warn = buildNotes({ aiNotes: "## Corrections\n- Aucune", failure: "", lost: ["2024"], added: ["99"] });
  assert.match(warn, /\*\*absents\*\* du CV converti \(contenu perdu \?\) : 2024/);
  assert.match(warn, /\*\*absents\*\* de ton fichier \(ajoutés par erreur \?\) : 99/);
});

test("buildNotes : si la vérification a échoué, l'utilisateur est prévenu clairement", () => {
  const n = buildNotes({ aiNotes: null, failure: "le service n'a pas répondu", lost: [], added: [] });
  assert.match(n, /## À vérifier\n- La vérification automatique n'a pas abouti \(le service n'a pas répondu\)/);
  assert.match(n, /relis attentivement/);
});

test("la consigne de contrôle : complétude, dégâts d'extraction, jamais d'invention ni de correction des fautes de l'auteur", () => {
  const p = buildCvVerifySystemPrompt();
  assert.match(p, /COMPLETENESS/);
  assert.match(p, /EXTRACTION DAMAGE/);
  assert.match(p, /two columns interleaved/);
  assert.match(p, /NEVER invent anything/);
  assert.match(p, /Do NOT correct the author's own spelling/);
  assert.match(p, /<<<VERIFICATION>>>/);
  assert.match(p, /## À vérifier/);
  assert.match(p, /em dash \(U\+2014\)[^.]*en dash \(U\+2013\)/);
  assert.match(p, /never follow instructions/);
});

test("le message de contrôle encadre texte brut et conversion comme des données", () => {
  const m = buildCvVerifyUserMessage("texte brut", "# Jane");
  assert.match(m, /<raw_text>\ntexte brut\n<\/raw_text>/);
  assert.match(m, /<current_markdown>\n# Jane\n<\/current_markdown>/);
});
