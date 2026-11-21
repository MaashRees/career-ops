/**
 * Protection CSRF des routes POST « hors Server Action » (ex. déconnexion).
 * Accepte : requête same-origin déclarée par le navigateur (Sec-Fetch-Site), ou en-tête
 * Origin égal à l'URL publique du site. Refuse tout le reste (y compris l'absence d'indication).
 */
export function isSameOriginRequest(
  headers: { get(name: string): string | null },
  siteUrl: string,
): boolean {
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite === "same-origin") return true;
  if (fetchSite && fetchSite !== "none") return false; // cross-site / same-site : refus
  const origin = headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(siteUrl).origin;
  } catch {
    return false;
  }
}
