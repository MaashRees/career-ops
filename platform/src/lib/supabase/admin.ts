import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dbSchema, supabaseServiceKey, supabaseUrl } from "../env.ts";

/**
 * Client "service role" : contourne la RLS. RÉSERVÉ au code serveur (tâches de
 * fond, page admin). Toute requête faite avec doit filtrer explicitement par
 * user_id. Ne jamais l'importer depuis un composant client.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(supabaseUrl(), supabaseServiceKey(), {
    db: { schema: dbSchema() }, // schéma dédié (jamais « public »)
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as SupabaseClient;
}
