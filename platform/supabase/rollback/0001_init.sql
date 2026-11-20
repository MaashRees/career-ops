-- ⚠️ DESTRUCTIF : supprime TOUTES les données de l'application (profils, CV, candidatures,
-- rapports, documents, analyses). Les comptes d'authentification Supabase, eux, ne sont pas touchés.
-- À n'exécuter que sur un projet de test, ou après une sauvegarde.
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists public.documents    cascade;
drop table if exists public.reports      cascade;
drop table if exists public.runs         cascade;
drop table if exists public.applications cascade;
drop table if exists public.user_settings cascade;
drop table if exists public.profiles     cascade;
drop function if exists public.handle_new_user();
