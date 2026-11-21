/**
 * Retire des prompts du moteur les consignes réservées à un agent AVEC outils
 * (shell, navigateur, écriture de fichiers). Ici le modèle n'a aucun outil :
 * s'il suivait ces consignes, il répondrait par des appels d'outils au lieu
 * d'un rapport. Port fidèle de stripToolInstructions() de openrouter-runner.mjs.
 *
 * Les sections sont repérées par leur titre (pas par numéro de ligne) : une
 * édition des modes ne les déplace pas, et un titre disparu laisse le texte intact.
 */
type Section = string | { heading: string; until: string };

const TOOL_SECTIONS: Section[] = [
  "## Liveness gate (URL inputs)",
  "## Bounded Research Budget",
  "### Tools",
  { heading: "### Subagent delegation (cost guardrail)", until: "<!-- guardrail:agency-confirmation -->" },
  "### Prior-contact FYI (non-scoring)",
  "### 1b. Embed ATS keyword coverage",
  "### 2. Record in tracker",
  "### 3. Salary observations (desired ask only)",
];

const TOOL_LINES = [
  "1b. **First evaluation of each session:** Run `node cv-sync-check.mjs`",
  "4. Use WebSearch for comp and company data",
  '- Search: `"{company}"',
  "- `{###}` = next sequential number",
];

const READ_CV_RULE = "**RULE: NEVER hardcode metrics from proof points.**";

export function stripToolInstructions(text: string): string {
  let lines = text.split("\n");
  for (const section of TOOL_SECTIONS) {
    const heading = typeof section === "string" ? section : section.heading;
    const until = typeof section === "string" ? undefined : section.until;
    const start = lines.findIndex((l) => l.trimEnd() === heading);
    if (start === -1) continue;
    const level = (heading.match(/^#+/) as RegExpMatchArray)[0].length;
    const headingRe = new RegExp(`^#{1,${level}} `);
    const next = lines.findIndex(
      (l, i) => i > start && (headingRe.test(l) || (until !== undefined && l.trimEnd() === until)),
    );
    lines.splice(start, (next === -1 ? lines.length : next) - start);
  }
  lines = lines.filter((l) => !TOOL_LINES.some((p) => l.startsWith(p)));
  lines = lines.map((l) =>
    l.startsWith(READ_CV_RULE) ? `${READ_CV_RULE} Take them from the CV below.` : l,
  );
  return lines.join("\n");
}
