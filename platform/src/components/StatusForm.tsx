"use client";

import { updateApplication } from "@/actions/applications";
import { STATUSES, STATUS_LABELS } from "@/lib/states";
import { ActionForm, SubmitButton } from "./forms";

export function StatusForm({
  applicationId,
  status,
  notes,
  appliedOn,
}: {
  applicationId: string;
  status: string;
  notes: string;
  appliedOn: string | null;
}) {
  return (
    <ActionForm action={updateApplication.bind(null, applicationId)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="status">Statut</label>
          <select id="status" name="status" defaultValue={status} className="input">
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="applied_on">Date de candidature</label>
          <input id="applied_on" name="applied_on" type="date" defaultValue={appliedOn ?? ""} className="input" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={notes} className="input" placeholder="Contact, date de relance, ressenti…" maxLength={5000} />
      </div>
      <SubmitButton pending="Enregistrement…">Enregistrer</SubmitButton>
    </ActionForm>
  );
}
