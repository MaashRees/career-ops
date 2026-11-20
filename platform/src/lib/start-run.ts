import { after } from "next/server";
import type { SessionUser } from "./auth";
import { dailyRunLimit, globalDailyRunLimit, isAdminEmail, maxConcurrentRuns } from "./env";
import { quotaErrorFromMessage } from "./quota";
import { executeRun } from "./runs";
import { createAdminClient } from "./supabase/admin";
import type { RunKind } from "./types";

/**
 * Crée une exécution IA et la lance EN ARRIÈRE-PLAN (après l'envoi de la réponse HTTP) :
 * l'utilisateur est redirigé tout de suite vers la page de suivi, qui interroge l'état toutes les 2 s.
 *
 * Les quotas sont contrôlés ET l'analyse créée dans une seule transaction côté base
 * (fonction SQL start_run, migration 0002, verrou par utilisateur) : impossible de dépasser la
 * limite en envoyant plusieurs requêtes en même temps. Lève QuotaError si une limite est atteinte.
 */
export async function startRun(
  user: SessionUser,
  kind: RunKind,
  input: Record<string, unknown>,
  applicationId?: string,
): Promise<string> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("start_run", {
    p_user_id: user.id,
    p_kind: kind,
    p_input: input,
    p_application_id: applicationId ?? null,
    p_user_limit: isAdminEmail(user.email) ? 0 : dailyRunLimit(),
    p_global_limit: globalDailyRunLimit(),
    p_max_concurrent: maxConcurrentRuns(),
  });

  if (error) {
    const quota = quotaErrorFromMessage(error.message);
    if (quota) throw quota;
    if (/start_run/.test(error.message) && /(could not find|does not exist|not found)/i.test(error.message)) {
      throw new Error("La fonction SQL start_run est absente : exécute la migration 0002_security_hardening.sql dans Supabase.");
    }
    throw new Error(`Création de l'analyse impossible : ${error.message}`);
  }
  const runId = data as string;
  after(() => executeRun(createAdminClient(), runId));
  return runId;
}
