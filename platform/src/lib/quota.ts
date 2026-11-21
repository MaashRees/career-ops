import type { SupabaseClient } from "@supabase/supabase-js";
import { dailyRunLimit } from "./env.ts";

export class QuotaError extends Error {
  readonly code: "user_daily" | "global_daily" | "concurrent";
  constructor(code: QuotaError["code"], message: string) {
    super(message);
    this.name = "QuotaError";
    this.code = code;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Les quotas sont APPLIQUÉS par la fonction SQL start_run() (migration 0002), de façon atomique.
 * Ce module ne sert qu'à l'affichage (« x / 20 analyses ») et à traduire ses erreurs.
 * Une analyse compte si elle coûte : en cours, terminée, ou échouée APRÈS un appel IA (provider renseigné).
 */
const COUNTED = "status.neq.failed,provider.not.is.null";

export interface QuotaState {
  usedToday: number;
  limit: number; // 0 = illimité
  running: number;
}

export async function quotaState(db: SupabaseClient, userId: string): Promise<QuotaState> {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const [{ count: used }, { count: running }] = await Promise.all([
    db.from("runs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since).or(COUNTED),
    db.from("runs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "running"),
  ]);
  return { usedToday: used ?? 0, limit: dailyRunLimit(), running: running ?? 0 };
}

/** Traduit l'erreur levée par la fonction SQL start_run() en erreur lisible (ou null si ce n'en est pas une). */
export function quotaErrorFromMessage(message: string, limit = dailyRunLimit()): QuotaError | null {
  if (message.includes("quota:concurrent")) {
    return new QuotaError("concurrent", "Une analyse est déjà en cours : attends qu'elle se termine.");
  }
  if (message.includes("quota:user_daily")) {
    return new QuotaError("user_daily", `Limite atteinte : ${limit} analyses par 24 h. Réessaie plus tard.`);
  }
  if (message.includes("quota:global_daily")) {
    return new QuotaError("global_daily", "Le plafond quotidien du service est atteint. Réessaie demain.");
  }
  return null;
}
