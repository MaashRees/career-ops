# 06 — Base de données : des scripts, que tu exécutes

## Règle

**L'assistant ne touche jamais à ta base** et ne te demande jamais de clé. Tout changement de base est livré sous forme de
**scripts versionnés** que **tu** exécutes toi-même dans Supabase (*SQL Editor* → coller → *Run*).

Pour chaque changement, trois fichiers :

| Dossier | Contenu | Quand |
|---|---|---|
| `supabase/migrations/NNNN_nom.sql` | Le changement. **Rejouable sans erreur**, commenté en français | Tu l'exécutes |
| `supabase/verify/NNNN_nom.sql` | Contrôles en **lecture seule** ; chaque ligne doit afficher `ok = true` | Juste après la migration |
| `supabase/rollback/NNNN_nom.sql` | Retour arrière (ou note expliquant pourquoi c'est impossible) | Seulement en cas de problème |

Numérotation continue ; **un script déjà livré n'est jamais modifié** : on ajoute le suivant.

## Règle de schéma : jamais dans `public`

Tout objet SQL de l'application vit dans le schéma dédié **`jobhunter`**. Raison : le schéma `public` est celui que l'API
automatique de Supabase (PostgREST) expose **par défaut** à quiconque possède la clé publique ; un schéma dédié n'est exposé
que si **tu** l'ajoutes explicitement, et il n'a **aucun droit par défaut** : chaque droit est accordé à la main, au plus juste.

| Rôle | Accès au schéma `jobhunter` |
|---|---|
| `anon` (visiteur non connecté) | **aucun** (pas même l'usage du schéma) |
| `authenticated` (utilisateur connecté) | uniquement ce que fait l'application, **et** limité à ses lignes par la RLS : lecture de son profil, de ses rapports, documents et analyses ; lecture/écriture de ses réglages et candidatures |
| `service_role` (serveur) | tout (tâches de fond, page d'administration) ; seul à pouvoir appeler `start_run` |

Le nom du schéma se règle côté application par `SUPABASE_DB_SCHEMA` (défaut `jobhunter`). Pour le renommer, remplace-le aussi
dans les scripts SQL (rechercher/remplacer `jobhunter`) **avant** de les exécuter.

## Registre des scripts

| N° | Fichier | Ce qu'il fait | Vérif. | Retour arrière | État sur ta base |
|---|---|---|---|---|---|
| 0001 | `0001_init.sql` | Tables (profils, réglages/CV, candidatures, rapports, documents, analyses), RLS, création automatique du profil à l'inscription | `verify/0001_init.sql` | `rollback/0001_init.sql` ⚠️ **destructif** | 🟡 à exécuter (S2-02) |
| 0002 | `0002_security_hardening.sql` | `start_run` (quotas atomiques), plafonds de taille/nombre, droits restreints sur les fonctions | `verify/0002_security_hardening.sql` | `rollback/0002_security_hardening.sql` | 🟡 à exécuter (S2-03) |
| 0003 | `0003_dedicated_schema.sql` | **Déplace tout dans le schéma `jobhunter`** (données conservées), recrée fonctions et déclencheurs, pose des droits minimaux | `verify/0003_dedicated_schema.sql` | `rollback/0003_dedicated_schema.sql` (déconseillé) | 🟡 à exécuter (S2-03b) |
| 0004 | *(Sprint 3)* `jobs`, `job_matches` — **directement dans `jobhunter`** | Scanner partagé | — | — | ⏳ |
| 0005 | *(Sprint 4)* `status_log` — **directement dans `jobhunter`** | Historique des statuts | — | — | ⏳ |

> **0001 et 0002 créent dans `public`** (elles étaient déjà livrées : on ne modifie jamais un script livré). **0003 règle ça.**
> **Après 0003, ne rejoue plus jamais 0001 ni 0002** : elles recréeraient des tables *vides* dans `public`.
> Le script `verify/0003` contrôle justement qu'il ne reste rien dans `public`.

## Que faire selon ta situation

| Où en es-tu ? | Marche à suivre |
|---|---|
| **Rien n'a encore été exécuté** | `0001` → `0002` → `0003` dans la foulée (quelques secondes, aucune donnée en jeu), puis **seulement** `verify/0003` |
| **0001 et 0002 déjà exécutées** (tes données sont dans `public`) | **seulement `0003`** : elle déplace tables, politiques, index et données, recrée les fonctions, puis `verify/0003` |
| **0003 déjà exécutée** | rien à refaire ; ne rejoue ni 0001 ni 0002 |

Dans tous les cas, **après 0003 : étape manuelle** → Supabase → *Project Settings → API* → **Exposed schemas** : ajoute
`jobhunter` et, si tu n'utilises `public` pour rien d'autre, **retire `public`** (et `graphql_public` si inutile). Sans cela,
l'application ne voit plus ses tables. Pense à ajouter `SUPABASE_DB_SCHEMA=jobhunter` chez l'hébergeur (ou laisse le défaut).

Contrôle depuis l'extérieur, avec la seule clé publique (jamais la clé `service_role`) :
`sh platform/scripts/supabase-exposure-check.sh https://TON-PROJET.supabase.co <clé publishable>` — tout doit être ✓
(`public` n'expose rien de l'application ; `jobhunter` est exposé mais fermé aux anonymes).

## Comment exécuter un script (pas à pas)

1. **Sauvegarde** (surtout avant 0002 ou tout script futur) : vérifie dans Supabase → *Database → Backups* qu'une sauvegarde
   récente existe, ou exporte les données.
2. Supabase → **SQL Editor** → *New query*.
3. Ouvre le fichier de migration, **relis-le**, colle-le, *Run*. Une erreur s'affiche en rouge : ne rien « corriger » à la main,
   la copier à l'assistant.
4. Nouvelle requête : colle le script `verify/` correspondant, *Run* : **toutes les lignes doivent afficher `true`**.
5. Note la date et le résultat dans le registre ci-dessus (dans la branche qui suit).

## Ordre et dépendances

`0001` → `0002` → `0003` → exposer le schéma → (code de l'app, qui appelle `start_run` dans `jobhunter`). **Déployer la version de l'app avec `start_run` sans avoir exécuté 0002
fait échouer le lancement des analyses** (le message du serveur indique la migration manquante).

## Ce que protègent les scripts actuels

**0001 — isolation** : chaque table a la RLS ; un utilisateur ne voit, ne modifie et ne supprime que ses lignes
(`user_id = auth.uid()`). `reports`, `documents` et `runs` ne sont **pas** inscriptibles par les utilisateurs (le serveur
les écrit). Les rôles anonymes n'ont aucun accès. Supprimer un compte supprime tout en cascade.

**0002 — abus** :
- `start_run(...)` : contrôle quotas **et** crée l'analyse dans une transaction, verrou par utilisateur. Compte une analyse si
  elle est en cours, terminée, ou échouée *après* un appel IA. Une analyse « en cours » depuis plus de 12 min ne bloque plus.
  Réservée à `service_role`.
- Plafonds : CV ≤ 60 000 caractères, notes ≤ 5 000, profil JSON ≤ 20 000 octets, champs de candidature bornés,
  ≤ 1 000 candidatures par utilisateur — pour que l'accès direct à l'API avec la clé publique ne permette pas de gonfler la base.
- `handle_new_user()` n'est plus appelable par les rôles API.

## Comment l'assistant teste un script avant de te le donner

Chaque script est exécuté sur un Postgres **en mémoire** (PGlite) avec des remplaçants des éléments fournis par Supabase
(rôles, `auth.uid()`), **deux fois** (rejouabilité), puis :
tests d'isolation (`tests/rls.test.ts`), tests de la fonction et des plafonds (`tests/db-security.test.ts`),
exécution des scripts `verify/` (ils doivent tout renvoyer à `true`) et du `rollback/` (retrait puis réapplication).

**Limite** : ce n'est pas ta vraie base. Les différences possibles (versions, extensions, droits réels des rôles Supabase) sont
couvertes par le `verify/` que tu exécutes, et la concurrence réelle par S2-08.

## Gabarit pour un nouveau script (à suivre par l'assistant)

```sql
-- ⚠️ Tout dans le schéma dédié « jobhunter » : JAMAIS « public ». Noms toujours qualifiés.
-- ============================================================================
--  NNNN — Titre court
--  À EXÉCUTER APRÈS NNNN-1, par toi, dans Supabase → SQL Editor → Run.
--  Rejouable sans erreur. Vérification : verify/NNNN_nom.sql — Retour arrière : rollback/NNNN_nom.sql
--  Ce que ça change : 1) … 2) …
-- ============================================================================
-- create table if not exists jobhunter.xxx (…) ; create or replace function jobhunter.yyy(…) … set search_path = '' ;
-- alter table jobhunter.xxx drop constraint if exists … ; alter table jobhunter.xxx add constraint … ;
-- RLS : alter table jobhunter.xxx enable row level security ;
--       drop policy if exists … ; create policy … on jobhunter.xxx … using (user_id = (select auth.uid())) ;
-- DROITS (un schéma dédié n'en a aucun par défaut) :
--   revoke all on jobhunter.xxx from public, anon, authenticated ;
--   grant select, insert, update on jobhunter.xxx to authenticated ;   -- seulement le nécessaire
--   grant all on jobhunter.xxx to service_role ;
--   revoke all on function jobhunter.yyy(…) from public, anon, authenticated ;
--   grant execute on function jobhunter.yyy(…) to service_role ;      -- si réservée au serveur
```

Toute nouvelle table : **dans `jobhunter`**, RLS activée, politiques explicites, droits minimaux, test d'isolation, plafonds de taille, ligne dans `verify/`.
