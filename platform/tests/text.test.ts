import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDashes } from "../src/lib/text.ts";

const EM = "—";
const EN = "–";
const ANY_DASH = /[—–―‒]/;

test("tiret long : remplacé par un trait d'union simple, avec ou sans espaces", () => {
  assert.equal(normalizeDashes(`Acme ${EM} Chef de projet`), "Acme - Chef de projet");
  assert.equal(normalizeDashes(`mot${EM}mot`), "mot - mot");
  assert.equal(normalizeDashes(`un ${EM}  deux`), "un - deux");
});

test("demi-cadratin : plage collée -> trait d'union collé ; avec espaces -> ' - '", () => {
  assert.equal(normalizeDashes(`2020${EN}2023`), "2020-2023");
  assert.equal(normalizeDashes(`12/2024 ${EN} 03/2025`), "12/2024 - 03/2025");
  assert.equal(normalizeDashes(`250${EN}350 mots`), "250-350 mots");
});

test("début de ligne : devient une puce markdown", () => {
  assert.equal(normalizeDashes(`${EM} Premier\n${EN} Second\n  ${EM} Imbriqué`), "- Premier\n- Second\n  - Imbriqué");
});

test("les sauts de ligne ne sont jamais avalés", () => {
  assert.equal(normalizeDashes(`fin de ligne ${EM}\nsuite`), "fin de ligne -\nsuite");
  assert.equal(normalizeDashes(`a\n\n${EM} b`), "a\n\n- b");
});

test("idempotente, et ne touche pas aux traits d'union ni aux URL", () => {
  const clean = "Saint-Gobain - Chef de projet, https://exemple.fr/a-b-c, 2020-2023";
  assert.equal(normalizeDashes(clean), clean);
  const once = normalizeDashes(`A ${EM} B ${EN} C`);
  assert.equal(normalizeDashes(once), once);
  assert.doesNotMatch(once, ANY_DASH);
});

test("barre horizontale et tiret de chiffres traités comme les autres", () => {
  assert.doesNotMatch(normalizeDashes("a―b c‒d"), ANY_DASH);
});
