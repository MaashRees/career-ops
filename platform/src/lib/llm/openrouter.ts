import { modelFor, siteUrl } from "../env.ts";
import { postJson } from "./http.ts";
import { LlmError, type LlmRequest, type LlmResult } from "./types.ts";

const URL_CHAT = "https://openrouter.ai/api/v1/chat/completions";

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
  };
  error?: { message?: string; code?: number | string };
}

export async function callOpenRouter(
  req: LlmRequest,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LlmResult> {
  const model = modelFor("openrouter", req.tier);
  const data = (await postJson(
    URL_CHAT,
    {
      authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": siteUrl(),
      "X-Title": "Chasseur d'emploi",
    },
    {
      model,
      max_tokens: req.maxTokens,
      messages: [
        {
          role: "system",
          content: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        },
        { role: "user", content: req.user },
      ],
    },
    req.signal,
    fetchImpl,
  )) as OpenRouterResponse;

  if (data.error) {
    const code = Number(data.error.code);
    throw new LlmError(data.error.message ?? "Erreur OpenRouter", {
      retryable: code === 402 || code === 429 || code >= 500,
      status: Number.isFinite(code) ? code : null,
    });
  }

  const choice = data.choices?.[0];
  const text = choice?.message?.content ?? "";
  if (!text.trim()) throw new LlmError("Réponse vide du modèle", { retryable: true });
  if (choice?.finish_reason === "length") {
    throw new LlmError("Réponse tronquée (limite de longueur atteinte) : relance en mode « essentiel ».", {
      retryable: false,
    });
  }

  const details = data.usage?.prompt_tokens_details;
  const cacheRead = details?.cached_tokens ?? 0;
  const cacheWrite = details?.cache_write_tokens ?? 0;
  return {
    text,
    provider: "openrouter",
    model,
    usage: {
      // prompt_tokens inclut les tokens lus/écrits en cache : on les sépare.
      input: Math.max(0, (data.usage?.prompt_tokens ?? 0) - cacheRead - cacheWrite),
      output: data.usage?.completion_tokens ?? 0,
      cacheRead,
      cacheWrite,
    },
  };
}
