import { createClient } from "@supabase/supabase-js";
import { supabaseServiceKey, supabaseUrl } from "@/lib/env";

/**
 * Client "service role" : contourne la RLS. RÉSERVÉ au code serveur (tâches de
 * fond, page admin). Toute requête faite avec doit filtrer explicitement par
 * user_id. Ne jamais l'importer depuis un composant client.
 */
export function createAdminClient() {
  return createClient(supabaseUrl(), supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
