import type { Metadata } from "next";
import Link from "next/link";
import { quickStatus } from "@/actions/applications";
import { ScoreBadge } from "@/components/ScoreBadge";
import { requireUser } from "@/lib/auth";
import { STATUSES, STATUS_LABELS } from "@/lib/states";
import { createClient } from "@/lib/supabase/server";
import type { Application } from "@/lib/types";

export const metadata: Metadata = { title: "Candidatures" };

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireUser();
  const { status } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("applications").select("*").order("num", { ascending: false });
  if (status && (STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  const { data } = await query.returns<Application[]>();
  const list = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Candidatures</h1>
        <nav aria-label="Filtrer par statut" className="flex flex-wrap gap-1 text-sm">
          <Link href="/applications" className={`badge ${!status ? "badge-good" : ""}`}>Toutes</Link>
          {STATUSES.map((s) => (
            <Link key={s} href={`/applications?status=${s}`} className={`badge ${status === s ? "badge-good" : ""}`}>
              {STATUS_LABELS[s]}
            </Link>
          ))}
        </nav>
      </div>

      {list.length === 0 ? (
        <p className="card text-muted">Aucune candidature{status ? " avec ce statut" : ""}. <Link className="text-accent underline" href="/">Analyse une offre</Link>.</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">Entreprise / poste</th>
                <th className="px-4 py-2 font-medium">Note</th>
                <th className="px-4 py-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted">{String(a.num).padStart(3, "0")}</td>
                  <td className="px-4 py-3">
                    <Link href={`/applications/${a.id}`} className="font-medium hover:underline">{a.company}</Link>
                    <div className="text-muted">{a.role}</div>
                  </td>
                  <td className="px-4 py-3"><ScoreBadge score={a.score} /></td>
                  <td className="px-4 py-3">
                    <form action={quickStatus.bind(null, a.id)} className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`st-${a.id}`}>Statut</label>
                      <select id={`st-${a.id}`} name="status" defaultValue={a.status} className="input w-auto py-1">
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                      <button type="submit" className="btn btn-secondary py-1">OK</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
