import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  clampTier, configProblems, fallbackProvider, isEmailAllowed, isAdminEmail, modelFor, primaryProvider,
} from "../src/lib/env.ts";

const KEYS = [
  "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "LLM_PROVIDER", "LLM_FALLBACK", "ALLOWED_EMAILS", "ADMIN_EMAILS",
  "MAX_TIER", "ANTHROPIC_MODEL_STANDARD", "OPENROUTER_MODEL_ECONOMY",
];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
function clear() {
  for (const k of KEYS) delete process.env[k];
}

test("choix du fournisseur", () => {
  clear();
  assert.equal(primaryProvider(), null);
  process.env.OPENROUTER_API_KEY = "or";
  assert.equal(primaryProvider(), "openrouter");
  assert.equal(fallbackProvider(), null);
  process.env.ANTHROPIC_API_KEY = "an";
  assert.equal(primaryProvider(), "anthropic"); // Anthropic par défaut quand les deux existent
  assert.equal(fallbackProvider(), "openrouter");
  process.env.LLM_PROVIDER = "openrouter";
  assert.equal(primaryProvider(), "openrouter");
  assert.equal(fallbackProvider(), "anthropic");
  process.env.LLM_FALLBACK = "off";
  assert.equal(fallbackProvider(), null);
  process.env.LLM_PROVIDER = "anthropic";
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(primaryProvider(), "openrouter"); // provider forcé sans clé → on retombe sur l'autre
});

test("modèles par défaut et surcharge", () => {
  clear();
  assert.equal(modelFor("anthropic", "economy"), "claude-haiku-5-5");
  assert.equal(modelFor("anthropic", "standard"), "claude-sonnet-5-5");
  assert.equal(modelFor("openrouter", "premium"), "anthropic/claude-opus-5.5");
  process.env.ANTHROPIC_MODEL_STANDARD = "claude-custom";
  assert.equal(modelFor("anthropic", "standard"), "claude-custom");
});

test("liste blanche et administrateurs (insensibles à la casse)", () => {
  clear();
  assert.equal(isEmailAllowed("n.importe@qui.com"), true); // pas de liste = tout le monde (invitations Supabase)
  process.env.ALLOWED_EMAILS = "Jane@Example.com, frere@example.com";
  assert.equal(isEmailAllowed("jane@example.com"), true);
  assert.equal(isEmailAllowed("intrus@example.com"), false);
  assert.equal(isEmailAllowed(null), false);
  process.env.ADMIN_EMAILS = "jane@example.com";
  assert.equal(isAdminEmail("JANE@example.com"), true);
  assert.equal(isAdminEmail("frere@example.com"), false);
});

test("clampTier plafonne selon MAX_TIER", () => {
  clear();
  assert.equal(clampTier("premium"), "standard"); // plafond par défaut = standard
  assert.equal(clampTier("economy"), "economy");
  assert.equal(clampTier("n'importe quoi"), "standard");
  process.env.MAX_TIER = "premium";
  assert.equal(clampTier("premium"), "premium");
  process.env.MAX_TIER = "economy";
  assert.equal(clampTier("standard"), "economy");
});

test("configProblems liste les variables manquantes sans valeurs", () => {
  clear();
  const keep = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"];
  const old = Object.fromEntries(keep.map((k) => [k, process.env[k]]));
  for (const k of keep) delete process.env[k];
  try {
    const p = configProblems();
    assert.equal(p.length, 4);
    assert.ok(p.some((x) => x.includes("ANTHROPIC_API_KEY")));
  } finally {
    for (const k of keep) if (old[k] !== undefined) process.env[k] = old[k];
  }
});

test("les variables Supabase se lisent sans préfixe NEXT_PUBLIC_ (config au démarrage d'une image Docker)", async () => {
  const { supabaseUrl, supabasePublishableKey, siteUrl } = await import("../src/lib/env.ts");
  const names = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SITE_URL", "NEXT_PUBLIC_SITE_URL"];
  const old = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  for (const k of names) delete process.env[k];
  try {
    process.env.SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-old-style";
    process.env.SITE_URL = "https://jobs.example.com/";
    assert.equal(supabaseUrl(), "https://abc.supabase.co");
    assert.equal(supabasePublishableKey(), "anon-old-style");
    assert.equal(siteUrl(), "https://jobs.example.com");
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_new";
    assert.equal(supabasePublishableKey(), "sb_publishable_new");
  } finally {
    for (const k of names) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
});
