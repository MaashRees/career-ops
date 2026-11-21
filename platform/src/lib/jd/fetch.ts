import dns from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
import { extractPosting } from "./extract.ts";
import { assertPublicHttpUrl, isBlockedAddress, UnsafeUrlError } from "./ssrf.ts";

export type JdErrorCode = "unsafe_url" | "linkedin" | "http_error" | "unreadable" | "network" | "too_large";

export class JdError extends Error {
  readonly code: JdErrorCode;
  constructor(code: JdErrorCode, message: string) {
    super(message);
    this.name = "JdError";
    this.code = code;
  }
}

export interface FetchedPosting {
  text: string;
  title?: string;
  company?: string;
  finalUrl: string;
  source: string;
}

const MAX_BYTES = 2_500_000;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 20_000;
const MIN_USEFUL_CHARS = 500;
const USER_AGENT = "Mozilla/5.0 (compatible; JobHunterBot/1.0; +personal-use)";

/**
 * L'adresse est vérifiée AU MOMENT DE LA CONNEXION (lookup personnalisé), pas
 * seulement avant : c'est ce qui bloque le « DNS rebinding » (un nom qui
 * répond d'abord une IP publique, puis 127.0.0.1).
 */
const safeAgent = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, "", 4);
        const list = (addresses as unknown as dns.LookupAddress[]) ?? [];
        const bad = list.find((a) => isBlockedAddress(a.address));
        if (bad || list.length === 0) {
          return callback(new UnsafeUrlError("Adresse interne refusée."), "", 4);
        }
        if ((options as { all?: boolean })?.all) {
          return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
        }
        return callback(null, list[0].address, list[0].family);
      });
    },
  },
});

async function safeGet(
  start: string,
  accept: string,
): Promise<{ body: string; finalUrl: string; status: number }> {
  let current = assertPublicHttpUrl(start).toString();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertPublicHttpUrl(current);
    let resp;
    try {
      resp = await undiciFetch(current, {
        dispatcher: safeAgent,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": USER_AGENT, accept, "accept-language": "fr,en;q=0.8" },
      });
    } catch (e) {
      const cause = (e as { cause?: unknown })?.cause;
      if (e instanceof UnsafeUrlError || cause instanceof UnsafeUrlError) {
        throw new JdError("unsafe_url", "Cette adresse n'est pas accessible publiquement.");
      }
      throw new JdError("network", "La page n'a pas pu être chargée (réseau ou délai dépassé).");
    }
    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      const loc = resp.headers.get("location");
      await resp.body?.cancel();
      if (!loc) throw new JdError("http_error", "Redirection invalide.");
      current = new URL(loc, current).toString();
      continue;
    }
    // Lecture bornée.
    const reader = resp.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          throw new JdError("too_large", "La page est trop volumineuse.");
        }
        chunks.push(value);
      }
    }
    return { body: Buffer.concat(chunks).toString("utf8"), finalUrl: current, status: resp.status };
  }
  throw new JdError("http_error", "Trop de redirections.");
}

/** Pour les ATS qui publient une API JSON publique, on l'utilise (plus fiable que le HTML rendu en JS). */
export function knownAtsApi(rawUrl: string): { api: string; kind: "greenhouse" | "lever" } | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    const jobsIdx = parts.indexOf("jobs");
    const board = parts[0];
    const id = jobsIdx >= 0 ? parts[jobsIdx + 1] : u.searchParams.get("gh_jid");
    if (board && id && /^\d+$/.test(id)) {
      return { kind: "greenhouse", api: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${id}` };
    }
  }
  if (host === "jobs.lever.co") {
    const [company, id] = parts;
    if (company && id && /^[0-9a-f-]{36}$/i.test(id)) {
      return { kind: "lever", api: `https://api.lever.co/v0/postings/${encodeURIComponent(company)}/${id}` };
    }
  }
  return null;
}

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

