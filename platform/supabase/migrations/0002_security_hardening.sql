-- ============================================================================
--  0002 — Durcissement de sécurité
--  À EXÉCUTER APRÈS 0001, par toi, dans Supabase → SQL Editor → Run.
--  Rejouable sans erreur. Vérification : verify/0002_security_hardening.sql
--  Retour arrière : rollback/0002_security_hardening.sql
--
--  Ce que ça change :
--   1. start_run() : démarrage d'une analyse AVEC contrôle des quotas, de façon
--      ATOMIQUE (verrou par utilisateur). Sans ça, 10 requêtes simultanées
--      passaient toutes la vérification avant que la première ne soit comptée.
--      Appelable uniquement par le serveur (service_role).
--   2. Limites de taille en base : la clé publique Supabase permet d'écrire
--      directement dans les tables (sans passer par l'app) ; sans plafonds un
--      compte pourrait y stocker des textes énormes.
--   3. Plafond de 1000 candidatures par utilisateur.
--   4. handle_new_user() n'est plus exécutable par les rôles API (seul le
--      déclencheur d'inscription l'utilise).
-- ============================================================================

-- ───────────────────────── 1. démarrage atomique d'une analyse ─────────────────────────
create or replace function public.start_run(
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
set search_path = public
as $$
declare
  v_since   timestamptz := now() - interval '24 hours';
  v_stale   timestamptz := now() - interval '12 minutes';  -- au-delà : analyse orpheline, ne bloque plus
  v_running integer;
  v_used    integer;
  v_global  integer;
  v_id      uuid;
begin
  -- Sérialise les démarrages d'un MÊME utilisateur (le verrou saute à la fin de la transaction).
  perform pg_advisory_xact_lock(hashtextextended('start_run:user:' || p_user_id::text, 0));

  select count(*) into v_running
    from public.runs
   where user_id = p_user_id and status = 'running' and created_at > v_stale;
  if v_running >= greatest(p_max_concurrent, 1) then
    raise exception 'quota:concurrent' using errcode = 'P0001';
  end if;

  -- Une analyse compte si elle coûte : en cours, terminée, ou échouée APRÈS un appel IA (provider renseigné).
  if p_user_limit > 0 then
    select count(*) into v_used
      from public.runs
     where user_id = p_user_id and created_at >= v_since
       and (status <> 'failed' or provider is not null);
    if v_used >= p_user_limit then
      raise exception 'quota:user_daily' using errcode = 'P0001';
    end if;
  end if;

  if p_global_limit > 0 then
    perform pg_advisory_xact_lock(hashtextextended('start_run:global', 0));  -- toujours après le verrou utilisateur
    select count(*) into v_global
      from public.runs
     where created_at >= v_since and (status <> 'failed' or provider is not null);
    if v_global >= p_global_limit then
      raise exception 'quota:global_daily' using errcode = 'P0001';
    end if;
  end if;

  insert into public.runs (user_id, kind, input, application_id, status)
  values (p_user_id, p_kind, coalesce(p_input, '{}'::jsonb), p_application_id, 'running')
  returning id into v_id;
  return v_id;
end;
$$;

-- Réservée au serveur : ni les visiteurs ni les utilisateurs connectés ne peuvent l'appeler.
revoke all on function public.start_run(uuid, text, jsonb, uuid, integer, integer, integer)
  from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.start_run(uuid, text, jsonb, uuid, integer, integer, integer)
      to service_role;
  end if;
end $$;

-- ───────────────────────── 2. plafonds de taille (anti-abus via l'API directe) ─────────────────────────
alter table public.user_settings drop constraint if exists user_settings_size_limits;
alter table public.user_settings add constraint user_settings_size_limits check (
  length(cv_md) <= 60000
  and length(profile_md) <= 8000
  and length(output_language) <= 5
  and pg_column_size(profile) <= 20000
);

alter table public.applications drop constraint if exists applications_size_limits;
alter table public.applications add constraint applications_size_limits check (
  length(company) <= 200
  and length(role) <= 300
  and length(coalesce(url, '')) <= 2000
  and length(coalesce(url_key, '')) <= 2000
  and length(notes) <= 5000
  and length(coalesce(decision, '')) <= 60
  and length(coalesce(legitimacy, '')) <= 60
);

-- ───────────────────────── 3. plafond du nombre de candidatures ─────────────────────────
create or replace function public.enforce_application_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.applications where user_id = new.user_id) >= 1000 then
    raise exception 'limit:applications' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists applications_limit on public.applications;
create trigger applications_limit
  before insert on public.applications
  for each row execute function public.enforce_application_limit();

-- ───────────────────────── 4. fonction du déclencheur d'inscription ─────────────────────────
revoke all on function public.handle_new_user() from public, anon, authenticated;
