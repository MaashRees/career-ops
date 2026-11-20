# 03 — Processus de travail

Règles complètes et impératives : [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md). Ce document explique **comment on s'en sert**.

## Cycle d'une tâche

```
Backlog (04) ─► choisir une tâche du sprint ─► branche dédiée ─► développer + tester ─► contrôles locaux
      ▲                                                                                      │
      └──── cocher dans le plan (04) ◄── tu fusionnes ◄── revue (toi) ◄── push (+ PR si demandée) ◄── commit
```

1. **Choisir** une tâche du sprint en cours dans [04](04-plan-sprints.md) (jamais hors sprint sans l'y inscrire d'abord).
2. **Brancher** : `git switch -c <type>/<sujet-court>` depuis la branche de base à jour. Jamais sur `main`.
3. **Développer par petits pas**, tests en même temps que le code.
4. **Contrôler** (dans `platform/`) : `npm run typecheck && npm test && npm run build`.
5. **Commiter** (voir ci-dessous), **pousser** la branche.
6. **Revue** : tu relis le diff ; une pull request est ouverte **sur ta demande** ; **c'est toi qui fusionnes**.
7. **Mettre à jour** `04-plan-sprints.md` (cases cochées) et la doc concernée, dans la même branche.

## Branches

| Type | Usage | Exemple |
|---|---|---|
| `feat/` | nouvelle fonctionnalité | `feat/shared-portal-scan` |
| `fix/` | correction de bug | `fix/run-status-polling` |
| `security/` | durcissement | `security/platform-hardening` |
| `docs/` | documentation seule | `docs/platform-process-and-sprints` |
| `chore/` | outillage, dépendances, process | `chore/git-workflow-rules` |
| `refactor/`, `test/` | restructuration, tests seuls | `refactor/runs-module` |

Pas de mention d'outil ou d'assistant dans les noms. Une branche = une intention ; si elle grossit, on la coupe.

### Branches empilées (état actuel)

Les trois branches du Sprint 1 sont empilées : chacune part de la précédente. **Ordre de fusion obligatoire** :

```
base (plateforme MVP) ──► chore/git-workflow-rules ──► security/platform-hardening ──► docs/platform-process-and-sprints
```

Fusionner dans cet ordre (ou fusionner directement la dernière, qui contient toutes les autres). Après fusion de la base,
rebaser la suivante n'est pas nécessaire si la fusion est faite « telle quelle » ; en cas de squash, repartir de la branche
principale à jour pour les branches suivantes.

## Commits

- **Identité** : auteur *et* committer = `Seer MENSAH-ASSIAKOLEY <seerharley03@gmail.com>`. Réglage local : `sh platform/scripts/install-git-hooks.sh`.
- **Aucune trace d'outil** : pas de `Co-Authored-By`, pas de trailer de session, pas de mention d'outil ou d'IA dans les
  messages, descriptions de pull request ou noms de branche.
- **Format** : Conventional Commits — `type(périmètre): sujet` (≤ 72 caractères), puis un corps qui explique le *pourquoi*.
  Types : `feat`, `fix`, `security`, `docs`, `test`, `refactor`, `chore`. Périmètre : `platform`, `db`, `workflow`…
- **Taille** : un commit = un changement cohérent qui passe les tests. Pas de « WIP » poussé.

### Garde-fous automatiques (hooks Git)

| Hook | Refuse |
|---|---|
| `pre-commit` | commit sur `main`/`master` ; nom ou adresse de l'auteur ou du committer différents de l'identité ci-dessus |
| `commit-msg` | `Co-Authored-By`, trailer de session, mention d'outil/IA, message vide |
| `pre-push` | push vers `main`/`master` ; nouveaux commits avec mauvaise identité (nom ou adresse) ou message interdit (même créés avec `--no-verify`) |

Un hook qui refuse = corriger la cause. `--no-verify` ne s'utilise pas. Les hooks sont testés
(`platform/tests/git-hooks.test.ts`).

## Définition de « prêt » (avant de commencer une tâche)

- Objectif et critères d'acceptation écrits dans le plan.
- Dépendances connues (ex. « nécessite le script SQL 0003 »).
- Impact sécurité évalué (voir checklist ci-dessous).

## Définition de « terminé »

- [ ] `npm run typecheck`, `npm test`, `npm run build` passent dans `platform/`.
- [ ] Les tests couvrent le comportement ajouté **et** le cas d'abus évident.
- [ ] Si la base change : script `migrations/` + `verify/` + `rollback/` livrés, testés sur Postgres en mémoire,
      [06](06-base-de-donnees.md) mis à jour, **et la consigne d'exécution donnée à l'utilisateur**.
- [ ] Documentation et plan de sprint à jour.
- [ ] Aucun secret ajouté ; `npm audit --omit=dev` propre.
- [ ] Commit(s) conformes (identité, message), branche poussée.

## Checklist de revue sécurité (à chaque changement)

1. Nouvelle entrée utilisateur ? → validée (type, longueur, format) côté serveur.
2. Nouvelle donnée utilisateur ? → table avec RLS **et** test d'isolation ; plafonds de taille.
3. Nouvelle Server Action ou route ? → authentifie l'appelant (le test statique le vérifie ; toute route est inventoriée).
4. Nouvel appel réseau sortant ? → protégé SSRF, délai et taille bornés.
5. Nouveau contenu affiché provenant d'un modèle ou d'une offre ? → rendu sans HTML ni image.
6. Nouvelle variable d'environnement ? → documentée dans `.env.example` et `README`, jamais `NEXT_PUBLIC_` si secrète.
7. Nouvelle dépendance ? → justifiée, `npm audit` propre.

## Ouverture d'un sprint / d'une session de travail

1. Relire [04](04-plan-sprints.md) (objectif du sprint, tâches restantes) et [05](05-securite.md) (risques ouverts).
2. Vérifier l'identité et les hooks : `git config user.email` puis `git config core.hooksPath`.
3. Partir de la branche de base à jour ; créer la branche de la tâche.
4. En fin de session : résumé de ce qui est fait/reste, **scripts SQL à exécuter**, branches poussées.

## Rôles

| Qui | Fait |
|---|---|
| **Toi (propriétaire)** | Fixe les priorités, relit, **exécute les scripts SQL**, configure Supabase et l'hébergeur, saisit les clés, fusionne, invite les utilisateurs |
| **L'assistant** | Code, teste, documente, prépare les scripts SQL et les consignes ; ne touche jamais à la base, ne demande jamais de clés, ne fusionne pas |
