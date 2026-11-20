-- Plateforme multi-comptes (moteur career-ops) — schéma initial.
-- À exécuter dans Supabase : SQL Editor → coller → Run (ou `supabase db push`).
--
-- Principe de sécurité : RLS activée partout. Un utilisateur ne voit et ne
-- modifie que SES lignes (user_id = auth.uid()). Les écritures faites par les
-- tâches de fond (résultats d'analyse, rapports, documents) passent par la clé
-- "service role", côté serveur uniquement : elle n'est jamais envoyée au navigateur.


-- ───────────────────────── profils ─────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  created_at  timestamptz not null default now()
);

-- Création automatique du profil + des réglages à l'arrivée d'un utilisateur.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''))
    on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ───────────────────────── réglages / CV ─────────────────────────
create table if not exists public.user_settings (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  cv_md            text    not null default '',          -- CV en markdown (équivalent de cv.md)
  profile          jsonb   not null default '{}'::jsonb, -- identité, cibles, salaire… (équivalent de profile.yml)
  profile_md       text    not null default '',          -- récit, archétypes, "jamais" (équivalent de _profile.md)
  output_language  text    not null default 'fr',
  spend_tier       text    not null default 'standard'
                     check (spend_tier in ('economy', 'standard', 'premium')),
  updated_at       timestamptz not null default now()
);

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── candidatures (tracker) ─────────────────────────
create table if not exists public.applications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  num         integer not null,                 -- numéro par utilisateur (#001…)
  company     text not null default '',
  role        text not null default '',
  url         text,
  url_key     text,                             -- URL normalisée : dédoublonnage
  score       numeric(2,1) check (score is null or (score >= 0 and score <= 5)),
  decision    text,                             -- Apply / Consider / Research first / Skip
  legitimacy  text,
  status      text not null default 'Evaluated'
                check (status in ('Evaluated','Speculative','Applied','Responded','Assessment',
                                  'Interview','Offer','Hired','Rejected','Discarded','SKIP')),
  notes       text not null default '',
  applied_on  date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, num)
);
create unique index if not exists applications_user_url_key
  on public.applications (user_id, url_key) where url_key is not null;
create index if not exists applications_user_status on public.applications (user_id, status);

-- ───────────────────────── rapports d'évaluation ─────────────────────────
create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  application_id  uuid not null references public.applications (id) on delete cascade,
  markdown        text not null,
  jd_text         text not null default '',
  depth           text not null default 'essential' check (depth in ('essential', 'full')),
  score           numeric(2,1),
  provider        text,
  model           text,
  created_at      timestamptz not null default now()
);
create index if not exists reports_application on public.reports (application_id, created_at desc);

-- ───────────────────────── documents générés (lettre, CV adapté) ─────────────────────────
create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  application_id  uuid not null references public.applications (id) on delete cascade,
  kind            text not null check (kind in ('cover_letter', 'tailored_cv')),
  markdown        text not null,
  warnings        jsonb not null default '[]'::jsonb,  -- ex. chiffres absents du CV d'origine
  created_at      timestamptz not null default now()
);
create index if not exists documents_application on public.documents (application_id, created_at desc);

-- ───────────────────────── exécutions (appels IA) ─────────────────────────
create table if not exists public.runs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('evaluate', 'cover_letter', 'tailored_cv', 'cv_import')),
  status          text not null default 'running' check (status in ('running', 'done', 'failed')),
  input           jsonb not null default '{}'::jsonb,
  application_id  uuid references public.applications (id) on delete set null,
  result_type     text check (result_type in ('report', 'document')),
  result_id       uuid,
  output          text,                      -- sortie brute (import de CV à valider)
  error           text,
  error_code      text,
  provider        text,
  model           text,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  cache_read_tokens   integer not null default 0,
  cache_write_tokens  integer not null default 0,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index if not exists runs_user_created on public.runs (user_id, created_at desc);
create index if not exists runs_created on public.runs (created_at desc);

-- ───────────────────────── RLS ─────────────────────────
alter table public.profiles       enable row level security;
alter table public.user_settings  enable row level security;
alter table public.applications   enable row level security;
alter table public.reports        enable row level security;
alter table public.documents      enable row level security;
alter table public.runs           enable row level security;

-- profiles : lecture de son propre profil uniquement (écriture par trigger/service role)
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

-- user_settings : lecture + mise à jour de ses propres réglages
drop policy if exists settings_select_own on public.user_settings;
create policy settings_select_own on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists settings_insert_own on public.user_settings;
create policy settings_insert_own on public.user_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists settings_update_own on public.user_settings;
create policy settings_update_own on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- applications : tout sur les siennes (modifier statut/notes, supprimer)
drop policy if exists applications_select_own on public.applications;
create policy applications_select_own on public.applications
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists applications_insert_own on public.applications;
create policy applications_insert_own on public.applications
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists applications_update_own on public.applications;
create policy applications_update_own on public.applications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists applications_delete_own on public.applications;
create policy applications_delete_own on public.applications
  for delete to authenticated using (user_id = (select auth.uid()));

-- reports / documents : lecture et suppression des siens (création par le serveur)
drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists reports_delete_own on public.reports;
create policy reports_delete_own on public.reports
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists documents_select_own on public.documents;
create policy documents_select_own on public.documents
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists documents_delete_own on public.documents;
create policy documents_delete_own on public.documents
  for delete to authenticated using (user_id = (select auth.uid()));

-- runs : lecture des siens (création et mise à jour par le serveur uniquement)
drop policy if exists runs_select_own on public.runs;
create policy runs_select_own on public.runs
  for select to authenticated using (user_id = (select auth.uid()));

-- Aucun accès pour le rôle anonyme.
revoke all on public.profiles, public.user_settings, public.applications,
              public.reports, public.documents, public.runs from anon;

-- Utilisateurs créés AVANT cette migration (ex. invités plus tôt) : on les rattrape.
insert into public.profiles (id, email)
  select id, coalesce(email, '') from auth.users
  on conflict (id) do nothing;
insert into public.user_settings (user_id)
  select id from auth.users
  on conflict (user_id) do nothing;
