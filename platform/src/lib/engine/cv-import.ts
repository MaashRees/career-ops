import { numbersNotInSource } from "./facts.ts";

/**
 * Import de CV : le texte extrait du fichier est converti en markdown, puis VÉRIFIÉ par le modèle contre le texte brut
 * (réparation des dégâts d'extraction : mots coupés, colonnes mélangées, puces cassées, contenu perdu).
 * La sortie enregistrée contient le CV, puis une ligne-marqueur, puis les notes de contrôle : la page de validation
 * sépare les deux, et SEUL le CV est enregistré si l'utilisateur valide.
 */
export const VERIFICATION_MARKER = "<<<VERIFICATION>>>";

const MARKER_LINE = /^[ \t]*<<<VERIFICATION>>>[ \t]*$/m;

export function splitVerification(output: string): { markdown: string; notes: string } {
  const m = MARKER_LINE.exec(output);
  if (!m) return { markdown: output.trim(), notes: "" };
  return { markdown: output.slice(0, m.index).trim(), notes: output.slice(m.index + m[0].length).trim() };
}

export function composeOutput(markdown: string, notes: string): string {
  return `${markdown.trim()}\n\n${VERIFICATION_MARKER}\n${notes.trim()}\n`;
}

/** Réponse du contrôle : « CV corrigé », marqueur, « notes ». Null si le format n'est pas respecté. */
export function parseVerified(modelText: string): { markdown: string; notes: string } | null {
  if (!MARKER_LINE.test(modelText)) return null;
  const parts = splitVerification(modelText);
  return parts.markdown.length > 0 ? parts : null;
}

/**
 * Contrôle déterministe, indépendant du modèle : les nombres (dates, chiffres) du texte extrait doivent se
 * retrouver dans le CV converti, et inversement. Attrape un contenu perdu ou ajouté sans dépendre d'un second avis.
 */
export function crossCheckNumbers(raw: string, markdown: string): { lost: string[]; added: string[] } {
  return { lost: numbersNotInSource(raw, markdown), added: numbersNotInSource(markdown, raw) };
}

export function buildNotes(args: { aiNotes: string | null; failure: string; lost: string[]; added: string[] }): string {
  const parts: string[] = [];
  if (args.aiNotes) {
    parts.push(args.aiNotes.trim());
  } else {
    parts.push(
      `## À vérifier\n- La vérification automatique n'a pas abouti (${args.failure || "raison inconnue"}) : relis attentivement le CV converti, ligne par ligne, en le comparant à ton fichier.`,
    );
  }
  const lines: string[] = [];
  if (args.lost.length > 0) {
    lines.push(`- Nombres présents dans ton fichier mais **absents** du CV converti (contenu perdu ?) : ${args.lost.join(", ")}`);
  }
  if (args.added.length > 0) {
    lines.push(`- Nombres présents dans le CV converti mais **absents** de ton fichier (ajoutés par erreur ?) : ${args.added.join(", ")}`);
  }
  parts.push(
    `## Contrôle automatique des nombres\n${lines.length > 0 ? lines.join("\n") : "- Tous les nombres de ton fichier se retrouvent dans le CV converti, et aucun n'a été ajouté."}`,
  );
  return parts.join("\n\n");
}
