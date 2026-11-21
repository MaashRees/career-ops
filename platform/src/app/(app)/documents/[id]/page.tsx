import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteDocument } from "@/actions/applications";
import { ConfirmButton, CopyButton, PrintButton } from "@/components/ClientButtons";
import { Markdown } from "@/components/Markdown";
import { requireUser } from "@/lib/auth";
import { normalizeDashes } from "@/lib/text";
import { createClient } from "@/lib/supabase/server";
import type { DocumentRow } from "@/lib/types";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("*").eq("id", id).maybeSingle<DocumentRow>();
  if (!doc) notFound();

  const isCv = doc.kind === "tailored_cv";
  return (
    <div className="space-y-4">
      <div className="no-print space-y-4">
        <p><Link href={`/applications/${doc.application_id}`} className="text-sm text-accent underline">← Retour à la candidature</Link></p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">{isCv ? "CV adapté" : "Lettre de motivation"}</h1>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={normalizeDashes(doc.markdown)} />
            <PrintButton label="Imprimer / enregistrer en PDF" />
          </div>
        </div>
        <p className="alert alert-warn">
          Relis chaque ligne avant de l'envoyer : l'IA peut se tromper en reformulant ton expérience.
        </p>
        {isCv && doc.warnings.length > 0 && (
          <div className="alert alert-error">
            <p className="font-semibold">Chiffres absents de ton CV d'origine - à vérifier ou supprimer :</p>
            <p className="mt-1">{doc.warnings.join(" · ")}</p>
          </div>
        )}
      </div>
      <article className="card print-area">
        <Markdown>{doc.markdown}</Markdown>
      </article>
      <form action={deleteDocument.bind(null, doc.id, doc.application_id)} className="no-print">
        <ConfirmButton message="Supprimer ce document ?">Supprimer ce document</ConfirmButton>
      </form>
    </div>
  );
}
