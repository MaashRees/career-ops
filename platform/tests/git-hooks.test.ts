/**
 * Vérifie les hooks Git du dépôt (identité, branches protégées, messages) dans un
 * dépôt temporaire : aucun risque pour le vrai dépôt.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

const HOOKS = path.resolve(import.meta.dirname, "..", "scripts", "git-hooks");
const OK_EMAIL = "seerharley03@gmail.com";
const OK_NAME = "Seer MENSAH-ASSIAKOLEY";

let work: string;
let remote: string;
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_TERMINAL_PROMPT: "0" };

function git(args: string[], cwd = work) {
  return spawnSync("git", args, { cwd, env, encoding: "utf8" });
}
function must(args: string[], cwd = work) {
  const r = git(args, cwd);
  assert.equal(r.status, 0, `git ${args.join(" ")} :\n${r.stderr}`);
  return r.stdout;
}
let n = 0;
function commit(message: string, extra: string[] = []) {
  writeFileSync(path.join(work, `f${n++}.txt`), String(n));
  must(["add", "-A"]);
  return git(["commit", "-q", "-m", message, ...extra]);
}
function setIdentity(email: string, name = OK_NAME) {
  must(["config", "user.email", email]);
  must(["config", "user.name", name]);
}

before(() => {
  work = mkdtempSync(path.join(tmpdir(), "hooks-work-"));
  remote = mkdtempSync(path.join(tmpdir(), "hooks-remote-"));
  execFileSync("git", ["init", "-q", "--bare", remote], { env });
  must(["init", "-q", "-b", "main"]);
  must(["remote", "add", "origin", remote]);
  setIdentity(OK_EMAIL);
  // Premier commit sur main sans hooks (amorçage du dépôt de test).
  assert.equal(commit("init", ["--no-verify"]).status, 0);
  must(["config", "core.hooksPath", HOOKS]);
});
after(() => {
  rmSync(work, { recursive: true, force: true });
  rmSync(remote, { recursive: true, force: true });
});

describe("pre-commit", () => {
  test("refuse un commit sur main", () => {
    const r = commit("feat: test");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /refusé sur « main »/);
    must(["reset", "-q", "--hard"]);
  });
  test("accepte un commit propre sur une branche de travail", () => {
    must(["switch", "-q", "-c", "feat/ok"]);
    assert.equal(commit("feat: ajoute quelque chose").status, 0);
  });
  test("refuse un autre nom, même avec la bonne adresse", () => {
    setIdentity(OK_EMAIL, "Quelqu'un d'autre");
    const r = commit("fix: mauvais nom");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Nom refusé/);
    must(["reset", "-q", "--hard"]);
    setIdentity(OK_EMAIL);
  });
  test("refuse une autre identité", () => {
    setIdentity("claude@example.com");
    const r = commit("fix: autre identité");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Identité refusée/);
    must(["reset", "-q", "--hard"]);
    setIdentity(OK_EMAIL);
  });
});

describe("commit-msg", () => {
  for (const [label, msg] of [
    ["Co-Authored-By", "feat: x\n\nCo-Authored-By: Quelqu'un <a@b.c>"],
    ["mention de Claude", "feat: généré par Claude"],
    ["trailer de session", "feat: x\n\nClaude-Session: https://claude.ai/code/session_1"],
    ["mention d'Anthropic", "docs: via Anthropic"],
    ["Generated with", "docs: Generated with un outil"],
  ] as const) {
    test(`refuse : ${label}`, () => {
      const r = commit(msg);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /Message de commit refusé/);
      must(["reset", "-q", "--hard"]);
    });
  }
  test("accepte un message normal, y compris multi-lignes", () => {
    assert.equal(commit("fix(platform): corrige la limite\n\nDétail du correctif.").status, 0);
  });
});

describe("pre-push", () => {
  test("refuse de pousser vers main", () => {
    const r = git(["push", "origin", "HEAD:refs/heads/main"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Push refusé vers « main »/);
  });
  test("accepte de pousser une branche de travail propre", () => {
    const r = git(["push", "-u", "origin", "feat/ok"]);
    assert.equal(r.status, 0, r.stderr);
  });
  test("refuse un commit à l'identité étrangère glissé via --no-verify", () => {
    setIdentity("autre@example.com");
    assert.equal(commit("chore: contournement", ["--no-verify"]).status, 0);
    setIdentity(OK_EMAIL);
    const r = git(["push", "origin", "feat/ok"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /a pour identité/);
    must(["reset", "-q", "--hard", "HEAD~1"]);
  });
  test("fusionner main dans une branche : les commits DÉJÀ publiés sur main (même signés par un autre) ne bloquent pas le push", () => {
    // main distant reçoit un commit signé par GitHub (comme une fusion de pull request), publié hors hook.
    must(["switch", "-q", "main"]);
    setIdentity("noreply@github.com", "GitHub");
    assert.equal(commit("Merge pull request #1 from x/y", ["--no-verify"]).status, 0);
    assert.equal(git(["push", "--no-verify", "origin", "main"]).status, 0);
    must(["fetch", "-q", "origin"]);
    setIdentity(OK_EMAIL);
    must(["switch", "-q", "feat/ok"]);
    must(["reset", "-q", "--hard", "origin/feat/ok"]);
    assert.equal(git(["merge", "--no-edit", "origin/main"]).status, 0);
    const r = git(["push", "origin", "feat/ok"]);
    assert.equal(r.status, 0, r.stderr);
  });
  test("un NOUVEAU commit mal signé reste refusé même après une fusion de main", () => {
    setIdentity("autre@example.com");
    assert.equal(commit("chore: nouveau commit mal signé", ["--no-verify"]).status, 0);
    setIdentity(OK_EMAIL);
    const r = git(["push", "origin", "feat/ok"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /a pour identité/);
    must(["reset", "-q", "--hard", "HEAD~1"]);
  });
  test("refuse un commit au mauvais nom glissé via --no-verify", () => {
    setIdentity(OK_EMAIL, "Quelqu'un d'autre");
    assert.equal(commit("chore: mauvais nom", ["--no-verify"]).status, 0);
    setIdentity(OK_EMAIL);
    const r = git(["push", "origin", "feat/ok"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /a pour identité/);
    must(["reset", "-q", "--hard", "HEAD~1"]);
  });
  test("refuse un message interdit glissé via --no-verify", () => {
    assert.equal(commit("chore: x\n\nCo-Authored-By: Y <y@z.t>", ["--no-verify"]).status, 0);
    const r = git(["push", "origin", "feat/ok"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /mention interdite/);
  });
});
