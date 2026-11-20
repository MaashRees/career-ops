import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { siteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** Chemin relatif sûr (pas de redirection ouverte vers un autre site). */
function safeNext(next: string | null, fallback: string): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) return next;
  return fallback;
}

/**
 * Cible des liens des e-mails Supabase (invitation, lien magique, récupération) :
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
 * Voir le README pour les modèles d'e-mail à coller dans Supabase.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  // Liste fermée : seuls les types réellement utilisés par nos e-mails.
  const ALLOWED_TYPES: EmailOtpType[] = ["invite", "email", "magiclink", "recovery", "signup"];
  const type = ALLOWED_TYPES.find((t) => t === rawType) ?? null;
  const code = searchParams.get("code");
  const base = siteUrl();

  const supabase = await createClient();
  let ok = false;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (!ok) return NextResponse.redirect(`${base}/login?error=link`);

  // Une invitation ou une récupération doit mener à la création du mot de passe.
  const fallback = type === "invite" || type === "recovery" ? "/account/password" : "/";
  return NextResponse.redirect(`${base}${safeNext(searchParams.get("next"), fallback)}`);
}
