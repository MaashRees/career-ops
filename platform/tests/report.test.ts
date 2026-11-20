import assert from "node:assert/strict";
import { test } from "node:test";
import { numbersNotInSource } from "../src/lib/engine/facts.ts";
import { parseReport, parseScore, splitTitle, unwrapFence, validateReport, withJdArchive } from "../src/lib/engine/report.ts";

const GOOD = `# Evaluation: Acme — Product Marketing Manager

**Date:** 2026-11-20
**URL:** https://acme.com/jobs/1
**Archetype:** Not a target — closest default: PMM
**Score:** 4.2/5
**Decision:** Apply
**Legitimacy:** High Confidence

${"Contenu de l'analyse. ".repeat(60)}

## A) Role Summary
...
`;

test("parseScore : formats valides", () => {
  assert.equal(parseScore("**Score:** 4.2/5"), 4.2);
  assert.equal(parseScore("Score: 4,5 / 5"), 4.5);
  assert.equal(parseScore("**Score:** **3.8**/5"), 3.8);
  assert.equal(parseScore("Score: 4"), 4);
  assert.equal(parseScore("**Score:** 5/5"), 5);
});

test("parseScore : refuse une autre échelle ou une valeur absurde (N/A plutôt que faux)", () => {
  assert.equal(parseScore("**Score:** 8/10"), null);
  assert.equal(parseScore("**Score:** 4.2 (strong fit)/10"), null);
  assert.equal(parseScore("**Score:** 7/5"), null);
  assert.equal(parseScore("**Score:** N/A"), null);
  assert.equal(parseScore("rien"), null);
});

test("parseReport : titre, note, décision", () => {
  const p = parseReport(GOOD);
  assert.equal(p.company, "Acme");
  assert.equal(p.role, "Product Marketing Manager");
  assert.equal(p.score, 4.2);
  assert.equal(p.decision, "Apply");
  assert.equal(p.legitimacy, "High Confidence");
});

test("splitTitle : séparateurs variés", () => {
  assert.deepEqual(splitTitle("Acme — Chef de projet"), { company: "Acme", role: "Chef de projet" });
  assert.deepEqual(splitTitle("**Acme** - Chef de projet"), { company: "Acme", role: "Chef de projet" });
  assert.deepEqual(splitTitle("Seule"), { company: "Seule", role: "" });
});

test("validateReport : accepte un vrai rapport", () => {
  assert.deepEqual(validateReport(GOOD), { ok: true });
});

test("validateReport : rejette vide, court, balisage d'outils, confirmation", () => {
  assert.equal(validateReport("").ok, false);
  assert.equal(validateReport("# Evaluation: X — Y\n**Score:** 4/5").ok, false);
  const tool = validateReport(`<tool_call>{"name":"browser_navigate"}</tool_call>\n${GOOD}`);
  assert.equal(tool.ok, false);
  const nc = validateReport('needs_confirmation: dealbreaker "pas de sur site" - 5 jours sur site');
  assert.equal(nc.ok, false);
  if (!nc.ok) {
    assert.equal(nc.code, "needs_confirmation");
    assert.match(nc.confirmation ?? "", /pas de sur site/);
  }
  assert.equal(validateReport(GOOD.replace(/\*\*Score:\*\*.*\n/, "")).ok, false);
});

test("withJdArchive ajoute la section une seule fois", () => {
  const once = withJdArchive(GOOD, "Texte de l'offre");
  assert.match(once, /## Job Description \(archived verbatim\)\n\nTexte de l'offre/);
  assert.equal(withJdArchive(once, "autre"), once);
});

test("unwrapFence retire un bloc de code englobant", () => {
  assert.equal(unwrapFence("```markdown\n# Titre\ntexte\n```"), "# Titre\ntexte");
  assert.equal(unwrapFence("# Titre"), "# Titre");
});

test("numbersNotInSource repère les chiffres inventés", () => {
  const cv = "Lancé 3 produits, +35% de revenus. Acme 2019 – 2024. Budget 1 200 000 €";
  const ok = "Lancement de 3 produits, hausse de 35% du revenu (2019 – 2024), budget de 1.200.000 €";
  assert.deepEqual(numbersNotInSource(ok, cv), []);
  const fake = "Lancé 3 produits, +80% de revenus, équipe de 12 personnes, 2018 – 2024";
  assert.deepEqual(numbersNotInSource(fake, cv).sort(), ["12", "2018", "80"].sort());
});
