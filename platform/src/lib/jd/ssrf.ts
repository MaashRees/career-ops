import { isIP } from "node:net";

/**
 * Protection SSRF : les URL d'offres sont saisies par des utilisateurs, donc non
 * fiables. Aucune requête ne doit jamais atteindre le réseau interne du serveur
 * (localhost, réseau privé, métadonnées cloud 169.254.169.254, etc.).
 */

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local + métadonnées cloud
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // réservé + broadcast
];

function inV4Block(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  });
}

/** Vrai si l'adresse (v4 ou v6) ne doit pas être jointe. */
export function isBlockedAddress(address: string): boolean {
  let ip = address.trim().toLowerCase();
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  const zone = ip.indexOf("%");
  if (zone !== -1) ip = ip.slice(0, zone);

  const kind = isIP(ip);
  if (kind === 4) return inV4Block(ip);
  if (kind === 6) {
    if (ip === "::" || ip === "::1") return true;
    // IPv4 mappée / compatible : ::ffff:a.b.c.d ou ::ffff:aabb:ccdd
    const mapped = ip.match(/^(?:0{0,4}:){0,5}(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return inV4Block(mapped[1]);
    const mappedHex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = Number.parseInt(mappedHex[1], 16);
      const lo = Number.parseInt(mappedHex[2], 16);
      return inV4Block(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    const first = Number.parseInt(ip.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 (ULA)
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (ip.startsWith("64:ff9b:")) return true; // NAT64
    return false;
  }
  return true; // pas une adresse IP valide : on refuse par prudence
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

/** Contrôle syntaxique de l'URL (avant toute résolution DNS). */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("URL invalide.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Seules les URL http(s) sont acceptées.");
  }
  if (url.username || url.password) throw new UnsafeUrlError("Les URL avec identifiants sont refusées.");
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new UnsafeUrlError("Adresse interne refusée.");
  }
  if (isIP(host.replace(/^\[|\]$/g, "")) !== 0 && isBlockedAddress(host)) {
    throw new UnsafeUrlError("Adresse interne refusée.");
  }
  if (url.port && !["80", "443", "8080", "8443"].includes(url.port)) {
    throw new UnsafeUrlError("Port non autorisé.");
  }
  return url;
}
