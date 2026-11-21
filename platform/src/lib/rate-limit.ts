/**
 * Limiteur « fenêtre glissante » en mémoire, pour freiner les essais de mots de passe
 * et les envois de liens. Une seule instance du serveur (voir docs) ; Supabase applique
 * en plus ses propres limites côté Auth. Mémoire bornée.
 */
const hits = new Map<string, number[]>();
const MAX_KEYS = 5000;

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now(),
): { ok: boolean; retryAfterSec: number } {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000)) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > MAX_KEYS) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      if (hits.size <= MAX_KEYS / 2) break;
    }
  }
  return { ok: true, retryAfterSec: 0 };
}

export function resetRateLimits(): void {
  hits.clear();
}

/** Adresse du client, telle que transmise par le reverse proxy de l'hébergeur. */
export function clientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
