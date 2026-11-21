import { modelFor } from "../env.ts";
import { postJson } from "./http.ts";
import { LlmError, type LlmRequest, type LlmResult } from "./types.ts";

const URL_MESSAGES = "https://api.anthropic.com/v1/messages";

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  error?: { message?: string };
}

export async function callAnthropic(
  req: LlmRequest,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LlmResult> {
  const model = modelFor("anthropic", req.tier);
  const data = (await postJson(
    URL_MESSAGES,
    { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    {
      model,
      max_tokens: req.maxTokens,
      // Le bloc système (prompts du moteur + CV + profil) est identique d'un
      // appel à l'autre pour un même utilisateur : on le met en cache.
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: req.user }],
    },
    req.signal,
    fetchImpl,
  )) as AnthropicResponse;

  if (data.error) throw new LlmError(data.error.message ?? "Erreur Anthropic", { retryable: false });

  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
  if (!text.trim()) throw new LlmError("Réponse vide du modèle", { retryable: true });
  const truncated = data.stop_reason === "max_tokens";
  if (truncated && !req.allowTruncated) {
    throw new LlmError("Réponse tronquée (limite de longueur atteinte).", { retryable: false });
  }

  return {
    text,
    truncated,
    provider: "anthropic",
    model,
    usage: {
      input: data.usage?.input_tokens ?? 0,
      output: data.usage?.output_tokens ?? 0,
      cacheRead: data.usage?.cache_read_input_tokens ?? 0,
      cacheWrite: data.usage?.cache_creation_input_tokens ?? 0,
    },
  };
}
