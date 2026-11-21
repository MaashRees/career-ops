import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserSettings } from "./engine/profile.ts";
import type { SettingsRow } from "./types.ts";

export const EMPTY_SETTINGS: UserSettings = {
  cv_md: "",
  profile: {},
  profile_md: "",
  output_language: "fr",
  spend_tier: "standard",
};

/** Réglages d'un utilisateur (valeurs par défaut s'il n'a encore rien saisi). Fonctionne avec le client RLS ou service role. */
export async function loadSettings(db: SupabaseClient, userId: string): Promise<UserSettings> {
  const { data } = await db.from("user_settings").select("*").eq("user_id", userId).maybeSingle<SettingsRow>();
  if (!data) return { ...EMPTY_SETTINGS };
  return {
    cv_md: data.cv_md ?? "",
    profile: data.profile ?? {},
    profile_md: data.profile_md ?? "",
    output_language: data.output_language || "fr",
    spend_tier: data.spend_tier || "standard",
  };
}
