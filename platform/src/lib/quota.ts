import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dailyRunLimit,
  globalDailyRunLimit,
  isAdminEmail,
  maxConcurrentRuns,
} from "./env.ts";

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
 * Un appel compte dans le quota s'il a coûté quelque chose : il tourne encore,
 * s'est terminé, ou a échoué APRÈS avoir contacté le fournisseur IA (provider
 * renseigné). Une erreur « URL illisible » ne consomme rien.
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

/** Lève QuotaError si l'utilisateur (ou le serveur) a atteint une limite. `db` = client service role. */
export async function assertQuota(db: SupabaseClient, userId: string, email: string | null): Promise<void> {
  const admin = isAdminEmail(email);
  const state = await quotaState(db, userId);

  if (state.running >= maxConcurrentRuns()) {
    throw new QuotaError("concurrent", "Une analyse est déjà en cours : attends qu'elle se termine.");
  }
  if (!admin && state.limit > 0 && state.usedToday >= state.limit) {
    throw new QuotaError("user_daily", `Limite atteinte : ${state.limit} analyses par 24 h. Réessaie plus tard.`);
  }
  const globalLimit = globalDailyRunLimit();
  if (globalLimit > 0) {
    const since = new Date(Date.now() - DAY_MS).toISOString();
    const { count } = await db.from("runs").select("id", { count: "exact", head: true }).gte("created_at", since).or(COUNTED);
    if ((count ?? 0) >= globalLimit) {
      throw new QuotaError("global_daily", "Le plafond quotidien du service est atteint. Réessaie demain.");
    }
  }
}
