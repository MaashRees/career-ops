import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const SUPABASE_DIR = path.resolve(import.meta.dirname, "..", "..", "supabase");

export function sqlFile(...parts: string[]): string {
  return readFileSync(path.join(SUPABASE_DIR, ...parts), "utf8");
}

/**
 * Postgres en mémoire (PGlite) avec de simples « stubs » de ce que Supabase fournit déjà :
 * rôles anon / authenticated / service_role, auth.users et auth.uid().
 * Applique les migrations demandées dans l'ordre (chacune deux fois : elles doivent être rejouables).
 */
export async function createDb(
  migrations: string[] = ["0001_init.sql", "0002_security_hardening.sql"],
  preSql = "", // exécuté AVANT les migrations (ex. utilisateurs déjà existants)
): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to public;
  `);
  if (preSql) await db.exec(preSql);
  for (const m of migrations) {
    const sql = sqlFile("migrations", m);
    await db.exec(sql);
    await db.exec(sql); // idempotence
  }
  return db;
}

/** Exécute fn avec les droits d'un rôle (et auth.uid() = uid si fourni). */
export async function asRole<T>(db: PGlite, role: "anon" | "authenticated" | "service_role", uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}; select set_config('app.uid','${uid ?? ""}', false)`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('app.uid','', false)");
  }
}

export async function rejects(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
