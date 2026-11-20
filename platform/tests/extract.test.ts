import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPosting } from "../src/lib/jd/extract.ts";

test("préfère le JSON-LD JobPosting", () => {
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "JobPosting",
        title: "Product Marketing Manager",
        description: "<p>Missions :</p><ul><li>Lancer des produits</li><li>Animer le go-to-market</li></ul>",
        hiringOrganization: { name: "Acme" },
        jobLocation: { address: { addressLocality: "Paris", addressCountry: "FR" } },
      },
    ],
  })}</script></head><body>menu menu menu</body></html>`;
  const r = extractPosting(html);
  assert.equal(r.source, "json-ld");
  assert.equal(r.company, "Acme");
  assert.match(r.text, /Title: Product Marketing Manager/);
  assert.match(r.text, /Location: Paris, FR/);
  assert.match(r.text, /• Lancer des produits/);
  assert.doesNotMatch(r.text, /menu menu/);
});

test("repli HTML : retire scripts, styles et navigation", () => {
  const html = `<html><head><title>Poste</title><style>.x{}</style></head><body>
    <nav>Accueil Contact</nav><script>alert(1)</script>
    <main><h1>Chef de projet</h1><p>Vous pilotez des projets.</p></main><footer>Mentions légales</footer></body></html>`;
  const r = extractPosting(html);
  assert.equal(r.source, "html");
  assert.match(r.text, /Chef de projet/);
  assert.match(r.text, /Vous pilotez des projets\./);
  assert.doesNotMatch(r.text, /alert|Accueil|Mentions/);
});

test("JSON-LD invalide ignoré sans planter", () => {
  const html = `<script type="application/ld+json">{pas du json</script><body><p>${"Texte de l'offre. ".repeat(40)}</p></body>`;
  assert.equal(extractPosting(html).source, "html");
});
