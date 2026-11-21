/**
 * Garde-fou « chiffres inventés » pour le CV adapté : tout nombre significatif
 * du document généré doit exister dans le CV d'origine. Ne prouve pas que tout
 * est exact, mais attrape l'invention la plus fréquente (un chiffre, une date).
 */
const NUMBER_RE = /\d[\d\s.,]*\d|\d/g;

function normalizeNumber(raw: string): string {
  return raw.replace(/[\s.,]/g, "");
}

function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(NUMBER_RE)) {
    const n = normalizeNumber(m[0]);
    if (n) out.add(n);
  }
  return out;
}

/** Nombres du document généré absents de la source. Les nombres à 1 chiffre (puces numérotées, « 3 ans ») sont ignorés. */
export function numbersNotInSource(generated: string, source: string): string[] {
  const known = numbersIn(source);
  const missing = new Set<string>();
  for (const m of generated.matchAll(NUMBER_RE)) {
    const n = normalizeNumber(m[0]);
    if (n.length >= 2 && !known.has(n)) missing.add(m[0].trim());
  }
  return [...missing].slice(0, 30);
}
