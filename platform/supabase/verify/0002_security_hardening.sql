-- Vérification de 0002 — LECTURE SEULE. Exécute-la après la migration :
-- chaque ligne doit afficher ok = true.
select 'start_run existe'                                           as controle,
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'start_run')   as ok
union all
select 'start_run NON appelable par anon',
       not has_function_privilege('anon', 'public.start_run(uuid,text,jsonb,uuid,integer,integer,integer)', 'execute')
union all
select 'start_run NON appelable par authenticated',
       not has_function_privilege('authenticated', 'public.start_run(uuid,text,jsonb,uuid,integer,integer,integer)', 'execute')
union all
select 'start_run appelable par service_role',
       has_function_privilege('service_role', 'public.start_run(uuid,text,jsonb,uuid,integer,integer,integer)', 'execute')
union all
select 'handle_new_user NON appelable par authenticated',
       not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute')
union all
select 'plafonds de taille user_settings',
       exists (select 1 from pg_constraint where conname = 'user_settings_size_limits')
union all
select 'plafonds de taille applications',
       exists (select 1 from pg_constraint where conname = 'applications_size_limits')
union all
select 'plafond de 1000 candidatures (déclencheur)',
       exists (select 1 from pg_trigger where tgname = 'applications_limit' and not tgisinternal)
union all
select 'RLS active sur ' || c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('profiles','user_settings','applications','reports','documents','runs');
