import Link from "next/link";
import { requireUser } from "@/lib/auth";

// Une analyse IA tourne en arrière-plan : on autorise jusqu'à 5 min (ignoré en Docker, utile sur Vercel).
export const maxDuration = 300;

const NAV = [
  { href: "/", label: "Tableau de bord" },
  { href: "/applications", label: "Candidatures" },
  { href: "/profile", label: "Profil & CV" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-4 pb-16">
      <header className="no-print flex flex-wrap items-center justify-between gap-3 py-4">
        <nav aria-label="Navigation principale" className="flex flex-wrap items-center gap-1">
          <Link href="/" className="mr-3 text-lg font-bold">Chasseur d'emploi</Link>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-accent-soft hover:text-fg">
              {n.label}
            </Link>
          ))}
          {user.isAdmin && (
            <Link href="/admin" className="rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-accent-soft hover:text-fg">
              Admin
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="hidden sm:inline">{user.email}</span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn btn-secondary">Se déconnecter</button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
