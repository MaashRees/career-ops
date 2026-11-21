-- ============================================================================
--  0003 — Tout le SQL de l'application dans un SCHÉMA DÉDIÉ « jobhunter »
--  À EXÉCUTER APRÈS 0001 et 0002, par toi, dans Supabase → SQL Editor → Run.
--  Rejouable sans erreur. Vérification : verify/0003_dedicated_schema.sql
--  Retour arrière : rollback/0003_dedicated_schema.sql (déconseillé)
--
--  POURQUOI : le schéma « public » est exposé par défaut par l'API automatique de Supabase
--  (PostgREST) à toute personne qui possède la clé publique. Un schéma dédié n'est exposé
--  que si TU l'ajoutes explicitement (étape manuelle ci-dessous), avec des droits précis.
--
--  CE QUE ÇA FAIT (les données existantes sont conservées) :
--   1. crée le schéma « jobhunter » ;
--   2. y DÉPLACE les 6 tables (profiles, user_settings, applications, reports, documents, runs) ;
--   3. recrée les 3 fonctions (start_run, handle_new_user, enforce_application_limit) dans le schéma
--      — leurs corps référencent « public », il faut donc les réécrire — et les 2 déclencheurs ;
--   4. pose des droits MINIMAUX : aucun accès pour anon ; authenticated limité à ce que l'app fait ;
--      service_role complet ; fonctions réservées au serveur.
--
--  Si tu n'as encore rien exécuté : lance 0001, 0002 puis celle-ci dans la foulée (quelques secondes).
--  APRÈS CETTE MIGRATION : ne rejoue plus jamais 0001 ni 0002 (elles recréeraient des objets dans « public »).
--
--  ⚠️ ÉTAPE MANUELLE OBLIGATOIRE (sinon l'application ne voit plus ses tables) :
--     Supabase → Project Settings → API → « Exposed schemas » : ajoute « jobhunter ».
--     Recommandé : retire « public » de cette liste si tu ne l'utilises pour rien d'autre.
-- ============================================================================

do $$
begin
  if to_regclass('public.runs') is null and to_regclass('jobhunter.runs') is null then
    raise exception 'Exécute d''abord 0001_init.sql puis 0002_security_hardening.sql (tables introuvables).';
  end if;
end $$;

create schema if not exists jobhunter;

-- ───────────────────────── 1. déplacer les tables (RLS, politiques, index, contraintes suivent) ─────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'user_settings', 'applications', 'reports', 'documents', 'runs'] loop
    if to_regclass('public.' || t) is not null and to_regclass('jobhunter.' || t) is null then
      execute format('alter table public.%I set schema jobhunter', t);
    end if;
  end loop;
end $$;

-- ───────────────────────── 2. fonctions et déclencheurs : recréés dans le schéma ─────────────────────────
-- (les anciens corps de fonction pointent vers « public » : ils ne fonctionneraient plus après le déplacement)
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists applications_limit on jobhunter.applications;
drop function if exists public.start_run(uuid, text, jsonb, uuid, integer, integer, integer);
drop function if exists public.enforce_application_limit();
drop function if exists public.handle_new_user();

-- Création automatique du profil + des réglages à l'arrivée d'un utilisateur.
create or replace function jobhunter.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into jobhunter.profiles (id, email) values (new.id, coalesce(new.email, ''))
    on conflict (id) do nothing;
  insert into jobhunter.user_settings (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Plafond de 1000 candidatures par utilisateur.
create or replace function jobhunter.enforce_application_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from jobhunter.applications where user_id = new.user_id) >= 1000 then
    raise exception 'limit:applications' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Démarrage atomique d'une analyse avec contrôle des quotas (même logique que 0002, schéma dédié).
create or replace function jobhunter.start_run(
  p_user_id        uuid,
  p_kind           text,
  p_input          jsonb,
  p_application_id uuid,
  p_user_limit     integer,   -- analyses / 24 h pour cet utilisateur (0 = illimité)
  p_global_limit   integer,   -- analyses / 24 h tous utilisateurs (0 = illimité)
  p_max_concurrent integer    -- analyses simultanées pour cet utilisateur
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_since   timestamptz := now() - interval '24 hours';
  v_stale   timestamptz := now() - interval '12 minutes';  -- au-delà : analyse orpheline, ne bloque plus
  v_running integer;
  v_used    integer;
  v_global  integer;
  v_id      uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('start_run:user:' || p_user_id::text, 0));

  select count(*) into v_running
    from jobhunter.runs
   where user_id = p_user_id and status = 'running' and created_at > v_stale;
  if v_running >= greatest(p_max_concurrent, 1) then
    raise exception 'quota:concurrent' using errcode = 'P0001';
  end if;

  if p_user_limit > 0 then
    select count(*) into v_used
      from jobhunter.runs
     where user_id = p_user_id and created_at >= v_since
       and (status <> 'failed' or provider is not null);
    if v_used >= p_user_limit then
      raise exception 'quota:user_daily' using errcode = 'P0001';
    end if;
  end if;

  if p_global_limit > 0 then
    perform pg_advisory_xact_lock(hashtextextended('start_run:global', 0));
    select count(*) into v_global
      from jobhunter.runs
     where created_at >= v_since and (status <> 'failed' or provider is not null);
    if v_global >= p_global_limit then
      raise exception 'quota:global_daily' using errcode = 'P0001';
    end if;
  end if;

  insert into jobhunter.runs (user_id, kind, input, application_id, status)
  values (p_user_id, p_kind, coalesce(p_input, '{}'::jsonb), p_application_id, 'running')
  returning id into v_id;
  return v_id;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function jobhunter.handle_new_user();

create trigger applications_limit
  before insert on jobhunter.applications
  for each row execute function jobhunter.enforce_application_limit();

-- ───────────────────────── 3. droits minimaux ─────────────────────────
-- Un schéma dédié ne reçoit AUCUN droit par défaut : tout est accordé explicitement ci-dessous.
revoke all on schema jobhunter from public, anon;
grant usage on schema jobhunter to authenticated, service_role;

revoke all on all tables in schema jobhunter from public, anon, authenticated;
-- authenticated = ce que l'application fait avec la session de l'utilisateur (la RLS limite en plus aux SES lignes).
grant select                         on jobhunter.profiles      to authenticated;
grant select, insert, update         on jobhunter.user_settings to authenticated;
grant select, insert, update, delete on jobhunter.applications  to authenticated;
grant select, delete                 on jobhunter.reports       to authenticated;
grant select, delete                 on jobhunter.documents     to authenticated;
grant select                         on jobhunter.runs          to authenticated;
-- service_role = tâches serveur (rapports, documents, résultats d'analyse, page d'administration).
grant all on all tables in schema jobhunter to service_role;

-- Fonctions : par défaut Postgres autorise « public » à les exécuter ; on retire tout, puis on accorde.
revoke all on function jobhunter.start_run(uuid, text, jsonb, uuid, integer, integer, integer) from public, anon, authenticated;
revoke all on function jobhunter.handle_new_user()          from public, anon, authenticated;
revoke all on function jobhunter.enforce_application_limit() from public, anon, authenticated;
grant execute on function jobhunter.start_run(uuid, text, jsonb, uuid, integer, integer, integer) to service_role;
-- (les fonctions de déclencheur n'ont pas besoin d'être exécutables par les utilisateurs : le droit n'est vérifié qu'à la création du déclencheur)
