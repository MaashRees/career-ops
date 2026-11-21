import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { isAdminEmail, isEmailAllowed } from "./env";

export interface SessionUser {
  id: string;
  email: string | null;
  isAdmin: boolean;
}

/** Utilisateur connecté (session revalidée auprès de Supabase) ou null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isEmailAllowed(user.email)) return null;
  // Admin seulement si l'adresse est CONFIRMÉE (jamais sur une adresse non vérifiée).
  return { id: user.id, email: user.email ?? null, isAdmin: isAdminEmail(user.email) && !!user.email_confirmed_at };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");
  return user;
}
