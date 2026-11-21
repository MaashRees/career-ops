import { NextResponse, type NextRequest } from "next/server";
import { siteUrl } from "@/lib/env";
import { isSameOriginRequest } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  // Anti-CSRF : un autre site ne doit pas pouvoir déconnecter l'utilisateur.
  if (!isSameOriginRequest(request.headers, siteUrl())) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", siteUrl()), { status: 303 });
}
