import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { evaluateAnyway } from "@/actions/runs";
import { acceptImportedCv } from "@/actions/profile";
import { ActionForm, SubmitButton } from "@/components/forms";
import { RunPoller } from "@/components/RunPoller";
import { requireUser } from "@/lib/auth";
import { sweepIfStale } from "@/lib/runs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Run } from "@/lib/types";

export const metadata: Metadata = { title: "Analyse en cours" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<Run["kind"], string> = {
  evaluate: "Analyse de l'offre",
  cover_letter: "Rédaction de la lettre",
  tailored_cv: "Adaptation du CV",
  cv_import: "Conversion du CV",
};

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("runs").select("*").eq("id", id).maybeSingle<Run>();
  if (!data) notFound();
  const run = await sweepIfStale(createAdminClient(), data);

  if (run.status === "done") {
    if (run.result_type === "report" && run.application_id) redirect(`/applications/${run.application_id}`);
    if (run.result_type === "document" && run.result_id) redirect(`/documents/${run.result_id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">{KIND_LABEL[run.kind]}</h1>

      {run.status === "running" && <RunPoller runId={run.id} kindLabel={KIND_LABEL[run.kind]} />}

      {run.status === "failed" && (
        <div className="space-y-3">
          <p role="alert" className="alert alert-error">{run.error ?? "L'analyse a échoué."}</p>
          {run.error_code === "needs_confirmation" && (
            <ActionForm action={evaluateAnyway.bind(null, run.id)}>
              <SubmitButton className="btn btn-secondary" pending="Lancement…">Évaluer quand même</SubmitButton>
            </ActionForm>
          )}
          <p><Link href="/" className="text-accent underline">← Retour au tableau de bord</Link></p>
        </div>
      )}

      {run.status === "done" && run.kind === "cv_import" && (
        <section className="card space-y-3">
          <p className="alert alert-warn">
            Voici ton CV converti en markdown. Relis-le et corrige si besoin : rien n'est remplacé tant que tu n'as pas validé.
          </p>
          <ActionForm action={acceptImportedCv.bind(null, run.id)}>
            <label className="label" htmlFor="cv_md">CV (markdown)</label>
            <textarea id="cv_md" name="cv_md" rows={24} defaultValue={run.output ?? ""} className="input font-mono text-sm" />
            <SubmitButton pending="Enregistrement…">Utiliser ce CV</SubmitButton>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
