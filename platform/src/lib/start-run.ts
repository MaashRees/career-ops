import { after } from "next/server";
import type { SessionUser } from "./auth";
import { assertQuota } from "./quota";
import { executeRun } from "./runs";
import { createAdminClient } from "./supabase/admin";
import type { RunKind } from "./types";

/**
 * Crée une exécution IA et la lance EN ARRIÈRE-PLAN (après l'envoi de la
 * réponse HTTP) : l'utilisateur est redirigé tout de suite vers la page de
 * suivi, qui interroge l'état toutes les 2 s. Lève QuotaError si une limite est atteinte.
 */
export async function startRun(
  user: SessionUser,
  kind: RunKind,
  input: Record<string, unknown>,
  applicationId?: string,
): Promise<string> {
  const db = createAdminClient();
  await assertQuota(db, user.id, user.email);

  const { data, error } = await db
    .from("runs")
    .insert({ user_id: user.id, kind, input, application_id: applicationId ?? null, status: "running" })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new Error(`Création de l'analyse impossible : ${error?.message}`);

  after(() => executeRun(createAdminClient(), data.id));
  return data.id;
}
