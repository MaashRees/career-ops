import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteApplication } from "@/actions/applications";
import { DocumentForm, FullAnalysisForm } from "@/components/ApplicationActions";
import { ConfirmButton, CopyButton } from "@/components/ClientButtons";
import { Markdown } from "@/components/Markdown";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusForm } from "@/components/StatusForm";
import { requireUser } from "@/lib/auth";
import { APPLY_MIN, STATUS_LABELS } from "@/lib/states";
import { createClient } from "@/lib/supabase/server";
import type { Application, DocumentRow, Report } from "@/lib/types";

export const metadata: Metadata = { title: "Candidature" };

const KIND_LABEL = { cover_letter: "Lettre de motivation", tailored_cv: "CV adapté" } as const;

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  const { data: app } = await supabase.from("applications").select("*").eq("id", id).maybeSingle<Application>();
  if (!app) notFound();

  const [{ data: report }, { data: docs }] = await Promise.all([
    supabase.from("reports").select("*").eq("application_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle<Report>(),
    supabase.from("documents").select("*").eq("application_id", id).order("created_at", { ascending: false }).returns<DocumentRow[]>(),
  ]);

  const weak = app.score != null && app.score < APPLY_MIN;

  return (
    <div className="space-y-6">
      <p><Link href="/applications" className="text-sm text-accent underline">← Candidatures</Link></p>

      <header className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">#{String(app.num).padStart(3, "0")}</p>
            <h1 className="text-xl font-bold">{app.company}</h1>
            <p className="text-muted">{app.role}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ScoreBadge score={app.score} />
            <span className="badge">{STATUS_LABELS[app.status] ?? app.status}</span>
            {app.decision && <span className="badge">{app.decision}</span>}
            {app.legitimacy && <span className="badge">{app.legitimacy}</span>}
          </div>
        </div>
        {app.url && (
          <p className="text-sm">
            <a href={app.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-accent underline">{app.url}</a>
          </p>
        )}
        {weak && (
          <p className="alert alert-warn">
            Note sous {APPLY_MIN.toFixed(1)} / 5 : l'analyse déconseille de postuler, sauf si tu as une bonne raison de le faire.
          </p>
        )}
        <p className="hint">L'application ne postule jamais à ta place : tu relis, tu envoies toi-même.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card space-y-4" aria-labelledby="follow-title">
          <h2 id="follow-title" className="font-semibold">Suivi</h2>
          <StatusForm applicationId={app.id} status={app.status} notes={app.notes} appliedOn={app.applied_on} />
        </section>

        <section className="card space-y-4" aria-labelledby="docs-title">
          <h2 id="docs-title" className="font-semibold">Préparer la candidature</h2>
          {report ? (
            <>
              <DocumentForm applicationId={app.id} kind="cover_letter" />
              <DocumentForm applicationId={app.id} kind="tailored_cv" />
              {report.depth === "essential" && <FullAnalysisForm applicationId={app.id} />}
            </>
          ) : (
            <p className="text-muted">Aucun rapport pour cette candidature.</p>
          )}
          {docs && docs.length > 0 && (
            <div>
              <h3 className="label">Documents générés</h3>
              <ul className="space-y-1 text-sm">
                {docs.map((d) => (
                  <li key={d.id}>
                    <Link href={`/documents/${d.id}`} className="text-accent underline">{KIND_LABEL[d.kind]}</Link>{" "}
                    <span className="text-muted">— {new Date(d.created_at).toLocaleString("fr-FR")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {report && (
        <section className="card" aria-labelledby="report-title">
          <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="report-title" className="font-semibold">
              Rapport d'évaluation <span className="text-sm font-normal text-muted">({report.depth === "full" ? "complet" : "essentiel"} · {new Date(report.created_at).toLocaleDateString("fr-FR")})</span>
            </h2>
            <CopyButton text={report.markdown} label="Copier le rapport" />
          </div>
          <Markdown>{report.markdown}</Markdown>
        </section>
      )}

      <form action={deleteApplication.bind(null, app.id)} className="no-print">
        <ConfirmButton message="Supprimer définitivement cette candidature, son rapport et ses documents ?">Supprimer cette candidature</ConfirmButton>
      </form>
    </div>
  );
}
