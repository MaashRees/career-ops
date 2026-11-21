import Link from "next/link";
import { EvaluateForm } from "@/components/EvaluateForm";
import { ScoreBadge } from "@/components/ScoreBadge";
import { requireUser } from "@/lib/auth";
import { loadSettings } from "@/lib/data";
import { quotaState } from "@/lib/quota";
import { STATUS_LABELS } from "@/lib/states";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Application } from "@/lib/types";

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [settings, { data: apps }, quota] = await Promise.all([
    loadSettings(supabase, user.id),
    supabase.from("applications").select("*").order("updated_at", { ascending: false }).returns<Application[]>(),
    quotaState(createAdminClient(), user.id),
  ]);

  const list = apps ?? [];
  const scored = list.filter((a) => a.score != null);
  const avg = scored.length ? scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length : null;
  const toApply = list.filter((a) => a.status === "Evaluated" && (a.score ?? 0) >= 4).length;
  const inProgress = list.filter((a) => ["Applied", "Responded", "Assessment", "Interview"].includes(a.status)).length;
  const hasCv = settings.cv_md.trim().length > 0;
  const hasProfile = !!settings.profile.full_name || (settings.profile.target_roles?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {(!hasCv || !hasProfile) && (
        <section className="alert alert-warn" aria-label="Configuration">
          <p className="font-semibold">Avant ta première analyse :</p>
          <ul className="mt-1 list-disc pl-5">
            {!hasCv && <li>Ajoute ton CV (PDF ou texte) — <Link className="underline" href="/profile">Profil &amp; CV</Link>.</li>}
            {!hasProfile && <li>Indique les postes visés, ta localisation et ta fourchette de salaire — <Link className="underline" href="/profile">Profil &amp; CV</Link>.</li>}
          </ul>
        </section>
      )}

      <section className="card" aria-labelledby="eval-title">
        <h1 id="eval-title" className="mb-4 text-xl font-bold">Analyser une offre</h1>
        <EvaluateForm />
        <p className="hint mt-3">
          {quota.limit > 0 ? `${quota.usedToday} / ${quota.limit} analyses utilisées sur les dernières 24 h.` : `${quota.usedToday} analyses sur les dernières 24 h.`}{" "}
          L'IA donne une recommandation, pas une probabilité d'être embauché : relis toujours avant de postuler.
        </p>
      </section>

      <section aria-label="Statistiques" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Offres évaluées", value: list.length },
          { label: "Note moyenne", value: avg == null ? "—" : avg.toFixed(1) },
          { label: "À postuler (≥ 4,0)", value: toApply },
          { label: "En cours", value: inProgress },
        ].map((s) => (
          <div key={s.label} className="card">
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-sm text-muted">{s.label}</p>
          </div>
        ))}
      </section>

      <section className="card" aria-labelledby="recent-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent-title" className="font-semibold">Dernières candidatures</h2>
          <Link href="/applications" className="text-sm text-accent underline">Tout voir</Link>
        </div>
        {list.length === 0 ? (
          <p className="text-muted">Rien pour l'instant : analyse ta première offre ci-dessus.</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.slice(0, 6).map((a) => (
              <li key={a.id}>
                <Link href={`/applications/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-accent-soft/50">
                  <span>
                    <span className="font-medium">{a.company}</span> <span className="text-muted">— {a.role}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <ScoreBadge score={a.score} />
                    <span className="badge">{STATUS_LABELS[a.status] ?? a.status}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
