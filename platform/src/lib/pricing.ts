/**
 * Estimation de coût, en dollars, à partir du nombre de tokens. Tarifs publics
 * d'OpenRouter au moment de l'écriture (par token). Purement indicatif : seule
 * la facture du fournisseur fait foi. Un modèle inconnu renvoie null.
 */
interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const PER_MTOK = (input: number, output: number, cacheRead: number, cacheWrite: number): Price => ({
  input: input / 1e6,
  output: output / 1e6,
  cacheRead: cacheRead / 1e6,
  cacheWrite: cacheWrite / 1e6,
});

const PRICES: Record<string, Price> = {
  "claude-haiku-5-5": PER_MTOK(0.1, 0.5, 0.01, 0.125),
  "claude-sonnet-5-5": PER_MTOK(2, 10, 0.1, 2.5),
  "claude-opus-5-5": PER_MTOK(4, 20, 0.2, 5),
};

function normalize(model: string): string {
  return model.replace(/^anthropic\//, "").replace(/\./g, "-");
}

export function estimateCostUsd(
  model: string | null | undefined,
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number },
): number | null {
  if (!model) return null;
  const p = PRICES[normalize(model)];
  if (!p) return null;
  return (
    usage.input * p.input +
    usage.output * p.output +
    usage.cacheRead * p.cacheRead +
    usage.cacheWrite * p.cacheWrite
  );
}
