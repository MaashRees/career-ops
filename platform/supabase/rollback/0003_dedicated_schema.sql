-- Retour arrière de 0003 : remet les objets dans « public ». DÉCONSEILLÉ (c'est le schéma exposé par défaut).
-- À n'exécuter que si 0003 pose problème. Les données sont conservées.
-- ATTENTION : l'application (qui lit le schéma « jobhunter ») cesse de fonctionner tant qu'elle n'est pas reconfigurée :
-- variable SUPABASE_DB_SCHEMA=public chez l'hébergeur, puis redémarrage.
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists applications_limit on jobhunter.applications;

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'user_settings', 'applications', 'reports', 'documents', 'runs'] loop
    if to_regclass('jobhunter.' || t) is not null and to_regclass('public.' || t) is null then
      execute format('alter table jobhunter.%I set schema public', t);
    end if;
  end loop;
end $$;

drop function if exists jobhunter.start_run(uuid, text, jsonb, uuid, integer, integer, integer);
drop function if exists jobhunter.enforce_application_limit();
drop function if exists jobhunter.handle_new_user();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, '')) on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.enforce_application_limit()
returns trigger language plpgsql set search_path = public
as $$
begin
  if (select count(*) from public.applications where user_id = new.user_id) >= 1000 then
    raise exception 'limit:applications' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.start_run(
  p_user_id uuid, p_kind text, p_input jsonb, p_application_id uuid,
  p_user_limit integer, p_global_limit integer, p_max_concurrent integer)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_since timestamptz := now() - interval '24 hours';
  v_stale timestamptz := now() - interval '12 minutes';
  v_running integer; v_used integer; v_global integer; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('start_run:user:' || p_user_id::text, 0));
  select count(*) into v_running from public.runs where user_id = p_user_id and status = 'running' and created_at > v_stale;
  if v_running >= greatest(p_max_concurrent, 1) then raise exception 'quota:concurrent' using errcode = 'P0001'; end if;
  if p_user_limit > 0 then
    select count(*) into v_used from public.runs
     where user_id = p_user_id and created_at >= v_since and (status <> 'failed' or provider is not null);
    if v_used >= p_user_limit then raise exception 'quota:user_daily' using errcode = 'P0001'; end if;
  end if;
  if p_global_limit > 0 then
    perform pg_advisory_xact_lock(hashtextextended('start_run:global', 0));
    select count(*) into v_global from public.runs
     where created_at >= v_since and (status <> 'failed' or provider is not null);
    if v_global >= p_global_limit then raise exception 'quota:global_daily' using errcode = 'P0001'; end if;
  end if;
  insert into public.runs (user_id, kind, input, application_id, status)
  values (p_user_id, p_kind, coalesce(p_input, '{}'::jsonb), p_application_id, 'running') returning id into v_id;
  return v_id;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create trigger applications_limit before insert on public.applications for each row execute function public.enforce_application_limit();

-- Droits tels qu'avant 0003 (comme 0001/0002).
revoke all on public.profiles, public.user_settings, public.applications, public.reports, public.documents, public.runs from anon;
revoke all on function public.start_run(uuid, text, jsonb, uuid, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.start_run(uuid, text, jsonb, uuid, integer, integer, integer) to service_role;
  end if;
end $$;

-- Le schéma n'est supprimé que s'il est vide (sinon la commande échoue, volontairement).
drop schema if exists jobhunter;
