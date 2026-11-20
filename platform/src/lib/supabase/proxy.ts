import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { configProblems, isEmailAllowed, sessionCookieOptions, supabasePublishableKey, supabaseUrl } from "@/lib/env";

const PUBLIC_PREFIXES = ["/login", "/auth/", "/api/health"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

/** Rafraîchit la session Supabase et protège toutes les pages privées. */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  // La sonde de santé de l'hébergeur ne doit dépendre de rien (ni session, ni Supabase).
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next();

  // Configuration incomplète : message clair (noms des variables seulement, jamais de valeurs).
  const problems = configProblems();
  if (problems.length > 0) {
    return new NextResponse(`Configuration incomplète. Variables manquantes : ${problems.join(", ")}`, {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser() revalide le jeton auprès de Supabase (getSession() ne le fait pas).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Liste blanche applicative (défense en profondeur en plus des invitations).
  if (user && !isEmailAllowed(user.email)) {
    await supabase.auth.signOut();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?error=forbidden";
    return NextResponse.redirect(url);
  }

  return response;
}
