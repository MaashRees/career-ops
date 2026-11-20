# 08 — Choisir où déployer, et préparer le déploiement

Guides pas à pas : [Railway](deploiement/railway.md) · [Coolify (sur ton propre serveur)](deploiement/coolify.md) ·
[Netlify (déconseillé)](deploiement/netlify.md).

> Les tarifs et limites ci-dessous ont été **lus sur les pages officielles le 20/11/2026**. Ils changent : revérifie la page
> de prix avant de t'abonner. Ce qui n'a pas pu être confirmé est marqué *(non vérifié)*.

## Réponse courte

| Question | Réponse |
|---|---|
| **Railway : abonnement obligatoire ?** | Il existe une offre **Free à 0 $** (1 $ de crédit par mois, sans carte) et un essai de **5 $ une seule fois** (30 jours, sans carte). **Pour cette application je recommande l'offre Hobby (5 $/mois)** : la formule gratuite met les services en veille et plafonne à 0,5 Go de mémoire |
| **Coolify ?** | Logiciel **gratuit** (auto-hébergé) mais **il te faut un serveur** (VPS, quelques euros par mois selon le fournisseur *(non vérifié)*). Plus d'administration, mais le moins cher à long terme et tu gardes la main |
| **Netlify ?** | **Déconseillé** : les fonctions sont limitées à 60 s, or une analyse dure de 30 s à 3 min. Il faudrait modifier le code |

**Mon choix pour démarrer : Railway Hobby (≈ 5 $/mois).** Si tu veux dépenser le moins possible et que l'administration d'un
serveur ne te gêne pas : Coolify sur un petit VPS situé dans l'UE.

## Ce dont l'application a besoin

| Besoin | Pourquoi |
|---|---|
| Un **processus Node toujours allumé**, **une seule instance** | L'analyse tourne en arrière-plan *dans* le processus ; le limiteur de connexions est en mémoire |
| **≥ 512 Mo de mémoire** | Next.js + lecture de PDF |
| Pas de limite de durée de 60 s | Une analyse dure 30 s à 3 min |
| **HTTPS** et une URL stable | Supabase l'exige pour les liens d'e-mail ; cookies `secure` |
| Variables d'environnement **secrètes** | Clés IA, clé `service_role` |
| Sonde de santé `GET /api/health` → `{"ok":true}` | Pour savoir si le service répond |
| Région **Europe** si possible | Données personnelles (RGPD) |

L'image Docker (`platform/Dockerfile`) écoute sur le port **3000** (variable `PORT`) et sur **0.0.0.0**.

## Comparatif chiffré

