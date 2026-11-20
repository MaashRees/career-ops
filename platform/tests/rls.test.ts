/**
 * Valide le schéma SQL et l'isolation entre utilisateurs (RLS) sur un vrai
 * Postgres (PGlite, en mémoire). Les rôles et fonctions fournis par Supabase
 * (auth.users, auth.uid(), anon, authenticated) sont simulés par des stubs.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SQL = readFileSync(new URL("../supabase/migrations/0001_init.sql", import.meta.url), "utf8");

const db = new PGlite();

/** Exécute fn avec les droits d'un utilisateur connecté (rôle `authenticated`, auth.uid() = uid). */
async function as<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('app.uid','${uid}', false)`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('app.uid','', false)");
  }
}
async function rejects(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}
const count = async (sql: string, params: unknown[] = []) => ((await db.query<{ c: number }>(sql, params)).rows[0].c);

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    insert into auth.users values ('${A}', 'a@x.fr');
  `);
  await db.exec(SQL);
  await db.exec(SQL); // idempotence : la migration se rejoue sans erreur
  await db.exec(`insert into auth.users values ('${B}', 'b@x.fr')`);
  await db.exec(`
    insert into public.applications (user_id, num, company, role) values
      ('${A}', 1, 'AcmeA', 'PM'), ('${B}', 1, 'BetaB', 'Dev');
    insert into public.reports (user_id, application_id, markdown)
      select user_id, id, 'rapport ' || company from public.applications;
    insert into public.runs (user_id, kind) values ('${A}', 'evaluate'), ('${B}', 'evaluate');
  `);
});

describe("création des comptes", () => {
  test("un utilisateur existant avant la migration est rattrapé", async () => {
    assert.equal(await count("select count(*)::int c from public.profiles where id=$1", [A]), 1);
    assert.equal(await count("select count(*)::int c from public.user_settings where user_id=$1", [A]), 1);
  });
  test("un nouvel utilisateur reçoit profil + réglages par défaut (trigger)", async () => {
    const r = await db.query<{ spend_tier: string; output_language: string }>(
      "select spend_tier, output_language from public.user_settings where user_id=$1", [B]);
    assert.deepEqual(r.rows[0], { spend_tier: "standard", output_language: "fr" });
  });
});

describe("isolation en lecture", () => {
  test("A ne voit que ses propres données", async () => {
    await as(A, async () => {
      assert.deepEqual((await db.query("select company from public.applications")).rows, [{ company: "AcmeA" }]);
      assert.deepEqual((await db.query("select markdown from public.reports")).rows, [{ markdown: "rapport AcmeA" }]);
      assert.equal(await count("select count(*)::int c from public.runs"), 1);
      assert.deepEqual((await db.query("select email from public.profiles")).rows, [{ email: "a@x.fr" }]);
    });
  });
  test("le rôle anonyme n'a aucun accès", async () => {
    await db.exec("set role anon");
    const blocked = await rejects(() => db.query("select * from public.applications"));
    await db.exec("reset role");
    assert.equal(blocked, true);
  });
});

describe("isolation en écriture", () => {
  test("A ne peut ni modifier ni supprimer les candidatures de B", async () => {
    await as(A, async () => {
      await db.query("update public.applications set status='Applied' where company='BetaB'");
      await db.query("delete from public.applications where company='BetaB'");
    });
    const r = await db.query<{ status: string }>("select status from public.applications where company='BetaB'");
    assert.deepEqual(r.rows, [{ status: "Evaluated" }]);
  });
  test("A ne peut pas créer une candidature au nom de B", async () => {
    await as(A, async () => {
      assert.equal(await rejects(() => db.query(`insert into public.applications (user_id, num, company) values ('${B}', 9, 'Faux')`)), true);
    });
  });
  test("A modifie ses réglages mais pas ceux de B", async () => {
    await as(A, async () => {
      await db.query("update public.user_settings set cv_md='mon cv' where user_id=$1", [A]);
      await db.query("update public.user_settings set cv_md='piraté' where user_id=$1", [B]);
    });
    assert.equal((await db.query<{ cv_md: string }>("select cv_md from public.user_settings where user_id=$1", [A])).rows[0].cv_md, "mon cv");
    assert.equal((await db.query<{ cv_md: string }>("select cv_md from public.user_settings where user_id=$1", [B])).rows[0].cv_md, "");
  });
});

describe("tables réservées au serveur (service role)", () => {
  test("un utilisateur ne peut pas fabriquer de rapport", async () => {
    await as(A, async () => {
      assert.equal(
        await rejects(() => db.query(`insert into public.reports (user_id, application_id, markdown) select '${A}', id, 'x' from public.applications limit 1`)),
        true,
      );
    });
  });
  test("un utilisateur ne peut ni créer ni réécrire un run (sinon les quotas seraient contournables)", async () => {
    await as(A, async () => {
      assert.equal(await rejects(() => db.query(`insert into public.runs (user_id, kind) values ('${A}', 'evaluate')`)), true);
      await db.query(`update public.runs set status='done' where user_id='${A}'`);
    });
    assert.equal((await db.query<{ status: string }>(`select status from public.runs where user_id='${A}'`)).rows[0].status, "running");
  });
});

describe("contraintes d'intégrité", () => {
  test("statut non canonique refusé", async () => {
    assert.equal(await rejects(() => db.query(`insert into public.applications (user_id, num, status) values ('${A}', 5, 'Bidon')`)), true);
  });
  test("note hors 0–5 refusée", async () => {
    assert.equal(await rejects(() => db.query(`insert into public.applications (user_id, num, score) values ('${A}', 6, 7.5)`)), true);
  });
  test("URL en double refusée pour un utilisateur, autorisée entre utilisateurs", async () => {
    assert.equal(await rejects(() => db.query(`insert into public.applications (user_id, num, url_key) values ('${A}', 7, 'u'), ('${A}', 8, 'u')`)), true);
    await db.query(`insert into public.applications (user_id, num, url_key) values ('${A}', 7, 'u')`);
    await db.query(`insert into public.applications (user_id, num, url_key) values ('${B}', 7, 'u')`);
  });
});

describe("suppression de compte", () => {
  test("toutes les données de l'utilisateur disparaissent en cascade", async () => {
    await db.exec(`delete from auth.users where id='${B}'`);
    const left = await count(
      `select ((select count(*) from public.applications where user_id=$1)
             + (select count(*) from public.reports where user_id=$1)
             + (select count(*) from public.runs where user_id=$1)
             + (select count(*) from public.user_settings where user_id=$1)
             + (select count(*) from public.profiles where id=$1))::int c`, [B]);
    assert.equal(left, 0);
  });
});
