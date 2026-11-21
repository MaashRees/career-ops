/**
 * Script 0003 : tout le SQL de l'application vit dans le schéma dédié « jobhunter », rien dans « public ».
 * Teste l'état final, la migration d'une base existante (données conservées), le retour arrière.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asRole, createDb, rejects, sqlFile } from "./helpers/pg.ts";

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const TABLES = ["profiles", "user_settings", "applications", "reports", "documents", "runs"];
const FUNCS = ["start_run", "handle_new_user", "enforce_application_limit"];
const OLD = ["0001_init.sql", "0002_security_hardening.sql"];
const count = async (d: PGlite, sql: string, params: unknown[] = []) => (await d.query<{ c: number }>(sql, params)).rows[0].c;

async function leftoversInPublic(d: PGlite) {
  const t = await d.query<{ n: string }>(`select table_name n from information_schema.tables where table_schema='public' and table_name = any($1)`, [TABLES]);
  const f = await d.query<{ n: string }>(`select p.proname n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname = any($1)`, [FUNCS]);
  return [...t.rows.map((r) => r.n), ...f.rows.map((r) => r.n)];
}

describe("état final", () => {
  test("rien de l'application ne reste dans public ; tout est dans jobhunter", async () => {
    const d = await createDb();
    assert.deepEqual(await leftoversInPublic(d), []);
    for (const t of TABLES) assert.ok(await count(d, "select count(*)::int c from information_schema.tables where table_schema='jobhunter' and table_name=$1", [t]));
  });

  test("anon n'a aucun accès au schéma (ni aux tables, ni aux fonctions)", async () => {
    const d = await createDb();
    for (const sql of ["select * from jobhunter.applications", "select jobhunter.start_run(null,'evaluate','{}'::jsonb,null,0,0,1)"]) {
      assert.match((await asRole(d, "anon", null, () => rejects(() => d.query(sql)))) ?? "", /permission denied/i);
    }
  });

  test("droits de table de authenticated : exactement ce que fait l'application", async () => {
    const d = await createDb();
    const priv = async (t: string, p: string) => (await d.query<{ ok: boolean }>("select has_table_privilege('authenticated', $1, $2) ok", [`jobhunter.${t}`, p])).rows[0].ok;
    assert.equal(await priv("applications", "delete"), true);
    assert.equal(await priv("user_settings", "update"), true);
    for (const t of ["profiles", "reports", "documents", "runs"]) {
      assert.equal(await priv(t, "insert"), false, `${t}: insert`);
      assert.equal(await priv(t, "update"), false, `${t}: update`);
    }
    assert.equal(await priv("runs", "delete"), false);
    assert.equal(await priv("profiles", "delete"), false);
  });

  test("le plafond de candidatures fonctionne toujours pour un utilisateur connecté (déclencheur sans droit d'exécution)", async () => {
    const d = await createDb();
    await d.exec(`insert into auth.users values ('${U1}', 'u1@x.fr')`);
    await d.query("insert into jobhunter.applications (user_id, num) select $1, g from generate_series(1,1000) g", [U1]);
    const err = await asRole(d, "authenticated", U1, () => rejects(() => d.query("insert into jobhunter.applications (user_id,num) values ($1,1001)", [U1])));
    assert.match(err ?? "", /limit:applications/);
  });
});

describe("migration d'une base existante (0001 + 0002 déjà exécutées sur public)", () => {
  test("les données sont conservées, les fonctions et déclencheurs fonctionnent dans le schéma", async () => {
    const d = await createDb(OLD, `insert into auth.users values ('${U1}', 'u1@x.fr')`);
    // Données créées AVANT 0003, dans public.
    await d.exec(`
      update public.user_settings set cv_md = 'mon cv' where user_id = '${U1}';
      insert into public.applications (user_id, num, company, role) values ('${U1}', 1, 'Acme', 'PM');
      insert into public.reports (user_id, application_id, markdown) select '${U1}', id, 'rapport' from public.applications;
      insert into public.runs (user_id, kind) values ('${U1}', 'evaluate');
    `);
    assert.deepEqual((await leftoversInPublic(d)).sort(), [...TABLES, ...FUNCS].sort());

    await d.exec(sqlFile("migrations", "0003_dedicated_schema.sql"));

    assert.deepEqual(await leftoversInPublic(d), []);
    assert.equal((await d.query<{ cv_md: string }>("select cv_md from jobhunter.user_settings where user_id=$1", [U1])).rows[0].cv_md, "mon cv");
    assert.equal(await count(d, "select count(*)::int c from jobhunter.applications"), 1);
    assert.equal(await count(d, "select count(*)::int c from jobhunter.reports"), 1);
    assert.equal(await count(d, "select count(*)::int c from jobhunter.runs"), 1);

    // Déclencheur d'inscription : un NOUVEL utilisateur reçoit profil + réglages dans le schéma.
    await d.exec(`insert into auth.users values ('${U2}', 'u2@x.fr')`);
    assert.equal(await count(d, "select count(*)::int c from jobhunter.profiles where id=$1", [U2]), 1);
    assert.equal(await count(d, "select count(*)::int c from jobhunter.user_settings where user_id=$1", [U2]), 1);

    // start_run fonctionne (service_role), la RLS aussi (authenticated).
    const runId = await asRole(d, "service_role", null, async () =>
      (await d.query<{ id: string }>("select jobhunter.start_run($1,'evaluate','{}'::jsonb,null,5,50,3) as id", [U2])).rows[0].id);
    assert.ok(runId);
    const seen = await asRole(d, "authenticated", U1, async () => (await d.query("select company from jobhunter.applications")).rows);
    assert.deepEqual(seen, [{ company: "Acme" }]);
  });

  test("0003 se rejoue sans erreur ni effet (idempotente)", async () => {
    const d = await createDb(OLD);
    const sql = sqlFile("migrations", "0003_dedicated_schema.sql");
    await d.exec(sql);
    await d.exec(sql);
    await d.exec(sql);
    assert.deepEqual(await leftoversInPublic(d), []);
  });

  test("0003 sans 0001/0002 : échec explicite (et rien n'est créé)", async () => {
    const d = await createDb([]);
    const err = await rejects(() => d.exec(sqlFile("migrations", "0003_dedicated_schema.sql")));
    assert.match(err ?? "", /Exécute d'abord 0001/);
  });
});

describe("retour arrière 0003", () => {
  test("remet tout dans public avec les données, puis 0003 se réapplique", async () => {
    const d = await createDb(OLD, `insert into auth.users values ('${U1}', 'u1@x.fr')`);
    await d.exec(sqlFile("migrations", "0003_dedicated_schema.sql"));
    await d.exec(`insert into jobhunter.applications (user_id, num, company) values ('${U1}', 1, 'Acme')`);

    await d.exec(sqlFile("rollback", "0003_dedicated_schema.sql"));
    assert.deepEqual((await leftoversInPublic(d)).sort(), [...TABLES, ...FUNCS].sort());
    assert.equal(await count(d, "select count(*)::int c from public.applications"), 1);
    assert.equal(await count(d, "select count(*)::int c from pg_namespace where nspname='jobhunter'"), 0);
    // L'état « avant 0003 » est bien restauré : la vérification de 0002 repasse.
    const rows = (await d.query<{ controle: string; ok: boolean }>(sqlFile("verify", "0002_security_hardening.sql"))).rows;
    assert.deepEqual(rows.filter((r) => r.ok !== true).map((r) => r.controle), []);

    await d.exec(sqlFile("migrations", "0003_dedicated_schema.sql"));
    assert.deepEqual(await leftoversInPublic(d), []);
    assert.equal(await count(d, "select count(*)::int c from jobhunter.applications"), 1);
  });
});

describe("règle pour les futurs scripts", () => {
  test("aucun script postérieur à 0002 ne crée ni ne modifie d'objet dans public", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const dir = path.resolve(import.meta.dirname, "..", "supabase", "migrations");
    const later = readdirSync(dir).filter((f) => /^\d{4}_/.test(f) && Number(f.slice(0, 4)) >= 3);
    assert.ok(later.length >= 1);
    for (const f of later) {
      const sql = readFileSync(path.join(dir, f), "utf8").replace(/--.*$/gm, "");
      // « public. » n'est toléré que pour DÉPLACER ou supprimer les anciens objets (0003).
      const offending = sql.split("\n").filter((l) => /\b(create|alter)\b[^;]*\bpublic\./i.test(l) && !/set schema jobhunter/i.test(l));
      if (f.startsWith("0003")) continue; // 0003 manipule explicitement l'ancien emplacement
      assert.deepEqual(offending, [], f);
    }
  });
});
