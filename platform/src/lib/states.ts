/** États canoniques des candidatures (source : templates/states.yml du moteur). */
export const STATUSES = [
  "Evaluated",
  "Applied",
  "Responded",
  "Assessment",
  "Interview",
  "Offer",
  "Hired",
  "Rejected",
  "Discarded",
  "SKIP",
] as const;
export type Status = (typeof STATUSES)[number];

/** Libellés français (l'état stocké reste l'identifiant canonique anglais du moteur). */
export const STATUS_LABELS: Record<string, string> = {
  Evaluated: "Évaluée",
  Speculative: "Spéculative",
  Applied: "Postulée",
  Responded: "Réponse reçue",
  Assessment: "Test / screening",
  Interview: "Entretien",
  Offer: "Offre reçue",
  Hired: "Embauchée",
  Rejected: "Refusée",
  Discarded: "Abandonnée",
  SKIP: "À ignorer",
};

export function isStatus(v: string): v is Status {
  return (STATUSES as readonly string[]).includes(v);
}

/** Seuil du moteur : sous 4,0/5 on déconseille de postuler. */
export const APPLY_MIN = 4.0;

export function scoreBand(score: number | null): "none" | "strong" | "good" | "weak" {
  if (score == null) return "none";
  if (score >= 4.5) return "strong";
  if (score >= APPLY_MIN) return "good";
  return "weak";
}
