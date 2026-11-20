import { readFileSync } from "node:fs";
import path from "node:path";

export type ModeFile = "_shared.md" | "oferta.md" | "_writing.md";

const cache = new Map<ModeFile, string>();

/**
 * Lit un prompt du moteur copié dans platform/engine/modes (voir
 * scripts/sync-engine.mjs). Chemin volontairement statique : Next ne trace ainsi
 * que ce sous-dossier, pas tout le projet. Mis en cache pour la durée du processus.
 */
export function readMode(name: ModeFile): string {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const content = readFileSync(path.join(process.cwd(), "engine", "modes", name), "utf8");
  cache.set(name, content);
  return content;
}
