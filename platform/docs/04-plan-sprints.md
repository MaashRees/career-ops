# 04 — Plan de sprints et avancement

Cadence : **sprints d'une semaine** (ajustable). Chaque sprint a un objectif, des tâches avec critères d'acceptation et un
propriétaire (**Toi** / **Assistant**). Une tâche se coche **dans la branche qui la livre**.
Définition de « terminé » : [03](03-processus-de-travail.md#définition-de--terminé-).

## Tableau d'avancement

| Sprint | Objectif | Tâches | État |
|---|---|---|---|
| **0** | Fondations : application complète et testée | 10 / 10 | ✅ terminé |
| **1** | Sécurité et processus : audit, correctifs, règles Git, documentation | 13 / 13 | ✅ terminé (tout fusionné dans `main`) |
| **2** | Mise en production et validation réelle | 8 / 13 | 🔄 en cours |
| **3** | Scanner d'offres partagé | 0 / 6 | ⏳ |
| **4** | Suivi avancé et préparation d'entretien | 0 / 6 | ⏳ |
| **5** | RGPD, robustesse et montée en charge | 0 / 7 | ⏳ |

---

## Sprint 0 — Fondations ✅

Branche : `claude/bold-ritchie-p6369a` (base).

- [x] S0-01 Application Next.js + Supabase Auth (invitations, mot de passe, lien magique)
- [x] S0-02 Schéma SQL 0001 : profils, réglages/CV, candidatures, rapports, documents, analyses + RLS
- [x] S0-03 Couche IA : Anthropic + OpenRouter, repli automatique, cache de prompt, niveaux économique/standard/premium
- [x] S0-04 Prompts du moteur adaptés (retrait des consignes à outils), profil YAML, deux niveaux d'analyse
- [x] S0-05 Récupération d'offre (JSON-LD, HTML, API Greenhouse/Lever) avec protection SSRF
- [x] S0-06 Profil & CV : import PDF → markdown validé par l'utilisateur
- [x] S0-07 Candidatures : tableau, statuts canoniques, dédoublonnage par URL, rapport
- [x] S0-08 Lettre de motivation et CV adapté (détecteur de chiffres absents du CV)
- [x] S0-09 Page d'administration (usage, coût estimé) et quotas
- [x] S0-10 Dockerfile, `.env.example`, guide de déploiement

## Sprint 1 — Sécurité et processus ✅

Branches (empilées, dans cet ordre, toutes fusionnées dans `main`) : `chore/git-workflow-rules` → `security/platform-hardening` → `docs/platform-process-and-sprints`.

- [x] S1-01 Règles Git : jamais `main`, une branche par tâche, identité unique, aucune trace d'outil
- [x] S1-02 Hooks Git versionnés (`pre-commit`, `commit-msg`, `pre-push`) + installateur + tests
- [x] S1-03 Audit de sécurité complet de la plateforme (résultats : [05](05-securite.md))
- [x] S1-04 **Quotas atomiques** : fonction SQL `start_run` (corrige le contournement par requêtes simultanées)
- [x] S1-05 Plafonds de taille et de nombre en base (accès direct à l'API avec la clé publique)
- [x] S1-06 Rendu markdown sans image ni HTML (anti-exfiltration)
- [x] S1-07 CSP stricte, HSTS, Permissions-Policy ; cookies de session `httpOnly`
- [x] S1-08 CSRF de la déconnexion, liste fermée des types de lien e-mail, limiteur de connexions
- [x] S1-09 Production « échoue fermé » (`SITE_URL` https, `ALLOWED_EMAILS` obligatoires), admin = e-mail confirmé
- [x] S1-10 SSRF : 6to4/Teredo bloqués ; vie privée OpenRouter (`data_collection=deny`)
- [x] S1-11 Scripts SQL `0002` + `verify/` + `rollback/` (0001 et 0002), testés sur Postgres en mémoire
- [x] S1-12 Garde-fous statiques de sécurité (tests qui échouent si une faille classique revient)
- [x] S1-13 Documentation `platform/docs/` et plan de sprints

---

## Sprint 2 — Mise en production et validation réelle 🔄

**Objectif** : l'application tourne en ligne pour 3–4 personnes, vérifiée de bout en bout avec de vraies clés et de vraies offres.
**Pourquoi d'abord** : tout ce qui précède est testé en local ; rien n'a encore été exécuté sur une vraie base ni avec de vrais fournisseurs.

| ID | Tâche | Qui | Critère d'acceptation |
|---|---|---|---|
| [x] S2-01 | Créer le projet Supabase (région UE) ; sauvegarder le mot de passe de la base | Toi | Projet créé, région UE confirmée (21/11/2026) |
| [x] S2-02 | Exécuter `0001_init.sql` (puis contrôle) | Toi | Exécuté le 21/11/2026 ; contrôlé par `verify/0003` |
| [x] S2-03 | Exécuter `0002_security_hardening.sql` (puis contrôle) | Toi | Exécuté le 21/11/2026 ; contrôlé par `verify/0003` |
| [x] S2-03b | `0003_dedicated_schema.sql` exécuté, `verify/0003` 47/47 `true` ; `jobhunter` exposé ; `scripts/supabase-exposure-check.sh` : **exposition conforme** | Toi | Fait le 21/11/2026 |
| [x] S2-04 | Configurer Auth : inscriptions désactivées, *Site URL*, *Redirect URLs*, 3 modèles d'e-mail | Toi (guide : README §1) | Fait le 21/11/2026 : les invitations envoyées fonctionnent |
| [x] S2-05 | SMTP dédié (Resend, Brevo…) pour des e-mails fiables | Toi | Fait le 21/11/2026 |
| [x] S2-06 | Hébergeur choisi : **Coolify sur ton VPS** ([08](08-deploiement.md), [guide](deploiement/coolify.md)). Application en ligne sur `https://career.maashrees.fr` (déploiement vert, sonde `/api/health`, une instance). `scripts/post-deploy-check.sh` : **tout ✓** | Toi | Fait le 21/11/2026 |
| [x] S2-07 | Limites de dépense mensuelles + alertes chez Anthropic et OpenRouter | Toi | Fait le 21/11/2026 |
| [ ] S2-08 | Script de test de concurrence de `start_run` sur la vraie base (`scripts/db-concurrency-check.mjs`) | Assistant livre / Toi exécutes | **Script livré** (testé sur un faux serveur, conforme et défaillant). Reste à l'exécuter : 12 appels simultanés → exactement N démarrages (mode d'emploi : [05](05-securite.md#recette-de-sécurité--mode-demploi)) |
| [ ] S2-09 | Recette de sécurité avec 2 comptes de test (isolation, quota, admin, liste blanche) : checklist [05](05-securite.md#checklist-de-mise-en-ligne) | Toi + Assistant | **Outillée** : `post-deploy-check.sh` ✓ (15/15), historique Git sans clé, `npm audit` propre, `scripts/recette-securite.mjs` livré. Reste : l'exécuter avec 2 comptes de test + 5 vérifications manuelles |
| [ ] S2-10 | Recette fonctionnelle réelle : import d'un vrai CV, 1 offre par URL, 1 offre collée, lettre, CV adapté | Toi | Rapports cohérents ; corrections notées dans le backlog |
| [ ] S2-11 | Corriger les anomalies de la recette (branches `fix/…`) | Assistant | Aucune anomalie bloquante |
| [ ] S2-12 | Inviter cousine et frère + mini-guide d'utilisation | Toi | Invitations envoyées le 21/11/2026 (la page d'aide `/faq` sert de guide) ; reste : chacun a analysé une offre sans aide (retour de la cousine attendu) |

**Risques** : e-mails Supabase par défaut limités (→ S2-05) ; pages d'offres illisibles par JavaScript (→ coller le texte) ;
coût réel supérieur à l'estimation (→ `/admin` + S2-07).

## Sprint 3 — Scanner d'offres partagé ⏳

**Objectif** : chaque personne voit chaque jour des offres pertinentes, sans payer d'IA pour le tri initial.
Le scanner du moteur interroge des API publiques d'entreprises (sans IA) ; on le lance **une fois pour tous**.

| ID | Tâche | Qui | Critère d'acceptation |
|---|---|---|---|
| [ ] S3-01 | Script SQL `0004` : tables `jobs` (partagée, lecture seule pour les utilisateurs) et `job_matches` (par utilisateur, RLS) + verify + rollback | Assistant livre / Toi exécutes | Tests d'isolation sur Postgres en mémoire |
| [ ] S3-02 | Tâche planifiée de scan (adaptation du scanner du moteur) écrivant dans `jobs` | Assistant | Scan reproductible, dédoublonné, sans IA |
| [ ] S3-03 | Filtrage par profil (postes, pays, salaire) sans IA, puis note rapide au niveau économique à la demande | Assistant | Coût par offre < 1 centime |
| [ ] S3-04 | Page « Offres du jour » + bouton « Analyser en détail » | Assistant | Une offre scannée → analyse complète en un clic |
| [ ] S3-05 | Quotas dédiés au scan et au tri (pas de contournement) | Assistant | Tests de quota |
| [ ] S3-06 | Respect des conditions des sites : API publiques uniquement, pas de LinkedIn | Assistant | Revue documentée dans [05](05-securite.md) |

## Sprint 4 — Suivi avancé et préparation d'entretien ⏳

| ID | Tâche | Critère d'acceptation |
|---|---|---|
| [ ] S4-01 | Script `0005` : historique des changements de statut (`status_log`) + verify + rollback | Chaque changement horodaté |
| [ ] S4-02 | Relances : date suggérée après candidature, rappel sur le tableau de bord | Rappel affiché au bon jour |
| [ ] S4-03 | Préparation d'entretien depuis un rapport (questions, histoires, points faibles à travailler) | Document généré, ancré sur le CV |
| [ ] S4-04 | Journal de bord par candidature (contacts, échanges) | Notes datées |
| [ ] S4-05 | Export CSV des candidatures (par l'utilisateur, sur ses données) | Fichier conforme |
| [ ] S4-06 | Statistiques personnelles (entonnoir, délais) | Chiffres exacts vs données |

## Sprint 5 — RGPD, robustesse et montée en charge ⏳

| ID | Tâche | Critère d'acceptation |
|---|---|---|
| [ ] S5-01 | Export complet de ses données (libre-service) | Archive lisible, uniquement ses données |
| [ ] S5-02 | Suppression de compte en libre-service (cascade déjà en base) | Plus aucune ligne après suppression |
| [ ] S5-03 | Mentions légales, politique de confidentialité, liste des sous-traitants | Pages publiées |
| [ ] S5-04 | Double authentification pour l'administrateur (MFA Supabase) | Connexion admin impossible sans 2ᵉ facteur |
| [ ] S5-05 | CSP par *nonce* (retirer `unsafe-inline` des scripts) | En-tête sans `unsafe-inline` ; application fonctionnelle |
| [ ] S5-06 | Limiteur et file de tâches partagés (plusieurs instances) | Test avec 2 instances |
| [ ] S5-07 | Journal d'audit des actions sensibles (invitations, suppressions, changements de quotas) | Journal consultable |

## Backlog (non planifié)

Clé IA fournie par chaque utilisateur (BYOK) ou connexion OpenRouter (OAuth) · crédits payants · PDF généré côté serveur ·
notifications par e-mail · application installable (PWA) · graphe de contacts (si le besoin se confirme) ·
support Netlify (exécution des analyses dans une fonction d'arrière-plan — voir [guide](deploiement/netlify.md)).

## Journal des décisions de planification

| Date | Décision |
|---|---|
| Sprint 1 | Le propriétaire exécute tous les scripts SQL ; l'assistant ne touche jamais à la base |
| Sprint 1 | Les quotas passent en SQL atomique (défaut trouvé à l'audit) |
| Après Sprint 1 | **Tout le SQL dans le schéma dédié `jobhunter`, jamais `public`** (0003) ; règle ajoutée aux consignes de travail |
| Sprint 1 | Production « échoue fermé » : mieux vaut ne pas démarrer que démarrer ouvert |
| Sprint 2 | Numérotation SQL corrigée dans le plan : le scanner prend `0004` et l'historique des statuts `0005` (`0003` est le déplacement vers `jobhunter`, voir [06](06-base-de-donnees.md)) |
| Sprint 2 | Page d'aide `/faq` ajoutée (hors plan initial) : elle sert de mini-guide pour S2-12 |
