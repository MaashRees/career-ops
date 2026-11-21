"use client";

import { reEvaluateFull, startDocument } from "@/actions/runs";
import { ActionForm, SubmitButton } from "./forms";

export function DocumentForm({ applicationId, kind }: { applicationId: string; kind: "cover_letter" | "tailored_cv" }) {
  const action = startDocument.bind(null, applicationId, kind);
  const isCover = kind === "cover_letter";
  return (
    <ActionForm action={action} className="space-y-2">
      <label className="label" htmlFor={`extra-${kind}`}>{isCover ? "Lettre de motivation" : "CV adapté à l'offre"}</label>
      <input id={`extra-${kind}`} name="extra" className="input" placeholder="Consigne optionnelle (ton, point à mettre en avant…)" maxLength={1000} />
      <SubmitButton className="btn btn-secondary" pending="Lancement…">{isCover ? "Rédiger la lettre" : "Adapter mon CV"}</SubmitButton>
    </ActionForm>
  );
}

export function FullAnalysisForm({ applicationId }: { applicationId: string }) {
  return (
    <ActionForm action={reEvaluateFull.bind(null, applicationId)} className="space-y-2">
      <SubmitButton className="btn btn-secondary" pending="Lancement…">Relancer en analyse complète</SubmitButton>
    </ActionForm>
  );
}
