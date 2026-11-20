# 04 — Plan de sprints et avancement

Cadence : **sprints d'une semaine** (ajustable). Chaque sprint a un objectif, des tâches avec critères d'acceptation et un
propriétaire (**Toi** / **Assistant**). Une tâche se coche **dans la branche qui la livre**.
Définition de « terminé » : [03](03-processus-de-travail.md#définition-de--terminé-).

## Tableau d'avancement

| Sprint | Objectif | Tâches | État |
|---|---|---|---|
| **0** | Fondations : application complète et testée | 10 / 10 | ✅ terminé |
| **1** | Sécurité et processus : audit, correctifs, règles Git, documentation | 13 / 13 | ✅ terminé (branches poussées, **fusion à faire par toi**) |
| **2** | Mise en production et validation réelle | 0 / 12 | ⏳ prochain |
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

Branches (empilées, dans cet ordre) : `chore/git-workflow-rules` → `security/platform-hardening` → `docs/platform-process-and-sprints`.

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

**À toi pour clore le sprint** : relire et fusionner les trois branches dans l'ordre ([03](03-processus-de-travail.md#branches-empilées-état-actuel)).

---

## Sprint 2 — Mise en production et validation réelle ⏳

**Objectif** : l'application tourne en ligne pour 3–4 personnes, vérifiée de bout en bout avec de vraies clés et de vraies offres.
**Pourquoi d'abord** : tout ce qui précède est testé en local ; rien n'a encore été exécuté sur une vraie base ni avec de vrais fournisseurs.

| ID | Tâche | Qui | Critère d'acceptation |
|---|---|---|---|
| [ ] S2-01 | Créer le projet Supabase (région UE) ; sauvegarder le mot de passe de la base | Toi | Projet créé, région UE vérifiée |
| [ ] S2-02 | Exécuter `0001_init.sql` puis `verify/0001_init.sql` | Toi | Toutes les lignes `ok = true` |
| [ ] S2-03 | Exécuter `0002_security_hardening.sql` puis `verify/0002_security_hardening.sql` | Toi | Toutes les lignes `ok = true` |
| [ ] S2-04 | Configurer Auth : inscriptions désactivées, *Site URL*, *Redirect URLs*, 3 modèles d'e-mail | Toi (guide : README §1) | Une invitation de test mène bien à la création du mot de passe |
| [ ] S2-05 | SMTP dédié (Resend, Brevo…) pour des e-mails fiables | Toi | E-mail d'invitation reçu en boîte principale |
| [ ] S2-06 | Choisir l'hébergeur ([08](08-deploiement.md)), variables d'environnement, déploiement du conteneur, sonde `/api/health`, une seule instance toujours allumée | Toi (guides : [Railway](deploiement/railway.md) ou [Coolify](deploiement/coolify.md)) | `/api/health` = `{"ok":true}` ; `/login` répond en https |
| [ ] S2-07 | Limites de dépense mensuelles + alertes chez Anthropic et OpenRouter | Toi | Limites visibles dans les deux consoles |
| [ ] S2-08 | Script de test de concurrence de `start_run` sur la vraie base (`scripts/db-concurrency-check.mjs`) | Assistant livre / Toi exécutes | 12 appels simultanés → exactement N démarrages (N = limite) |
| [ ] S2-09 | Recette de sécurité avec 2 comptes de test (isolation, quota, admin, liste blanche) — checklist [05](05-securite.md#checklist-de-mise-en-ligne) | Toi + Assistant | Toutes les cases cochées |
| [ ] S2-10 | Recette fonctionnelle réelle : import d'un vrai CV, 1 offre par URL, 1 offre collée, lettre, CV adapté | Toi | Rapports cohérents ; corrections notées dans le backlog |
| [ ] S2-11 | Corriger les anomalies de la recette (branches `fix/…`) | Assistant | Aucune anomalie bloquante |
| [ ] S2-12 | Inviter cousine et frère + mini-guide d'utilisation | Toi | Chacun a analysé une offre sans aide |

**Risques** : e-mails Supabase par défaut limités (→ S2-05) ; pages d'offres illisibles par JavaScript (→ coller le texte) ;
coût réel supérieur à l'estimation (→ `/admin` + S2-07).

## Sprint 3 — Scanner d'offres partagé ⏳

**Objectif** : chaque personne voit chaque jour des offres pertinentes, sans payer d'IA pour le tri initial.
Le scanner du moteur interroge des API publiques d'entreprises (sans IA) ; on le lance **une fois pour tous**.

| ID | Tâche | Qui | Critère d'acceptation |
|---|---|---|---|
| [ ] S3-01 | Script SQL `0003` : tables `jobs` (partagée, lecture seule pour les utilisateurs) et `job_matches` (par utilisateur, RLS) + verify + rollback | Assistant livre / Toi exécutes | Tests d'isolation sur Postgres en mémoire |
| [ ] S3-02 | Tâche planifiée de scan (adaptation du scanner du moteur) écrivant dans `jobs` | Assistant | Scan reproductible, dédoublonné, sans IA |
| [ ] S3-03 | Filtrage par profil (postes, pays, salaire) sans IA, puis note rapide au niveau économique à la demande | Assistant | Coût par offre < 1 centime |
| [ ] S3-04 | Page « Offres du jour » + bouton « Analyser en détail » | Assistant | Une offre scannée → analyse complète en un clic |
| [ ] S3-05 | Quotas dédiés au scan et au tri (pas de contournement) | Assistant | Tests de quota |
| [ ] S3-06 | Respect des conditions des sites : API publiques uniquement, pas de LinkedIn | Assistant | Revue documentée dans [05](05-securite.md) |

## Sprint 4 — Suivi avancé et préparation d'entretien ⏳

| ID | Tâche | Critère d'acceptation |
|---|---|---|
| [ ] S4-01 | Script `0004` : historique des changements de statut (`status_log`) + verify + rollback | Chaque changement horodaté |
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
| Sprint 1 | Production « échoue fermé » : mieux vaut ne pas démarrer que démarrer ouvert |
