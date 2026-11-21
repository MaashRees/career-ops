/**
 * Tests du script 0002 (durcissement) et de ses scripts de vérification, sur un vrai Postgres (PGlite).
 */
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asRole, createDb, rejects, sqlFile } from "./helpers/pg.ts";

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
let db: PGlite;

const startRun = (user: string, opts: { user?: number; global?: number; concurrent?: number } = {}) =>
  asRole(db, "service_role", null, async () =>
    (await db.query<{ id: string }>("select jobhunter.start_run($1,'evaluate','{}'::jsonb,null,$2,$3,$4) as id", [
      user, opts.user ?? 0, opts.global ?? 0, opts.concurrent ?? 99,
    ])).rows[0].id);
const reset = () => db.exec("delete from jobhunter.runs");
const seed = (user: string, n: number, status: string, provider: string | null, ageMin = 0) =>
  db.query(
    `insert into jobhunter.runs (user_id, kind, status, provider, created_at)
     select $1, 'evaluate', $2, $3, now() - ($4 || ' minutes')::interval from generate_series(1, $5)`,
    [user, status, provider, String(ageMin), n],
  );

before(async () => {
  db = await createDb();
  await db.exec(`insert into auth.users values ('${U1}', 'u1@x.fr'), ('${U2}', 'u2@x.fr')`);
});

describe("start_run — quotas côté base", () => {
  test("crée une analyse « running » quand tout va bien", async () => {
    await reset();
    const id = await startRun(U1, { user: 5, global: 10, concurrent: 2 });
    const r = await db.query<{ status: string; user_id: string }>("select status, user_id from jobhunter.runs where id=$1", [id]);
    assert.deepEqual(r.rows[0], { status: "running", user_id: U1 });
  });

  test("limite journalière par utilisateur (l'autre utilisateur n'est pas touché)", async () => {
    await reset();
    await seed(U1, 3, "done", "anthropic");
    assert.match((await rejects(() => startRun(U1, { user: 3 }))) ?? "", /quota:user_daily/);
    await assert.doesNotReject(() => startRun(U2, { user: 3 }));
  });

  test("limite 0 = illimité (cas de l'administrateur)", async () => {
    await reset();
    await seed(U1, 50, "done", "anthropic");
    await assert.doesNotReject(() => startRun(U1, { user: 0 }));
  });

  test("un échec SANS appel IA ne consomme rien ; un échec APRÈS appel IA compte", async () => {
    await reset();
    await seed(U1, 5, "failed", null);
    await assert.doesNotReject(() => startRun(U1, { user: 2 }));
    await reset();
    await seed(U1, 2, "failed", "anthropic");
    assert.match((await rejects(() => startRun(U1, { user: 2 }))) ?? "", /quota:user_daily/);
  });

  test("les analyses de plus de 24 h ne comptent plus", async () => {
    await reset();
    await seed(U1, 5, "done", "anthropic", 25 * 60);
    await assert.doesNotReject(() => startRun(U1, { user: 2 }));
  });

  test("plafond global, tous utilisateurs confondus", async () => {
    await reset();
    await seed(U1, 2, "done", "anthropic");
    await seed(U2, 2, "done", "anthropic");
    assert.match((await rejects(() => startRun(U1, { global: 4 }))) ?? "", /quota:global_daily/);
  });

  test("analyses simultanées plafonnées ; une analyse orpheline (> 12 min) ne bloque plus", async () => {
    await reset();
    await seed(U1, 2, "running", null);
    assert.match((await rejects(() => startRun(U1, { concurrent: 2 }))) ?? "", /quota:concurrent/);
    await reset();
    await seed(U1, 2, "running", null, 30); // restées « running » depuis 30 min
    await assert.doesNotReject(() => startRun(U1, { concurrent: 2 }));
  });

  test("rafale de 12 démarrages : jamais plus que la limite (logique de comptage ; le verrou se valide sur un Postgres réel)", async () => {
    await reset();
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => startRun(U1, { user: 3, concurrent: 99 })));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    assert.equal(ok, 3, `attendu 3 démarrages, obtenu ${ok}`);
    assert.equal((await db.query<{ c: number }>("select count(*)::int c from jobhunter.runs where user_id=$1", [U1])).rows[0].c, 3);
  });
});

