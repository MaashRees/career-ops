# 02 — Architecture

## Vue d'ensemble

```
 Navigateur ──HTTPS──► Reverse proxy ──► Conteneur Next.js (toujours allumé, 1 instance)
                                            │
                       ┌────────────────────┼────────────────────────┐
                       ▼                    ▼                        ▼
               Supabase Auth          Supabase Postgres        Fournisseurs IA
            (invitations, sessions)   (RLS : 1 user = ses      Anthropic (clé serveur)
                                       lignes ; start_run)     OpenRouter (clé serveur, secours)
```

| Brique | Rôle | Où |
|---|---|---|
| **Next.js 16** (App Router, Server Actions) | Pages, formulaires, API de suivi, tâches en arrière-plan | `platform/src` |
| **Supabase Auth** | Invitations, mot de passe, lien magique, sessions (cookies `httpOnly`) | `src/lib/supabase`, `src/actions/auth.ts` |
| **Supabase Postgres** | Données dans le **schéma dédié `jobhunter`** (jamais `public`) + isolation par RLS + fonction `start_run` | `platform/supabase` |
| **Moteur career-ops** | Prompts d'évaluation (`engine/modes/*.md`), copiés par `npm run sync-engine` | `platform/engine` |
| **Fournisseurs IA** | Appels `messages` (Anthropic) et `chat/completions` (OpenRouter), avec repli | `src/lib/llm` |

Aucun fichier utilisateur n'est stocké : le PDF importé est lu en mémoire, seul le texte converti est conservé.

## Flux d'une analyse d'offre

1. L'utilisateur soumet une URL ou un texte (`EvaluateForm` → Server Action `startEvaluation`).
2. La Server Action **authentifie**, **valide** (longueurs, format) et appelle `startRun`.
3. `startRun` appelle la fonction SQL **`start_run`** : dans *une* transaction, vérifie quotas (par personne, global,
   simultanés) et crée la ligne `runs` (statut `running`). Dépassement → erreur lisible.
4. La réponse HTTP part (redirection vers `/runs/<id>`) ; **ensuite** `after()` lance `executeRun` dans le processus.
5. `executeRun` : charge CV + profil → récupère l'offre (`jd/fetch.ts`, protégé contre le SSRF) ou prend le texte collé →
   construit le prompt du moteur (`engine/prompts.ts`) → appelle le fournisseur IA (`llm/index.ts`, repli automatique) →
   **valide** la réponse (`engine/report.ts`) → crée/met à jour la candidature (dédoublonnage par URL) → enregistre le rapport.
6. La page de suivi interroge `/api/runs/<id>` toutes les 2 s ; au statut `done`, redirection vers la candidature.
   Un échec écrit un message lisible dans `runs.error`. Une analyse `running` depuis > 12 min est marquée `stale`.

Les écritures de fond (rapports, documents, résultats) utilisent la clé *service role* avec un filtre `user_id` explicite ;
tout le reste passe par la session de l'utilisateur et la RLS.

## Plan du code

```
platform/
├─ src/
│  ├─ app/                 pages (login, (app)/ privé : tableau de bord, candidatures, profil, documents, runs, admin)
│  │                        et routes (api/health, api/runs/[id], auth/confirm, auth/signout)
│  ├─ actions/             Server Actions (auth, runs, applications, profile) — chacune authentifie l'appelant
│  ├─ components/          composants (formulaires client, rendu markdown sûr, badges…)
│  ├─ lib/
│  │  ├─ env.ts            configuration lue à l'exécution (+ « échoue fermé » en production)
│  │  ├─ llm/              clients Anthropic / OpenRouter + repli + cache de prompt
│  │  ├─ engine/           prompts du moteur, analyse du rapport, garde-fou « chiffres inventés »
│  │  ├─ jd/               récupération d'offre, extraction JSON-LD/HTML, protection SSRF
│  │  ├─ runs.ts           exécution des analyses (évaluation, lettre, CV adapté, import CV)
│  │  ├─ start-run.ts      démarrage atomique (RPC start_run) + lancement en arrière-plan
│  │  ├─ rate-limit.ts, origin.ts, markdown-config.ts   garde-fous de sécurité
│  │  └─ supabase/         clients (session / admin) et proxy d'authentification
│  └─ proxy.ts             protège toutes les pages et l'API ; rafraîchit la session
├─ supabase/               migrations/ (à exécuter), verify/ (lecture seule), rollback/
├─ engine/                 copie des prompts du moteur (_shared, oferta, _writing)
├─ tests/                  unitaires, flux complets, RLS/quotas sur Postgres en mémoire, garde-fous statiques, hooks Git
├─ scripts/                sync-engine, hooks Git versionnés, installateur
└─ docs/                   cette documentation
```

## Décisions d'architecture

| # | Décision | Alternatives écartées | Raison |
|---|---|---|---|
| A1 | **Supabase (Postgres + Auth)** | Neo4j, base maison | Données relationnelles ; Auth et RLS fournis ; Neo4j n'apporterait un gain que pour un graphe de contacts (plus tard) |
| A2 | **Clés IA côté serveur (variables d'environnement)** | Clé fournie par chaque utilisateur (BYOK) | Demande explicite ; simplicité pour des proches ; coût maîtrisé par quotas. BYOK reste possible plus tard |
| A3 | **Conteneur Docker toujours allumé**, analyses *en arrière-plan dans le processus* | Serverless, file d'attente externe | Analyses de 30 s à 3 min incompatibles avec les délais serverless ; pour quelques personnes une file externe serait du sur-dimensionnement |
| A4 | **Quotas dans une fonction SQL atomique** | Vérification en JavaScript avant insertion | La version JavaScript laissait passer des requêtes simultanées (audit Sprint 1) |
| A5 | **Prompts du moteur copiés dans `engine/`** | Import direct de `../modes` | L'app reste déployable seule ; mise à jour explicite par `npm run sync-engine` |
| A6 | **PDF = impression du navigateur** | Chromium sur le serveur | Pas de navigateur à héberger ; suffisant pour un CV/une lettre |
| A7 | **Rendu markdown sans HTML ni image** | Rendu riche | Anti-injection et anti-exfiltration (le contenu vient d'un modèle qui lit des textes non fiables) |
| A9 | **Schéma dédié `jobhunter`, jamais `public`** | Tables dans `public` | `public` est exposé par défaut par l'API Supabase ; un schéma dédié n'est exposé que sur ton action et n'a aucun droit par défaut |
| A8 | **Une instance** | Plusieurs instances | Limiteur de connexions et analyses en processus supposent une instance ; levier de montée en charge documenté ci-dessous |

## Limites connues et montée en charge

- **Une seule instance** : le limiteur de tentatives de connexion est en mémoire, et une analyse en cours est liée au processus.
  Pour plusieurs instances : limiteur partagé (base ou Redis) et file de tâches (ex. file Postgres) — Sprint 5 / backlog.
- Redémarrage pendant une analyse → statut `stale` après 12 min, l'utilisateur relance.
- Pages d'offres en JavaScript pur ou protégées → l'utilisateur colle le texte.
- Le test de concurrence du verrou `start_run` n'est pas démontrable sur le Postgres en mémoire des tests
  (exécution séquentielle) : il est à valider sur une vraie base — voir [06](06-base-de-donnees.md).
