#!/usr/bin/env node
/**
 * Copie les prompts du moteur career-ops (../modes) dans platform/engine/modes.
 *
 * Pourquoi une copie plutôt qu'un import direct : l'app doit rester
 * déployable seule (Docker avec contexte = platform/, Vercel avec "root
 * directory" = platform). Relancer ce script après une mise à jour du moteur :
 *
 *   npm run sync-engine
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const platformRoot = path.resolve(here, "..");
const repoRoot = path.resolve(platformRoot, "..");
const FILES = ["_shared.md", "oferta.md", "_writing.md"];

const srcDir = path.join(repoRoot, "modes");
if (!existsSync(srcDir)) {
  console.error(`Dossier moteur introuvable : ${srcDir}\n(Ce script se lance depuis le dépôt complet.)`);
  process.exit(1);
}

const outDir = path.join(platformRoot, "engine", "modes");
mkdirSync(outDir, { recursive: true });
for (const f of FILES) {
  copyFileSync(path.join(srcDir, f), path.join(outDir, f));
  console.log(`✓ modes/${f}`);
}
let version = "inconnue";
try { version = readFileSync(path.join(repoRoot, "VERSION"), "utf8").trim().split(/\s+/)[0]; } catch {}
writeFileSync(
  path.join(platformRoot, "engine", "ENGINE_VERSION"),
  `career-ops ${version}\n`,
);
console.log(`Moteur synchronisé (career-ops ${version}).`);
