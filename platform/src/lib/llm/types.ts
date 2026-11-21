import type { Provider, Tier } from "../env.ts";

export interface LlmRequest {
  /** Instructions + contexte candidat (mis en cache côté fournisseur). */
  system: string;
  /** Contenu variable : l'offre, la consigne du jour. */
  user: string;
  tier: Tier;
  maxTokens: number;
  /**
   * Accepter une réponse coupée par la limite de longueur (stop_reason max_tokens / finish_reason length).
   * Par défaut une réponse tronquée est une ERREUR (un CV ou une lettre incomplets seraient trompeurs).
   * Pour un rapport d'évaluation, la note et les premiers blocs sont déjà là : on garde, avec un avertissement.
   */
  allowTruncated?: boolean;
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
  /** Vrai si le modèle a été coupé par la limite de longueur (seulement possible avec allowTruncated). */
  truncated: boolean;
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
