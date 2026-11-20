"use server";

import { redirect } from "next/navigation";
import { isEmailAllowed, siteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  message?: string;
}

export async function signInWithPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Renseigne ton e-mail et ton mot de passe." };
  if (!isEmailAllowed(email)) return { error: "E-mail ou mot de passe incorrect." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "E-mail ou mot de passe incorrect." };
  redirect("/");
}

/** Lien magique. Réponse identique que le compte existe ou non (pas d'énumération d'adresses). */
export async function sendMagicLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Renseigne ton e-mail." };
  const generic = { message: "Si ce compte existe, un lien de connexion vient d'être envoyé. Vérifie ta boîte mail." };
  if (!isEmailAllowed(email)) return generic;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Jamais de création de compte ici : l'accès se fait sur invitation.
    options: { shouldCreateUser: false, emailRedirectTo: `${siteUrl()}/auth/confirm` },
  });
  if (error && /rate|seconds|too many/i.test(error.message)) {
    return { error: "Trop de demandes : patiente une minute avant de réessayer." };
  }
  return generic;
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 10) return { error: "Choisis un mot de passe d'au moins 10 caractères." };
  if (password !== confirm) return { error: "Les deux mots de passe ne correspondent pas." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Impossible de changer le mot de passe : " + error.message };
  redirect("/");
}
