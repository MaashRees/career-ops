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

## Registre des scripts

| N° | Fichier | Ce qu'il fait | Vérif. | Retour arrière | État sur ta base |
|---|---|---|---|---|---|
| 0001 | `0001_init.sql` | Tables (profils, réglages/CV, candidatures, rapports, documents, analyses), RLS, création automatique du profil à l'inscription | `verify/0001_init.sql` | `rollback/0001_init.sql` ⚠️ **destructif** | 🟡 à exécuter (S2-02) |
| 0002 | `0002_security_hardening.sql` | `start_run` (quotas atomiques), plafonds de taille/nombre, droits restreints sur les fonctions | `verify/0002_security_hardening.sql` | `rollback/0002_security_hardening.sql` | 🟡 à exécuter (S2-03) |
| 0003 | *(Sprint 3)* `jobs`, `job_matches` | Scanner partagé | — | — | ⏳ |
| 0004 | *(Sprint 4)* `status_log` | Historique des statuts | — | — | ⏳ |

## Comment exécuter un script (pas à pas)

1. **Sauvegarde** (surtout avant 0002 ou tout script futur) : vérifie dans Supabase → *Database → Backups* qu'une sauvegarde
   récente existe, ou exporte les données.
2. Supabase → **SQL Editor** → *New query*.
3. Ouvre le fichier de migration, **relis-le**, colle-le, *Run*. Une erreur s'affiche en rouge : ne rien « corriger » à la main,
   la copier à l'assistant.
4. Nouvelle requête : colle le script `verify/` correspondant, *Run* : **toutes les lignes doivent afficher `true`**.
5. Note la date et le résultat dans le registre ci-dessus (dans la branche qui suit).

## Ordre et dépendances

`0001` → `0002` → (code de l'app qui appelle `start_run`). **Déployer la version de l'app avec `start_run` sans avoir exécuté 0002
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
-- ============================================================================
--  NNNN — Titre court
--  À EXÉCUTER APRÈS NNNN-1, par toi, dans Supabase → SQL Editor → Run.
--  Rejouable sans erreur. Vérification : verify/NNNN_nom.sql — Retour arrière : rollback/NNNN_nom.sql
--  Ce que ça change : 1) … 2) …
-- ============================================================================
-- create table if not exists … ; create or replace function … ;
-- alter table … drop constraint if exists … ; alter table … add constraint … ;
-- drop policy if exists … ; create policy … ;
-- RLS : alter table … enable row level security ;  + politiques « user_id = (select auth.uid()) »
-- Droits : revoke all on function … from public, anon, authenticated ; grant execute … to service_role ;
```

Toute nouvelle table : RLS activée, politiques explicites, test d'isolation, plafonds de taille, ligne dans `verify/`.