async function fromAtsApi(api: { api: string; kind: "greenhouse" | "lever" }, url: string): Promise<FetchedPosting | null> {
  try {
    const r = await safeGet(api.api, "application/json");
    if (r.status !== 200) return null;
    const data = JSON.parse(r.body) as Record<string, unknown>;
    if (api.kind === "greenhouse") {
      const content = typeof data.content === "string" ? decodeHtmlEntities(data.content) : "";
      const loc = (data.location as { name?: string } | undefined)?.name;
      const extracted = extractPosting(`<body>${content}</body>`);
      const title = typeof data.title === "string" ? data.title : undefined;
      const text = [title ? `Title: ${title}` : "", loc ? `Location: ${loc}` : "", "", extracted.text].join("\n").trim();
      return text.length >= 200 ? { text, title, finalUrl: url, source: "greenhouse-api" } : null;
    }
    const desc = typeof data.descriptionPlain === "string" ? data.descriptionPlain : "";
    const lists = Array.isArray(data.lists)
      ? (data.lists as Array<{ text?: string; content?: string }>)
          .map((l) => `${l.text ?? ""}\n${extractPosting(`<body>${l.content ?? ""}</body>`).text}`)
          .join("\n\n")
      : "";
    const title = typeof data.text === "string" ? data.text : undefined;
    const loc = (data.categories as { location?: string } | undefined)?.location;
    const text = [title ? `Title: ${title}` : "", loc ? `Location: ${loc}` : "", "", desc, lists].join("\n").trim();
    return text.length >= 200 ? { text, title, finalUrl: url, source: "lever-api" } : null;
  } catch {
    return null;
  }
}

/** Récupère le texte d'une offre à partir de son URL. Lève JdError avec un message prêt à afficher. */
export async function fetchPosting(rawUrl: string): Promise<FetchedPosting> {
  let url: URL;
  try {
    url = assertPublicHttpUrl(rawUrl.trim());
  } catch (e) {
    throw new JdError("unsafe_url", e instanceof UnsafeUrlError ? e.message : "URL invalide.");
  }
  // Règle du moteur : on n'aspire pas LinkedIn (accès restreint). On demande le texte.
  if (/(^|\.)linkedin\.com$/i.test(url.hostname)) {
    throw new JdError("linkedin", "LinkedIn n'autorise pas la lecture automatique : colle le texte de l'offre (ou l'URL de la page carrière de l'entreprise).");
  }

  const api = knownAtsApi(url.toString());
  if (api) {
    const hit = await fromAtsApi(api, url.toString());
    if (hit) return hit;
  }

  const page = await safeGet(url.toString(), "text/html,application/xhtml+xml");
  if (page.status >= 400) {
    throw new JdError(
      "http_error",
      page.status === 404 || page.status === 410
        ? "L'offre est introuvable (404) : elle est probablement clôturée."
        : page.status === 401 || page.status === 403 || page.status === 429
          ? `Ce site refuse la lecture automatique (code ${page.status}) : c'est fréquent sur les grands sites d'emploi. Colle le texte de l'offre à la place.`
          : `La page a répondu ${page.status} : colle le texte de l'offre à la place.`,
    );
  }
  const extracted = extractPosting(page.body);
  if (extracted.text.length < MIN_USEFUL_CHARS) {
    throw new JdError("unreadable", "La page ne contient pas le texte de l'offre (probablement chargé par JavaScript ou protégé). Colle le texte de l'offre.");
  }
  return {
    text: extracted.text,
    title: extracted.title,
    company: extracted.company,
    finalUrl: page.finalUrl,
    source: extracted.source,
  };
}

/** Clé de dédoublonnage d'une URL : sans paramètres de suivi, sans ancre, hôte en minuscules. */
export function urlKey(raw: string): string | null {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/\.$/, "");
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$|refId$|trk|trackingId|source$|src$|gh_src$|lever-source)/i.test(key)) {
        u.searchParams.delete(key);
      }
    }
    u.searchParams.sort();
    // Slash final du chemin ignoré (…/42/?a=1 et …/42?a=1 sont la même offre).
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    const s = u.toString();
    return s.endsWith("/") && !u.search ? s.slice(0, -1) : s;
  } catch {
    return null;
  }
}
