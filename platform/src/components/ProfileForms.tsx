"use client";

import { saveCv, saveProfile, uploadCv } from "@/actions/profile";
import type { UserSettings } from "@/lib/engine/profile";
import type { Tier } from "@/lib/env";
import { ActionForm, SubmitButton } from "./forms";

const TIER_LABELS: Record<Tier, string> = {
  economy: "Économique — le plus rapide et le moins cher",
  standard: "Standard — équilibré (recommandé)",
  premium: "Premium — le plus capable, plus lent et plus cher",
};

export function CvForms({ cv }: { cv: string }) {
  return (
    <div className="space-y-6">
      <ActionForm action={uploadCv}>
        <div>
          <label className="label" htmlFor="file">Importer un fichier (PDF, .md ou .txt)</label>
          <input id="file" name="file" type="file" accept=".pdf,.md,.txt,application/pdf,text/plain,text/markdown" required className="input" />
          <p className="hint">Le texte est extrait puis converti en markdown par l'IA, que tu valides ensuite. Le fichier lui-même n'est pas conservé.</p>
        </div>
        <SubmitButton className="btn btn-secondary" pending="Lecture du fichier…">Convertir mon CV</SubmitButton>
      </ActionForm>

      <ActionForm action={saveCv}>
        <div>
          <label className="label" htmlFor="cv_md">Mon CV (markdown ou texte)</label>
          <textarea id="cv_md" name="cv_md" rows={18} defaultValue={cv} className="input font-mono text-sm" placeholder={"# Prénom Nom\n\n## Experience\n### Entreprise — Ville\n**Poste**\n2021 – 2024\n- Réalisation…"} />
          <p className="hint">C'est la seule source de vérité : l'IA ne doit jamais rien ajouter qui n'y figure pas.</p>
        </div>
        <SubmitButton pending="Enregistrement…">Enregistrer le CV</SubmitButton>
      </ActionForm>
    </div>
  );
}

export function PreferencesForm({ settings, allowedTiers }: { settings: UserSettings; allowedTiers: Tier[] }) {
  const p = settings.profile;
  return (
    <ActionForm action={saveProfile}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="full_name" label="Nom complet" defaultValue={p.full_name} />
        <Field id="email" label="E-mail de contact" type="email" defaultValue={p.email} />
        <Field id="phone" label="Téléphone" defaultValue={p.phone} />
        <Field id="location" label="Ville / localisation" defaultValue={p.location} />
        <Field id="linkedin" label="LinkedIn" defaultValue={p.linkedin} placeholder="linkedin.com/in/…" />
        <Field id="years_of_experience" label="Années d'expérience" defaultValue={p.years_of_experience?.toString()} inputMode="decimal" />
      </div>

      <div>
        <label className="label" htmlFor="target_roles">Postes visés (un par ligne)</label>
        <textarea id="target_roles" name="target_roles" rows={3} defaultValue={(p.target_roles ?? []).join("\n")} className="input" placeholder={"Product Marketing Manager\nResponsable communication"} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="work_mode" label="Mode de travail" defaultValue={p.work_mode} placeholder="Télétravail 3 j/semaine, hybride…" />
        <Field id="countries" label="Pays / zone de recherche" defaultValue={p.countries} placeholder="France, Belgique, remote UE" />
        <Field id="salary_target" label="Salaire visé" defaultValue={p.salary_target} placeholder="45-55 k€ brut/an" />
        <Field id="salary_minimum" label="Salaire minimum (plancher)" defaultValue={p.salary_minimum} placeholder="42 k€" />
        <Field id="salary_currency" label="Devise" defaultValue={p.salary_currency ?? "EUR"} />
        <Field id="work_authorization" label="Autorisation de travail" defaultValue={p.work_authorization} placeholder="UE, pas de visa nécessaire" />
      </div>

      <div>
        <label className="label" htmlFor="deal_breakers">Règles bloquantes (une par ligne)</label>
        <textarea id="deal_breakers" name="deal_breakers" rows={3} defaultValue={(p.deal_breakers ?? []).join("\n")} className="input" placeholder={"Pas de poste 100 % sur site\nPas de CDD de moins de 12 mois"} />
        <p className="hint">Si une offre enfreint une règle, l'analyse s'arrête et te demande confirmation.</p>
      </div>

      <div>
        <label className="label" htmlFor="profile_md">Ce qui me rend unique, ce que j'aime / ce que je fuis</label>
        <textarea id="profile_md" name="profile_md" rows={6} defaultValue={settings.profile_md} className="input" placeholder="Mon point fort, le type de mission qui m'attire, mes réalisations dont je suis le plus fière…" />
        <p className="hint">Texte libre lu par l'IA pour mieux cibler les offres. Ne mets ici que des faits vrais.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="output_language">Langue des rapports</label>
          <select id="output_language" name="output_language" defaultValue={settings.output_language} className="input">
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="de">Deutsch</option>
            <option value="it">Italiano</option>
            <option value="pt">Português</option>
            <option value="nl">Nederlands</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="spend_tier">Niveau de l'IA</label>
          <select id="spend_tier" name="spend_tier" defaultValue={settings.spend_tier} className="input">
            {allowedTiers.map((t) => (
              <option key={t} value={t}>{TIER_LABELS[t]}</option>
            ))}
          </select>
        </div>
      </div>

      <SubmitButton pending="Enregistrement…">Enregistrer mes préférences</SubmitButton>
    </ActionForm>
  );
}

function Field({
  id,
  label,
  defaultValue,
  type = "text",
  placeholder,
  inputMode,
}: {
  id: string;
  label: string;
  defaultValue?: string | null;
  type?: string;
  placeholder?: string;
  inputMode?: "text" | "decimal";
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} name={id} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} inputMode={inputMode} className="input" />
    </div>
  );
}
