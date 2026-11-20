import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sessionCookieOptions, supabasePublishableKey, supabaseUrl } from "@/lib/env";

/** Client Supabase lié à la session de l'utilisateur (cookies) : soumis à la RLS. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
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
  });
}
