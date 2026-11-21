import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { dbSchema, sessionCookieOptions, supabasePublishableKey, supabaseUrl } from "@/lib/env";

/** Client Supabase lié à la session de l'utilisateur (cookies) : soumis à la RLS. */
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  // Pas de types de base générés : le client est typé « générique » ; le schéma réel est celui de dbSchema().
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    // Schéma dédié (jamais « public ») : voir supabase/migrations/0003.
    db: { schema: dbSchema() },
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Appelé depuis un Server Component : le rafraîchissement de session est
          // alors fait par proxy.ts, on peut ignorer sans risque.
        }
      },
    },
  }) as unknown as SupabaseClient;
}
