# Documentation de la plateforme

Plateforme web privée (famille, amis) construite sur le moteur career-ops : chaque personne a son compte, son CV,
son profil et ses candidatures, et utilise les clés IA du propriétaire (variables d'environnement serveur).

## Ordre de lecture

| # | Document | Pour quoi faire |
|---|---|---|
| 01 | [Vision et périmètre](01-vision-et-perimetre.md) | Pourquoi, pour qui, ce qui est dedans / dehors |
| 02 | [Architecture](02-architecture.md) | Comment c'est construit, flux d'une analyse, décisions et leurs raisons |
| 03 | [Processus de travail](03-processus-de-travail.md) | Branches, commits, revues, « terminé », ordre de fusion |
| 04 | [Plan de sprints](04-plan-sprints.md) | Ce qui est fait, ce qui reste, dans quel ordre, avec l'avancement |
| 05 | [Sécurité](05-securite.md) | Menaces, mesures, preuves, checklist de mise en ligne, risques restants |
| 06 | [Base de données](06-base-de-donnees.md) | Scripts SQL **à exécuter par toi**, ordre, vérification, retour arrière |
| 07 | [Exploitation](07-exploitation.md) | Surveiller, maîtriser les coûts, incidents, rotation des clés |
| 08 | [Choisir l'hébergeur et préparer le déploiement](08-deploiement.md) | Comparatif chiffré, recommandation, préparation commune, tests après déploiement |
| — | Guides : [Railway](deploiement/railway.md) · [Coolify](deploiement/coolify.md) · [Netlify (déconseillé)](deploiement/netlify.md) | Pas à pas par hébergeur |

Le guide de mise en route pas à pas est dans le [`README` de la plateforme](../README.md).
Les règles de travail (Git, identité, base de données) sont dans [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md).

## État au dernier sprint terminé (Sprint 1)

| Domaine | État |
|---|---|
| Application (comptes, profil/CV, analyse d'offre, candidatures, lettre, CV adapté, admin) | ✅ écrite et testée |
| Sécurité applicative (audit + correctifs) | ✅ faite — voir [05](05-securite.md) |
| Scripts SQL 0001 et 0002 | 🟡 écrits et testés en local, **pas encore exécutés sur ta base Supabase** |
| Mise en ligne (Supabase réel, hébergeur, clés, invités) | ⏳ Sprint 2 |
| Test de bout en bout avec de vraies clés IA et de vraies offres | ⏳ Sprint 2 |

## Conventions de ces documents

- Un document = un sujet. On met à jour le document concerné **dans la même branche** que le changement.
- ✅ fait et vérifié · 🟡 fait mais action de ta part requise · ⏳ à faire · ⚪ risque accepté en connaissance de cause.
- Chaque affirmation de sécurité renvoie à un fichier ou à un test : pas de « ça devrait aller ».
