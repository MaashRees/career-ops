import type { Provider, Tier } from "../env.ts";

export interface LlmRequest {
  /** Instructions + contexte candidat (mis en cache côté fournisseur). */
  system: string;
  /** Contenu variable : l'offre, la consigne du jour. */
  user: string;
  tier: Tier;
  maxTokens: number;
  /** Interruption externe (en plus du délai interne). */
  signal?: AbortSignal;
}

export interface LlmUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface LlmResult {
  text: string;
  provider: Provider;
  model: string;
  usage: LlmUsage;
}

/** Erreur fournisseur avec ce qu'il faut pour décider d'un repli. */
export class LlmError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;
  constructor(message: string, opts: { retryable: boolean; status?: number | null }) {
    super(message);
    this.name = "LlmError";
    this.retryable = opts.retryable;
    this.status = opts.status ?? null;
  }
}
