import { LlmError } from "./types.ts";

// Une analyse complète peut durer plusieurs minutes (le processus est toujours allumé : pas de limite d'hébergeur).
export const REQUEST_TIMEOUT_MS = 600_000;

/** Statuts pour lesquels l'autre fournisseur peut prendre le relais. */
export function isRetryableStatus(status: number, body: string): boolean {
  if (status === 408 || status === 409 || status === 429) return true;
  if (status >= 500) return true; // 500, 502, 503, 529 (Anthropic "overloaded")…
  // Crédit épuisé / facturation : l'autre fournisseur peut encore répondre.
  if (status === 402) return true;
  if (status === 400 && /credit balance|billing|insufficient/i.test(body)) return true;
  return false;
}

/** Message utilisateur sans jamais recopier de secret. */
function safeSnippet(body: string): string {
  return body.replace(/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, "$1…").slice(0, 200);
}

export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  externalSignal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onAbort, { once: true });

  let resp: Response;
  try {
    resp = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    throw new LlmError(
      aborted
        ? `Délai dépassé (${Math.round(REQUEST_TIMEOUT_MS / 1000)} s)`
        : `Réseau : ${(e as Error)?.message ?? "erreur inconnue"}`,
      { retryable: true },
    );
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onAbort);
  }

  const text = await resp.text();
  if (!resp.ok) {
    throw new LlmError(`HTTP ${resp.status} : ${safeSnippet(text)}`, {
      retryable: isRetryableStatus(resp.status, text),
      status: resp.status,
    });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmError("Réponse du fournisseur illisible (JSON invalide)", { retryable: true });
  }
}