describe("start_run — qui peut l'appeler", () => {
  for (const role of ["anon", "authenticated"] as const) {
    test(`refusé au rôle ${role}`, async () => {
      const err = await asRole(db, role, U1, () =>
        rejects(() => db.query("select jobhunter.start_run($1,'evaluate','{}'::jsonb,null,0,0,99)", [U1])));
      assert.match(err ?? "", /permission denied/i);
    });
  }
  test("handle_new_user n'est plus appelable par les rôles API", async () => {
    const err = await asRole(db, "authenticated", U1, () => rejects(() => db.query("select jobhunter.handle_new_user()")));
    assert.match(err ?? "", /permission denied/i);
  });
});

describe("plafonds de taille (accès direct à l'API avec la clé publique)", () => {
  const asUser = <T>(fn: () => Promise<T>) => asRole(db, "authenticated", U1, fn);
  test("CV trop long refusé, CV de taille normale accepté", async () => {
    assert.ok(await asUser(() => rejects(() => db.query("update jobhunter.user_settings set cv_md=$1 where user_id=$2", ["x".repeat(60001), U1]))));
    await asUser(() => db.query("update jobhunter.user_settings set cv_md=$1 where user_id=$2", ["x".repeat(60000), U1]));
  });
  test("profil JSON énorme refusé", async () => {
    const big = JSON.stringify({ blob: "y".repeat(25000) });
    assert.ok(await asUser(() => rejects(() => db.query("update jobhunter.user_settings set profile=$1::jsonb where user_id=$2", [big, U1]))));
  });
  test("notes et champs de candidature plafonnés", async () => {
    assert.ok(await asUser(() => rejects(() => db.query("insert into jobhunter.applications (user_id,num,notes) values ($1,900,$2)", [U1, "n".repeat(5001)]))));
    assert.ok(await asUser(() => rejects(() => db.query("insert into jobhunter.applications (user_id,num,company) values ($1,901,$2)", [U1, "c".repeat(201)]))));
  });
  test("au plus 1000 candidatures par utilisateur", async () => {
    await db.query("delete from jobhunter.applications where user_id=$1", [U2]);
    await db.query("insert into jobhunter.applications (user_id, num) select $1, g from generate_series(1,1000) g", [U2]);
    assert.match((await asRole(db, "authenticated", U2, () => rejects(() => db.query("insert into jobhunter.applications (user_id,num) values ($1,1001)", [U2])))) ?? "", /limit:applications/);
  });
});

describe("scripts de vérification (verify/) : tout doit être ok = true, à l'étape qui leur correspond", () => {
  const cases: Array<[string, string[]]> = [
    ["0001_init.sql", ["0001_init.sql"]],
    ["0002_security_hardening.sql", ["0001_init.sql", "0002_security_hardening.sql"]],
    ["0003_dedicated_schema.sql", ["0001_init.sql", "0002_security_hardening.sql", "0003_dedicated_schema.sql"]],
  ];
  for (const [verify, migrations] of cases) {
    test(verify, async () => {
      const d = await createDb(migrations);
      const rows = (await d.query<{ controle: string; ok: boolean }>(sqlFile("verify", verify))).rows;
      assert.ok(rows.length >= 5, "le script de vérification doit contrôler plusieurs points");
      assert.deepEqual(rows.filter((r) => r.ok !== true).map((r) => r.controle), []);
    });
  }
});

describe("retour arrière 0002 (avant 0003)", () => {
  test("0002 se retire proprement, puis se réapplique", async () => {
    const fresh = await createDb(["0001_init.sql", "0002_security_hardening.sql"]);
    await fresh.exec(sqlFile("rollback", "0002_security_hardening.sql"));
    assert.equal((await fresh.query<{ c: number }>("select count(*)::int c from pg_proc where proname='start_run'")).rows[0].c, 0);
    await fresh.exec(sqlFile("migrations", "0002_security_hardening.sql"));
    assert.equal((await fresh.query<{ c: number }>("select count(*)::int c from pg_proc where proname='start_run'")).rows[0].c, 1);
  });
});
