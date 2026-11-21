-- Vérification de 0003 — LECTURE SEULE. Chaque ligne doit afficher ok = true.
-- (Après 0003, c'est ce script qui fait foi : verify/0001 et verify/0002 ne valent plus, ils visent le schéma « public ».)
select 'le schéma jobhunter existe' as controle,
       exists (select 1 from pg_namespace where nspname = 'jobhunter') as ok
union all
select 'table jobhunter.' || t,
       to_regclass('jobhunter.' || t) is not null
  from unnest(array['profiles','user_settings','applications','reports','documents','runs']) as t
union all
select 'aucune table de l''application ne reste dans public (' || t || ')',
       to_regclass('public.' || t) is null
  from unnest(array['profiles','user_settings','applications','reports','documents','runs']) as t
union all
select 'aucune fonction de l''application ne reste dans public (' || f || ')',
       not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = f)
  from unnest(array['start_run','handle_new_user','enforce_application_limit']) as f
union all
select 'RLS active sur jobhunter.' || c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'jobhunter' and c.relkind = 'r'
union all
select 'déclencheur d''inscription pointe vers jobhunter.handle_new_user',
       exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid join pg_namespace n on n.oid = p.pronamespace
                where t.tgname = 'on_auth_user_created' and not t.tgisinternal
                  and n.nspname = 'jobhunter' and p.proname = 'handle_new_user')
union all
select 'déclencheur du plafond de candidatures pointe vers jobhunter',
       exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid join pg_namespace n on n.oid = p.pronamespace
                where t.tgname = 'applications_limit' and not t.tgisinternal
                  and n.nspname = 'jobhunter' and p.proname = 'enforce_application_limit')
union all
select 'anon : aucun accès au schéma',
       not has_schema_privilege('anon', 'jobhunter', 'usage')
union all
select 'authenticated : accès au schéma',
       has_schema_privilege('authenticated', 'jobhunter', 'usage')
union all
select 'anon : aucun droit sur ' || t,
       not has_table_privilege('anon', 'jobhunter.' || t, 'select')
  from unnest(array['profiles','user_settings','applications','reports','documents','runs']) as t
union all
select 'authenticated NE PEUT PAS écrire dans ' || t,
       not has_table_privilege('authenticated', 'jobhunter.' || t, 'insert')
       and not has_table_privilege('authenticated', 'jobhunter.' || t, 'update')
  from unnest(array['profiles','reports','documents','runs']) as t
union all
select 'authenticated peut gérer ses candidatures',
       has_table_privilege('authenticated', 'jobhunter.applications', 'select,insert,update,delete')
union all
select 'authenticated peut gérer ses réglages',
       has_table_privilege('authenticated', 'jobhunter.user_settings', 'select,insert,update')
union all
select 'service_role a tous les droits sur ' || t,
       has_table_privilege('service_role', 'jobhunter.' || t, 'select,insert,update,delete')
  from unnest(array['profiles','user_settings','applications','reports','documents','runs']) as t
union all
select 'start_run NON appelable par anon / authenticated',
       not has_function_privilege('anon', 'jobhunter.start_run(uuid,text,jsonb,uuid,integer,integer,integer)', 'execute')
       and not has_function_privilege('authenticated', 'jobhunter.start_run(uuid,text,jsonb,uuid,integer,integer,integer)', 'execute')
union all
select 'start_run appelable par service_role',
       has_function_privilege('service_role', 'jobhunter.start_run(uuid,text,jsonb,uuid,integer,integer,integer)', 'execute')
union all
select 'plafonds de taille conservés',
       exists (select 1 from pg_constraint where conname = 'user_settings_size_limits')
       and exists (select 1 from pg_constraint where conname = 'applications_size_limits');
