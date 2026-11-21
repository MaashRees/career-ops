"use client";

import { startEvaluation } from "@/actions/runs";
import { ActionForm, SubmitButton } from "./forms";

export function EvaluateForm() {
  return (
    <ActionForm action={startEvaluation}>
      <div>
        <label className="label" htmlFor="url">Lien de l'offre</label>
        <input id="url" name="url" type="url" inputMode="url" placeholder="https://entreprise.com/carrieres/poste-123" className="input" />
        <p className="hint">Page carrière de l'entreprise de préférence. LinkedIn n'est pas lisible automatiquement : colle alors le texte.</p>
      </div>
      <div>
        <label className="label" htmlFor="jd_text">…ou le texte de l'annonce</label>
        <textarea id="jd_text" name="jd_text" rows={5} className="input" placeholder="Colle ici l'annonce complète (intitulé, missions, profil recherché)…" />
      </div>
      <fieldset>
        <legend className="label">Niveau d'analyse</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="depth" value="essential" defaultChecked /> Essentiel <span className="text-muted">(rapide, ~1 min)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="depth" value="full" /> Complet <span className="text-muted">(salaire, stratégie, entretien, ~3 min)</span>
          </label>
        </div>
      </fieldset>
      <SubmitButton pending="Lancement…">Analyser cette offre</SubmitButton>
    </ActionForm>
  );
}
