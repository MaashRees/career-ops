-- Vérification de 0001 — LECTURE SEULE. Chaque ligne doit afficher ok = true.
select 'table ' || t as controle,
       exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) as ok
  from unnest(array['profiles','user_settings','applications','reports','documents','runs']) as t
union all
select 'RLS active sur ' || c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('profiles','user_settings','applications','reports','documents','runs')
union all
select 'déclencheur on_auth_user_created',
       exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal)
union all
select 'le rôle anon n''a aucun droit sur applications',
       not has_table_privilege('anon', 'public.applications', 'select');
