import { fallbackProvider, primaryProvider, type Provider } from "../env.ts";
import { callAnthropic } from "./anthropic.ts";
import { callOpenRouter } from "./openrouter.ts";
import { LlmError, type LlmRequest, type LlmResult } from "./types.ts";

export { LlmError } from "./types.ts";
export type { LlmRequest, LlmResult, LlmUsage } from "./types.ts";

type Caller = (req: LlmRequest, apiKey: string, fetchImpl?: typeof fetch) => Promise<LlmResult>;

const CALLERS: Record<Provider, Caller> = {
  anthropic: callAnthropic,
  openrouter: callOpenRouter,
};

function apiKeyFor(provider: Provider): string {
  const key = (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENROUTER_API_KEY) ?? "";
  return key.trim();
}

/**
 * Appelle le fournisseur principal ; si celui-ci est en panne, saturé ou à
 * court de crédit ET que l'autre fournisseur est configuré, retente chez lui
 * avec le même niveau (économique / standard / premium).
 */
export async function complete(req: LlmRequest, fetchImpl: typeof fetch = fetch): Promise<LlmResult> {
  const primary = primaryProvider();
  if (!primary) {
    throw new LlmError("Aucune clé IA configurée sur le serveur (ANTHROPIC_API_KEY ou OPENROUTER_API_KEY).", {
      retryable: false,
    });
  }
  try {
    return await CALLERS[primary](req, apiKeyFor(primary), fetchImpl);
  } catch (e) {
    const fallback = fallbackProvider();
    if (e instanceof LlmError && e.retryable && fallback) {
      return await CALLERS[fallback](req, apiKeyFor(fallback), fetchImpl);
    }
    throw e;
  }
}
