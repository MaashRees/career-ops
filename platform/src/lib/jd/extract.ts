import * as cheerio from "cheerio";

export interface ExtractedPosting {
  text: string;
  title?: string;
  company?: string;
  source: "json-ld" | "html";
}

const MAX_CHARS = 60_000;

function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, template, svg, iframe, form, nav, footer").remove();
  // Retours à la ligne cohérents pour les blocs.
  $("br").replaceWith("\n");
  $("li").each((_, el) => {
    $(el).prepend("• ");
  });
  $("p, div, section, article, h1, h2, h3, h4, h5, h6, li, tr, ul, ol").each((_, el) => {
    $(el).append("\n");
  });
  const text = $("body").text() || $.root().text();
  return text
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface JsonLdPosting {
  title?: string;
  description?: string;
  hiringOrganization?: { name?: string } | string;
  jobLocation?: unknown;
  baseSalary?: unknown;
  employmentType?: unknown;
  datePosted?: string;
  validThrough?: string;
}

function findJobPosting(node: unknown): JsonLdPosting | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findJobPosting(n);
      if (hit) return hit;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.includes("JobPosting")) return obj as JsonLdPosting;
  if (obj["@graph"]) return findJobPosting(obj["@graph"]);
  return null;
}

function locationText(loc: unknown): string {
  const arr = Array.isArray(loc) ? loc : loc ? [loc] : [];
  return arr
    .map((l) => {
      const addr = (l as { address?: Record<string, unknown> | string })?.address;
      if (typeof addr === "string") return addr;
      if (!addr) return "";
      return [addr.addressLocality, addr.addressRegion, addr.addressCountry]
        .map((v) => (typeof v === "string" ? v : (v as { name?: string })?.name))
        .filter(Boolean)
        .join(", ");
    })
    .filter(Boolean)
    .join(" | ");
}

/** Extrait l'offre : d'abord le JSON-LD « JobPosting » (le plus fiable), sinon le texte de la page. */
export function extractPosting(html: string): ExtractedPosting {
  const $ = cheerio.load(html);
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    const raw = $(el).contents().text();
    if (!raw.trim()) continue;
    try {
      const posting = findJobPosting(JSON.parse(raw));
      if (posting?.description) {
        const org = typeof posting.hiringOrganization === "string" ? posting.hiringOrganization : posting.hiringOrganization?.name;
        const description = htmlToText(`<body>${posting.description}</body>`);
        const lines = [
          posting.title ? `Title: ${posting.title}` : "",
          org ? `Company: ${org}` : "",
          locationText(posting.jobLocation) ? `Location: ${locationText(posting.jobLocation)}` : "",
          posting.baseSalary ? `Salary (structured data): ${JSON.stringify(posting.baseSalary)}` : "",
          posting.datePosted ? `Posted: ${posting.datePosted}` : "",
          "",
          description,
        ].filter((l, i) => l !== "" || i > 0);
        return {
          text: lines.join("\n").slice(0, MAX_CHARS),
          title: posting.title,
          company: org,
          source: "json-ld",
        };
      }
    } catch {
      // JSON-LD invalide : on essaie le suivant
    }
  }
  const title = $("title").first().text().trim() || $("h1").first().text().trim() || undefined;
  return { text: htmlToText(html).slice(0, MAX_CHARS), title, source: "html" };
}
