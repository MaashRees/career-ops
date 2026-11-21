# Netlify — déconseillé pour cette application

**Ne convient pas en l'état** ❌. Ce guide explique pourquoi, ce qu'il faudrait changer, et comment tester si tu insistes.

> Sources : documentation Netlify lue le 20/11/2026. Ce qui n'y figure pas est marqué *(non confirmé)*.

## Pourquoi ça ne marche pas tel quel

| Besoin de l'application | Ce que dit Netlify | Conséquence |
|---|---|---|
| Une analyse dure **30 s à 3 min** et tourne en arrière-plan après la réponse | Fonctions synchrones : « **60 secondes**, non configurable ». `waitUntil` prolonge l'exécution seulement « jusqu'à la limite de temps de la fonction » | Une analyse dépassant 60 s serait **interrompue** : l'utilisateur verrait « analyse interrompue » au bout de 12 min |
| Un **processus Node toujours allumé**, une seule instance | Next.js tourne sur Netlify en **fonctions sans état** (adaptateur OpenNext). *Netlify Server* (serveur persistant, en accès anticipé) indique que les frameworks complets comme Next.js « ne tournent pas encore dessus » | Le limiteur de connexions en mémoire et les analyses « dans le processus » n'ont pas de sens |
| Next.js **16** et le fichier `proxy.ts` | Compatibilité vérifiée « pour chaque version stable », mais Next.js 16 et `proxy.ts` **ne sont pas cités** *(non confirmé)* ; le middleware est exécuté en *Edge Function* | Risque d'incompatibilité avec le contrôle d'accès de l'application |
| Image Docker | Aucune mention de Docker dans les pages lues | Le `Dockerfile` ne servirait à rien |

## Ce qu'il faudrait faire (travail de développement, non planifié)

1. Déplacer l'exécution des analyses dans une **fonction d'arrière-plan Netlify** (durée max **15 minutes**, déclenchée de façon
   asynchrone, charge utile limitée à **256 Ko** — donc ne transmettre que l'identifiant de l'analyse et relire les données en base).
2. Vérifier la compatibilité de Next.js 16 / `proxy.ts` avec l'adaptateur.
3. Remplacer le limiteur de connexions en mémoire par un limiteur partagé (Sprint 5).
4. Refaire la recette de sécurité complète.

C'est un chantier à part entière (backlog : « Support Netlify »). **Rien ne le justifie** tant que Railway (5 $/mois) ou
Coolify fonctionnent.

## Si tu veux quand même tester (à tes risques)

À faire sur une **branche de test et un site Netlify jetable**, jamais avec les vraies clés de production :

1. Netlify → **Add new site → Import an existing project** → ton dépôt → *Base directory* `platform`, *Build command* `npm run build`.
2. Variables d'environnement : celles de la [préparation commune](../08-deploiement.md#préparation-commune-avant-nimporte-quel-hébergeur)
   (avec des clés de test à plafond de dépense très bas).
3. Lance une analyse **complète** : si elle reste « en cours » puis passe en « interrompue », la limite de 60 s est confirmée.
   **Abandonne** dans ce cas.

## Alternative raisonnable

Garder Netlify pour autre chose (site vitrine statique) et déployer cette application sur [Railway](railway.md)
ou [Coolify](coolify.md).
