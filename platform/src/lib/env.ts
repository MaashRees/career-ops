/**
 * Configuration lue dans les variables d'environnement, À CHAQUE APPEL (jamais
 * au chargement du module) : `next build` n'a pas les secrets, et les tests
 * peuvent les changer à la volée. Aucune valeur secrète n'est jamais renvoyée
 * au navigateur.
 */

export type Tier = "economy" | "standard" | "premium";
export type Provider = "anthropic" | "openrouter";

export const TIERS: readonly Tier[] = ["economy", "standard", "premium"];

const clean = (v: string | undefined): string => (v ?? "").trim();

function list(v: string | undefined): string[] {
  return clean(v)
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function intEnv(name: string, fallback: number): number {
  const n = Number.parseInt(clean(process.env[name]), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function siteUrl(): string {
  // Noms SANS préfixe NEXT_PUBLIC_ en priorité : Next fige les NEXT_PUBLIC_* au
  // build, alors qu'une image Docker doit lire sa config au démarrage.
  const raw = clean(process.env.SITE_URL) || clean(process.env.NEXT_PUBLIC_SITE_URL);
  return (raw || "http://localhost:3000").replace(/\/+$/, "");
}

/** Adresses autorisées à utiliser l'app. Vide = tous les comptes Supabase (les invitations suffisent). */
export function allowedEmails(): string[] {
  return list(process.env.ALLOWED_EMAILS);
}

export function adminEmails(): string[] {
  return list(process.env.ADMIN_EMAILS);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.toLowerCase());
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  const allowed = allowedEmails();
  if (allowed.length === 0) return true;
  return !!email && allowed.includes(email.toLowerCase());
}

/** Analyses IA autorisées par utilisateur et par 24 h glissantes. 0 = illimité. */
export function dailyRunLimit(): number {
  return intEnv("DAILY_RUN_LIMIT", 20);
}

/** Plafond global (tous utilisateurs) par 24 h : protège tes clés API. 0 = illimité. */
export function globalDailyRunLimit(): number {
  return intEnv("GLOBAL_DAILY_RUN_LIMIT", 150);
}

/** Analyses simultanées par utilisateur. */
export function maxConcurrentRuns(): number {
  return Math.max(1, intEnv("MAX_CONCURRENT_RUNS", 2));
}

/** Niveau de modèle maximum que les utilisateurs peuvent choisir. */
export function maxTier(): Tier {
  const v = clean(process.env.MAX_TIER).toLowerCase();
  return (TIERS as readonly string[]).includes(v) ? (v as Tier) : "standard";
}

export function clampTier(tier: string | null | undefined): Tier {
  const wanted = (TIERS as readonly string[]).includes(tier ?? "") ? (tier as Tier) : "standard";
  const cap = TIERS.indexOf(maxTier());
  return TIERS[Math.min(TIERS.indexOf(wanted), cap)];
}

export function hasAnthropicKey(): boolean {
  return clean(process.env.ANTHROPIC_API_KEY).length > 0;
}
export function hasOpenRouterKey(): boolean {
  return clean(process.env.OPENROUTER_API_KEY).length > 0;
}

/** Fournisseur principal. LLM_PROVIDER force le choix ; sinon Anthropic si la clé existe, sinon OpenRouter. */
export function primaryProvider(): Provider | null {
  const forced = clean(process.env.LLM_PROVIDER).toLowerCase();
  if (forced === "anthropic" && hasAnthropicKey()) return "anthropic";
  if (forced === "openrouter" && hasOpenRouterKey()) return "openrouter";
  if (hasAnthropicKey()) return "anthropic";
  if (hasOpenRouterKey()) return "openrouter";
  return null;
}

/** Fournisseur de secours (l'autre, s'il a une clé) quand le principal est en panne ou à court de crédit. */
export function fallbackProvider(): Provider | null {
  const primary = primaryProvider();
  if (!primary) return null;
  if (clean(process.env.LLM_FALLBACK).toLowerCase() === "off") return null;
  if (primary === "anthropic" && hasOpenRouterKey()) return "openrouter";
  if (primary === "openrouter" && hasAnthropicKey()) return "anthropic";
  return null;
}

const DEFAULT_MODELS: Record<Provider, Record<Tier, string>> = {
  anthropic: {
    economy: "claude-haiku-5-5",
    standard: "claude-sonnet-5-5",
    premium: "claude-opus-5-5",
  },
  openrouter: {
    economy: "anthropic/claude-haiku-5.5",
    standard: "anthropic/claude-sonnet-5.5",
    premium: "anthropic/claude-opus-5.5",
  },
};

export function modelFor(provider: Provider, tier: Tier): string {
  const prefix = provider === "anthropic" ? "ANTHROPIC_MODEL" : "OPENROUTER_MODEL";
  const override = clean(process.env[`${prefix}_${tier.toUpperCase()}`]);
  return override || DEFAULT_MODELS[provider][tier];
}

export function supabaseUrl(): string {
  return clean(process.env.SUPABASE_URL) || clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
}
/** Clé publique « publishable » (ou « anon » sur les anciens projets). Soumise à la RLS, donc non secrète. */
export function supabasePublishableKey(): string {
  return (
    clean(process.env.SUPABASE_PUBLISHABLE_KEY) ||
    clean(process.env.SUPABASE_ANON_KEY) ||
    clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
    clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}
export function supabaseServiceKey(): string {
  return clean(process.env.SUPABASE_SERVICE_ROLE_KEY) || clean(process.env.SUPABASE_SECRET_KEY);
}

/** Problèmes de configuration (noms des variables manquantes, jamais de valeurs). */
export function configProblems(): string[] {
  const problems: string[] = [];
  if (!supabaseUrl()) problems.push("SUPABASE_URL");
  if (!supabasePublishableKey()) problems.push("SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY)");
  if (!supabaseServiceKey()) problems.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!primaryProvider()) problems.push("ANTHROPIC_API_KEY ou OPENROUTER_API_KEY");
  return problems;
}