| | Railway Free | Railway Hobby | Coolify (VPS) | Netlify |
|---|---|---|---|---|
| **Prix** | 0 $ (1 $ de crédit/mois) | 5 $/mois (5 $ d'usage inclus) | 0 $ le logiciel + coût du VPS · *Coolify Cloud : 5 $/mois pour piloter 2 serveurs, serveur à fournir* | non applicable |
| **Toujours allumé** | ❌ veille après 5–10 min sans trafic sortant | ✅ | ✅ | ❌ (fonctions) |
| **Mémoire max par service** | 0,5 Go | 48 Go | celle du VPS | 1 Go (fonctions) |
| **Carte bancaire** | non | oui (post-payée) | selon le VPS | — |
| **Domaine personnalisé** | 0 | 2 | illimité | — |
| **HTTPS automatique** | ✅ (domaine Railway) | ✅ | ✅ (Let's Encrypt) | ✅ |
| **Durée max d'une requête / tâche** | veille + limites | pas de limite documentée sur les pages lues | aucune | **60 s** (synchrone, non configurable) |
| **Effort** | faible | faible | moyen (tu administres un serveur) | élevé (réécriture) |
| **Adapté à l'app** | ❌ | ✅ | ✅ | ❌ |

Détails sourcés :

- **Railway** — Free : « 1 vCPU / 0,5 Go par service, 1 réplique, 3 jours de logs », « 0 domaine personnalisé », services
  « serverless : après 5 à 10 minutes sans trafic sortant ils s'endorment, la requête suivante les réveille ». Essai :
  « 5 $ de crédit unique (30 jours) », sans carte ; **quand le crédit est épuisé, les déploiements sont arrêtés**.
  Hobby : 5 $/mois avec 5 $ d'usage inclus (« minimum d'usage » : tu paies le plus grand des deux), 2 domaines personnalisés.
  Prix à l'usage : mémoire ≈ **10 $/Go/mois**, CPU ≈ **20 $/vCPU/mois**, sortie réseau 0,05 $/Go ; les builds sont gratuits.
- **Coolify** — « Free forever (just pay for your server) » ; Cloud : 5 $/mois de base (2 serveurs), +3 $ par serveur
  supplémentaire. Serveur recommandé : **2 cœurs, 2 Go de RAM, 10 Go de disque** (des machines plus petites « peuvent le faire,
  mais ce n'est pas recommandé »).
- **Netlify** — fonctions synchrones : « 60 secondes, non configurable » ; fonctions d'arrière-plan : 15 minutes, mais charge
  utile limitée à 256 Ko ; `waitUntil` prolonge l'exécution « jusqu'à la limite de temps de la fonction ». Next.js 16 et le
  fichier `proxy.ts` : **non confirmés** dans la documentation lue.

### Coût réel estimé sur Railway Hobby

Usage facturé ≈ mémoire (Go) × 10 $ + CPU (vCPU) × 20 $ par mois. Pour une application de ce type au repos
(≈ 0,3–0,5 Go, CPU très faible) cela donne **environ 3 à 5 $ d'usage**, donc la facture reste au **minimum de 5 $**.
*(Estimation d'après les tarifs unitaires ; la consommation réelle n'a pas été mesurée — surveille l'onglet d'usage de Railway
la première semaine.)*

## Coût mensuel total (ordre de grandeur)

| Poste | Montant |
|---|---|
| Hébergement : Railway Hobby | ≈ 5 $ |
| ou Coolify : VPS | quelques € *(non vérifié)* |
| Supabase | offre gratuite possible ; **vérifie ses limites actuelles** (notamment la mise en pause des projets gratuits inactifs) *(non vérifié ici)* — l'offre payante est la plus sûre si l'app devient régulière |
| Appels IA | selon l'usage : ≈ 0,05 à 0,20 $ par analyse en niveau standard ([README](../README.md#coûts-ordre-de-grandeur)) ; plafonnés par tes quotas |

## Préparation commune (avant n'importe quel hébergeur)

1. **Supabase prêt** : projet UE, scripts `0001` et `0002` exécutés et vérifiés ([06](06-base-de-donnees.md)),
   inscriptions désactivées ([README §1](../README.md)).
2. **Variables d'environnement** à préparer (modèle ; **ne mets jamais de vraies valeurs dans un fichier du dépôt**) :

```dotenv
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=            # secrète
SITE_URL=https://ton-domaine          # https, sans slash final
ANTHROPIC_API_KEY=                    # secrète
OPENROUTER_API_KEY=                   # secrète
ADMIN_EMAILS=toi@exemple.com
ALLOWED_EMAILS=toi@exemple.com,cousine@exemple.com,frere@exemple.com
DAILY_RUN_LIMIT=20
GLOBAL_DAILY_RUN_LIMIT=150
MAX_CONCURRENT_RUNS=2
MAX_TIER=standard
```

3. **Le piège de l'œuf et de la poule** : `SITE_URL` doit être l'URL finale, mais tu ne la connais parfois qu'après le
   premier déploiement. L'application **refuse volontairement de servir les pages** (HTTP 503 avec le nom de la variable
   manquante) tant que `SITE_URL` (https) et `ALLOWED_EMAILS` ne sont pas définies, **mais `/api/health` répond toujours**.
   Ordre qui marche à tous les coups :
   1. déployer (même sans `SITE_URL`) → l'hébergeur voit `/api/health` répondre ;
   2. obtenir l'URL publique ;
   3. renseigner `SITE_URL`, et dans Supabase le *Site URL* + *Redirect URLs* + les 3 modèles d'e-mail ;
   4. redémarrer / redéployer.
4. **Une seule instance.** Ne jamais augmenter le nombre de répliques (le limiteur de connexions et les analyses en cours
   sont liés au processus).

## Tests après déploiement (tous hébergeurs)

```bash
curl -s https://TON-URL/api/health                       # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" https://TON-URL/    # 307 (redirige vers /login)
curl -sI https://TON-URL/login | grep -iE "content-security|strict-transport"   # en-têtes de sécurité présents
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://TON-URL/auth/signout   # 403 (protection CSRF)
```

Puis : inviter un compte de test depuis Supabase, créer son mot de passe, importer un CV, lancer une analyse, et dérouler la
[checklist de mise en ligne](05-securite.md#checklist-de-mise-en-ligne).

## Sources (lues le 20/11/2026)

[Railway — plans](https://docs.railway.com/pricing/plans) ·
[Railway — tarifs](https://railway.com/pricing) ·
[Railway — FAQ tarifs](https://docs.railway.com/pricing/faqs) ·
[Coolify — tarifs](https://coolify.io/pricing) ·
[Coolify — installation](https://coolify.io/docs/get-started/installation) ·
[Netlify — configuration des fonctions](https://docs.netlify.com/build/functions/configuration) ·
[Netlify — Next.js](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview)
