-- Retour arrière de 0002. À n'exécuter que si 0002 pose problème.
-- ATTENTION : l'application (version avec start_run) cesse de fonctionner tant que
-- 0002 est retirée — redéploie d'abord la version précédente de l'app.
drop trigger  if exists applications_limit on public.applications;
drop function if exists public.enforce_application_limit();
alter table public.applications  drop constraint if exists applications_size_limits;
alter table public.user_settings drop constraint if exists user_settings_size_limits;
drop function if exists public.start_run(uuid, text, jsonb, uuid, integer, integer, integer);
grant execute on function public.handle_new_user() to public;
