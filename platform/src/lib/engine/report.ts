/**
 * Lecture et validation du rapport rendu par le modèle. Reprend la logique
 * prudente du moteur : un score illisible devient « non noté » (N/A), jamais un
 * chiffre deviné — et une note sur une autre échelle que /5 est refusée.
 */

export interface ParsedReport {
  company: string;
  role: string;
  score: number | null;
  decision: string | null;
  legitimacy: string | null;
  archetype: string | null;
}

const TITLE_RE = /^#\s*(?:Evaluation|Évaluation|Evaluación|Bewertung)\s*[:：]\s*(.+?)\s*$/im;

function stripMd(s: string): string {
  return s.replace(/[*_`]+/g, "").trim();
}

/** Découpe « Société — Poste » (tiret long, demi-cadratin ou « - » entouré d'espaces). */
export function splitTitle(raw: string): { company: string; role: string } {
  const t = stripMd(raw);
  const m = t.match(/^(.+?)\s+[—–-]\s+(.+)$/) ?? t.match(/^(.+?)\s*[—–]\s*(.+)$/);
  if (m) return { company: m[1].trim(), role: m[2].trim() };
  return { company: t, role: "" };
}

/**
 * Extrait la note /5. Refuse toute autre échelle (8/10…) et tout ce qui n'est
 * pas un nombre entre 0 et 5 : N/A plutôt qu'une mauvaise note.
 */
export function parseScore(report: string): number | null {
  const m = report.match(/\*{0,2}Score\*{0,2}\s*[:：][\s*]*(\d+(?:[.,]\d+)?)([^\r\n]*)/i);
  if (!m) return null;
  const value = Number.parseFloat(m[1].replace(",", "."));
  const rest = m[2].replace(/^\*+/, ""); // « **3.8**/5 »
  const denom = rest.match(/^\s*\/\s*(\d+(?:[.,]\d+)?)/);
  if (denom && Number.parseFloat(denom[1].replace(",", ".")) !== 5) return null;
  if (!denom && /\//.test(rest)) return null; // ex. « 4.2 (fit) /10 »
  if (!Number.isFinite(value) || value < 0 || value > 5) return null;
  return Math.round(value * 10) / 10;
}

function field(report: string, label: string): string | null {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`, "i");
  const m = report.match(re);
  const v = m ? stripMd(m[1]) : "";
  return v && v !== "—" && v !== "-" ? v : null;
}

export function parseReport(report: string): ParsedReport {
  const title = report.match(TITLE_RE);
  const { company, role } = title ? splitTitle(title[1]) : { company: "", role: "" };
  return {
    company,
    role,
    score: parseScore(report),
    decision: field(report, "Decision"),
    legitimacy: field(report, "Legitimacy"),
    archetype: field(report, "Archetype"),
  };
}

const TOOL_MARKUP: RegExp[] = [
  /<tool_call[\s>]/i,
  /<\/tool_call>/i,
  /<dots_function_call[\s>]/i,
  /<\|tool_call_start\|>/i,
  /<arg_key>/i,
  /<parameter[\s>]/i,
  /<invoke[\s>]/i,
  /\{\s*"tool"\s*:\s*"(?:browser_navigate|browser_snapshot|bash|playwright)"/i,
  /(?:browser_navigate|browser_snapshot)\s*[<{("']/i,
];

export type Validation =
  | { ok: true }
  | { ok: false; code: "needs_confirmation" | "not_a_report"; reason: string; confirmation?: string };

/** Le modèle a-t-il vraiment rendu un rapport ? (et pas une question, un refus ou des appels d'outils) */
export function validateReport(content: string): Validation {
  const text = (content ?? "").trim();
  if (!text) return { ok: false, code: "not_a_report", reason: "Réponse vide." };

  const needs = text.match(/^\s*(?:status:\s*)?needs_confirmation\b[:\s]*(.*)$/im);
  if (needs && text.length < 600) {
    return { ok: false, code: "needs_confirmation", reason: "Confirmation requise.", confirmation: needs[1].trim() };
  }
  if (/^---DEAD_POSTING---\s*$/m.test(text)) {
    return { ok: false, code: "not_a_report", reason: "L'offre semble clôturée ou illisible." };
  }
  for (const re of TOOL_MARKUP) {
    if (re.test(text)) return { ok: false, code: "not_a_report", reason: "Le modèle a répondu par des appels d'outils au lieu d'un rapport." };
  }
  if (text.length < 800) return { ok: false, code: "not_a_report", reason: "Rapport trop court pour être exploitable." };
  if (!/^\s*#{1,3}\s+/m.test(text)) return { ok: false, code: "not_a_report", reason: "Le rapport n'est pas du Markdown structuré." };
  if (parseScore(text) === null && !/\*\*Score:\*\*/i.test(text)) {
    return { ok: false, code: "not_a_report", reason: "Pas de note /5 dans le rapport." };
  }
  return { ok: true };
}

/** Ajoute la section d'archivage de l'offre (obligatoire dans le moteur) si absente. */
export function withJdArchive(report: string, jdText: string): string {
  if (/^##\s+Job Description \(archived verbatim\)/im.test(report)) return report;
  return `${report.trimEnd()}\n\n## Job Description (archived verbatim)\n\n${jdText.trim()}\n`;
}

/** Retire un éventuel bloc de code englobant toute la réponse. */
export function unwrapFence(text: string): string {
  const m = text.trim().match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return m ? m[1].trim() : text.trim();
}
