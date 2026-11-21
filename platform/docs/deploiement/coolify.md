# Déployer avec Coolify (sur ton propre serveur)

**Convient** ✅ si tu acceptes d'administrer un petit serveur. Coolify est **gratuit** quand tu l'héberges toi-même
(« free forever, just pay for your server ») : tu ne paies que le **VPS**. *Coolify Cloud* (5 $/mois, 2 serveurs) ne fait
que piloter tes serveurs : il faut quand même en fournir un.

Durée : 1 à 2 heures la première fois. Pré-requis : [préparation commune](../08-deploiement.md#préparation-commune-avant-nimporte-quel-hébergeur),
un nom de domaine (avec accès à sa zone DNS) et un compte GitHub.

> Sources : documentation Coolify lue le 20/11/2026. Les points non confirmés sont marqués *(à vérifier)*.

## Parcours rapide — tu as déjà un VPS avec Coolify

Tu peux **sauter les sections 1 et 2** (serveur et installation). Fais dans l'ordre :

| # | À faire | Où |
|---|---|---|
| 0 | **Instantané (snapshot) du VPS** chez ton fournisseur, avant de toucher à quoi que ce soit | fournisseur |
| 1 | **Contrôle du serveur** : copie [`platform/scripts/coolify-preflight.sh`](../../scripts/coolify-preflight.sh) sur le VPS et lance `sudo sh coolify-preflight.sh jobs.ton-domaine coolify.ton-domaine` (lecture seule : RAM, disque, Docker, ports, SSH, DNS). Corrige les ✗ ; relis les `!` | VPS |
| 2 | Vérifier **Coolify** : version à jour, tableau de bord servi en HTTPS sur son domaine, ports `8000/6001/6002` fermés, compte admin au mot de passe fort, copie de `/data/coolify/source/.env` hors du serveur | [§3](#3-pare-feu-et-domaine-du-tableau-de-bord) |
| 3 | DNS : enregistrement **A** `jobs.ton-domaine` → IP du VPS | registrar |
| 4 | Dépôt **public** : rien à connecter, tu choisiras « Public Repository » (voir §4) | [§4](#4-connecter-github-dépôt-public-ou-privé) |
| 5 | Créer l'application (Base Directory `/platform`, port 3000) | [§5](#5-créer-lapplication) |
| 6 | Variables — **toutes en « Runtime only »** | [§6](#6-variables-denvironnement--point-de-sécurité-important) |
| 7 | Sonde de santé `/api/health` | [§7](#7-sonde-de-santé) |
| 8 | Domaine `https://jobs.ton-domaine` + `SITE_URL` + réglages Supabase | [§8](#8-domaine-de-lapplication-et-site_url) |
| 9 | Déploiement automatique, limites de ressources | [§9](#9-déploiement-automatique), [§10](#10-limiter-les-ressources-conseillé) |
| 10 | **Contrôle de l'application** : `sh platform/scripts/post-deploy-check.sh https://jobs.ton-domaine` — tout doit être ✓ | ton poste |

**À rassembler avant de commencer** (rien de tout cela ne doit être collé dans une conversation ou un fichier du dépôt) :
le nom de domaine de l'application et l'accès à sa zone DNS · l'URL et les clés de ton projet Supabase (scripts `0001` et `0002`
déjà exécutés) · tes clés Anthropic et/ou OpenRouter · la liste des e-mails autorisés · l'accès GitHub au dépôt.

**Particularités d'un serveur qui héberge déjà autre chose** :
- Mémoire : l'application veut ≥ 512 Mo en plus. Le *build* de Next.js est gourmand : sur un petit serveur sans swap il peut
  échouer (« killed » dans les journaux de déploiement) → ajoute du swap ou une machine de 2 Go minimum.
- Mets une **limite de mémoire** (`1g`) à l'application pour qu'elle ne puisse pas affamer les autres ([§10](#10-limiter-les-ressources-conseillé)).
- Un serveur partagé élargit la surface d'attaque : isole bien les domaines et ne réutilise aucun secret entre applications.

## 1. Le serveur (VPS)

| | |
|---|---|
| **Où** | un VPS dans l'**Union européenne** (RGPD) ; prix : quelques euros par mois selon le fournisseur *(non vérifié)* |
| **Taille** | **2 cœurs, 2 Go de RAM, 10 Go de disque** recommandés ; Coolify ne tient pas sur beaucoup moins, et l'application en réclame ≥ 512 Mo en plus |
| **Système** | Ubuntu LTS (Debian/Ubuntu supportés ; Coolify est uniquement pour Linux ; architecture amd64 ou arm64) |
| **Accès** | clé SSH uniquement, mot de passe désactivé |

Après création : mets le système à jour (`apt update && apt upgrade`), crée l'accès par clé SSH, active les mises à jour
de sécurité automatiques, et **prends un instantané (snapshot)** du serveur chez ton fournisseur quand tout fonctionne.

## 2. Installer Coolify

Sur le serveur, en `root` (ou avec `sudo`) :

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

(Tu peux lire le script avant de l'exécuter : `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | less`.)
N'utilise pas les versions « nightly » ou « preview » en production.

**Tout de suite après**, ouvre `http://IP-DU-SERVEUR:8000` et **crée le compte administrateur immédiatement** :
quiconque atteint la page d'inscription en premier devient administrateur **et obtient un accès root à ton serveur**
(Coolify n'accepte le premier compte que pendant les 10 premières minutes).

**Sauvegarde** le fichier `/data/coolify/source/.env` (il contient `APP_KEY`, qui chiffre les secrets de Coolify ;
sans lui, une restauration est impossible). Garde-le dans un gestionnaire de mots de passe, pas dans le dépôt.

## 3. Pare-feu et domaine du tableau de bord

1. Ports à ouvrir au début : `22` (SSH), `80`, `443`, `8000` (tableau de bord), `6001` (temps réel), `6002` (terminal web).
   Restreins `22` à ton adresse IP quand c'est possible. **N'utilise pas UFW seul pour les ports publiés par Docker** :
   Docker les contourne — la documentation Coolify renvoie vers l'outil `ufw-docker`.
2. Crée un enregistrement DNS **A** `coolify.ton-domaine` → IP du serveur.
3. Tableau de bord → **Settings → General → URL** : `https://coolify.ton-domaine` → **Save changes**.
   (Utilise un domaine à part, pas celui de l'application ; pas de chemin dans l'URL.)
4. Une fois le tableau de bord accessible en HTTPS, **ferme `8000`, `6001`, `6002`** dans le pare-feu.

## 4. Connecter GitHub (dépôt public ou privé)

### Ton cas : dépôt **public** → le plus simple

Aucune application GitHub à installer. À l'étape 5, choisis **+ New → Public Repository**, colle l'URL HTTPS du dépôt
(`https://github.com/MaashRees/career-ops`), puis **Check Repository**.

Pour le **déploiement automatique** (facultatif), un dépôt public demande un webhook manuel :

1. Application → page **Webhooks** → copie l'URL sous **Manual Git webhooks**.
2. Saisis un **Webhook secret** (une longue valeur aléatoire, à conserver dans ton gestionnaire de mots de passe) → **Save changes**.
3. GitHub → dépôt → **Settings → Webhooks → Add webhook** : colle l'URL, le **même secret**, événement **push** *(il faut être administrateur du dépôt ;
   le type de contenu attendu n'est pas précisé dans la documentation lue : choisis `application/json`)*.
4. Coolify → application → **Advanced → Deployment → Auto deploy** → **Deploy on push (webhooks)**.

Sans webhook, tu déploies à la main avec le bouton **Deploy / Redeploy** après chaque fusion : plus simple, parfaitement correct.

### Si tu repasses un jour en **privé**

Méthode recommandée : **GitHub App** — *Sources → New source → GitHub App* ; *Webhook endpoint* : **Use an instance endpoint** (URL de base,
sans `/webhooks`) ; **Register with GitHub** ; sur GitHub, nom unique → **Create GitHub App** ; de retour dans Coolify : **Install repositories**
→ **Only select repositories** → ton dépôt. À l'étape 5 : **Private Repository (with GitHub App)**. Les webhooks sont alors configurés
automatiquement. (Alternative : *deploy key* en lecture seule pour un seul dépôt, avec webhook manuel.)

### Dépôt public : ce que ça implique

- **Tout est lisible par tout le monde** : le code, les scripts SQL, la documentation de sécurité (y compris la liste des risques résiduels).
  La sécurité de l'application ne repose pas sur le secret du code, et un test automatique vérifie qu'aucune clé n'est dans le dépôt.
- **Aucun secret dans le dépôt, jamais** : les clés vivent uniquement dans les variables de Coolify. Si une clé est commitée **par erreur**,
  la supprimer du dépôt ne suffit pas (elle reste dans l'historique et peut déjà avoir été copiée) : **la révoquer immédiatement** chez le fournisseur.
- Active la détection de secrets de GitHub (**Settings → Code security** : *Secret scanning* et *Push protection*, intitulés exacts susceptibles de varier).
- N'importe qui peut forker le dépôt et lire le `Dockerfile` : sans conséquence, il ne contient aucune configuration privée.

## 5. Créer l'application

1. **Projects → (ton projet) → environnement → + New → Public Repository** (ou *Private Repository (with GitHub App)* si le dépôt est privé).
2. Colle l'URL du dépôt → **Check Repository** (dépôt privé : choisis le serveur, la source GitHub, le dépôt → **Load Repository**).
3. Renseigne :

| Champ | Valeur |
|---|---|
| **Branch** | `main` (la branche se choisit à la création ; les autres branches ne déploient rien) |
| **Build pack** | `Dockerfile` |
| **Base Directory** | `/platform` |
| **Dockerfile Location** | `/Dockerfile` (relatif au Base Directory) |
| **Ports Exposes** | `3000` |

Le processus doit écouter sur `0.0.0.0` (c'est le cas de l'image).

> ⚠️ **Piège de l'écran « Build configuration » (Coolify 4.7)** : le *Smart Scan* repère un `docker-compose.yml` et **sélectionne
> « Docker Compose » tout seul**. À la racine du dépôt il s'agit du fichier du moteur d'origine, **pas** de l'application.
> Il faut **changer le « Build pack » en `Dockerfile`**, puis mettre **Base directory = `/platform`** et **Dockerfile Location = `/Dockerfile`**
> (clique **Scan Again** : il peut re-proposer Docker Compose, car `platform/` contient aussi un `docker-compose.yml` d'usage local ;
> ignore-le et garde `Dockerfile`).
> Le fichier `.env.example` repéré à la racine est celui du moteur : ignore-le, les variables de l'application sont celles de `platform/.env.example`.
>
> **Branche** : choisis une branche qui **contient** `platform/`. Tant que les branches ne sont pas fusionnées dans `main`, `main` ne
> contient pas l'application : le build échouerait (« Dockerfile introuvable »). Pour un premier essai, prends la dernière branche de
> la pile (voir [03](../03-processus-de-travail.md#branches-empilées-état-actuel)), puis repasse sur `main` après la fusion.

## 6. Variables d'environnement — **point de sécurité important**

Application → **Environment Variables** → colle les variables du modèle (vue « Developer » : texte `.env`).

> ⚠️ Par défaut, une nouvelle variable est « **Available during build** » **et** « **Available in the container** ».
> Les variables de build peuvent se retrouver dans les métadonnées de l'image. **Pour toutes tes variables, choisis
> « Runtime only »** (non disponible pendant le build) : l'image de cette application n'a besoin d'aucune variable pour être
> construite.

Dans Coolify 4.7 les variables sont listées dans un tableau avec les colonnes **Buildtime** et **Runtime**. Une variable fraîchement
ajoutée a les **deux cases cochées** : ouvre l'icône ⚙ (Actions) de chaque variable et **décoche l'option de build**
(« Available during build »), pour ne garder que **Runtime**. Vérifie ensuite dans le tableau : la colonne **Buildtime** doit être vide
pour les 13 variables (au minimum pour `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` et `OPENROUTER_API_KEY`).
Le bandeau **Changes pending** signifie qu'il faut **Redeploy**.

Après un changement de variable « runtime », utilise **Restart** (pas besoin de reconstruire).

## 7. Sonde de santé

Application → **Healthcheck** :

| Champ | Valeur |
|---|---|
| Type | HTTP |
| Method / Scheme | GET / http |
| Host | **`127.0.0.1`** (⚠️ pas `localhost`) |
| Port | `3000` |
| Path | `/api/health` |

**Save changes**, puis **Enable** et confirme.

> ⚠️ **Utilise `127.0.0.1` et non `localhost`.** Dans l'image (Alpine), `localhost` est résolu en IPv6 (`::1`) alors que le serveur
> écoute en IPv4 (`0.0.0.0`) : la sonde échoue avec « `wget: can't connect to remote host: Connection refused` » et Coolify annule le
> déploiement (« New container is unhealthy »), alors que l'application tourne très bien (le journal du conteneur affiche
> « Ready »). La ligne « `curl: not found` » qui précède est sans importance : Coolify essaie `curl`, puis se rabat sur `wget`. (La commande de santé du `Dockerfile` est remplacée tant que celle du tableau de bord est
activée ; l'image contient `wget`, nécessaire à la sonde HTTP.)

## 8. Domaine de l'application et `SITE_URL`

1. DNS : enregistrement **A** `jobs.ton-domaine` → IP du serveur (ports 80 et 443 ouverts).
2. Application → **Domains → Add domain** : *Protocol* `https`, *Domain* `jobs.ton-domaine` → **Add domain**.
   (« Use `https://` for automatic TLS » : le proxy intégré demande et renouvelle le certificat Let's Encrypt.)
3. Variable `SITE_URL=https://jobs.ton-domaine` ; **Redeploy**.
4. Supabase → *Authentication → URL Configuration* : *Site URL* et *Redirect URLs* = `https://jobs.ton-domaine` (+ `/**`),
   puis les 3 modèles d'e-mail ([README §1](../../README.md)).

## 9. Déploiement automatique

- Application → **Advanced → Deployment → Auto deploy** → **Deploy on push (webhooks)** (avec la GitHub App, aucun webhook manuel).
- Chaque fusion dans `main` redéploie ; **Deployment Logs** montre le build, **Runtime Logs** l'exécution.
- **Watch Paths** (Général → Build) peut limiter le redéploiement aux changements de `platform/**`.

## 10. Limiter les ressources (conseillé)

Application → **Resource Limits** : *Memory limit* `1g`, *CPU limit* `1` → **Save changes**, puis redémarre.
Protège les autres applications du serveur d'une dérive de mémoire.

## 11. Mises à jour, sauvegardes, retour arrière

| Sujet | Procédure |
|---|---|
| **Application** | fusion dans `main` → redéploiement automatique |
| **Retour arrière** | page **Rollback** de l'application → **Reload images** → **Roll back to this image**. Ne défait **pas** un script SQL ([06](../06-base-de-donnees.md)). Règle le nombre d'images conservées (*Image retention → Images to keep*) |
| **Coolify lui-même** | mises à jour depuis le tableau de bord ; sauvegarde préalable de `/data/coolify/source/.env` |
| **Serveur** | mises à jour de sécurité ; instantané chez le fournisseur avant une grosse opération |
| **Aucune donnée à sauvegarder côté application** | elle est sans état (les données sont dans Supabase) |

## 12. Vérifier

`sh platform/scripts/post-deploy-check.sh https://jobs.ton-domaine` (voir les
[tests après déploiement](../08-deploiement.md#tests-après-déploiement-tous-hébergeurs)), puis la
[checklist de mise en ligne](../05-securite.md#checklist-de-mise-en-ligne).

## Sécurité propre à cette option (tu es responsable du serveur)

- SSH : clés uniquement, `22` restreint à ton IP, pas de connexion root par mot de passe.
- Seuls `22`, `80`, `443` ouverts à la fin ; tableau de bord uniquement via son domaine HTTPS.
- Compte administrateur Coolify : mot de passe fort et unique, authentification renforcée (passkeys possibles sur domaine HTTPS).
- Mises à jour du système et de Coolify régulières ; instantané du serveur avant chaque opération lourde.
- Un serveur partagé avec d'autres applications élargit la surface d'attaque : un VPS dédié est préférable.

## Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| Certificat HTTPS non émis | DNS ne pointe pas encore sur le serveur, ports 80/443 fermés | Vérifier le DNS et le pare-feu, redéployer |
| 502 / « no available server » | Port exposé incorrect ou application qui ne démarre pas | `Ports Exposes` = 3000 ; lire *Runtime Logs* |
| Build échoue, Dockerfile introuvable | *Base Directory* / *Dockerfile Location* | `/platform` et `/Dockerfile` |
| Sonde de santé en échec (`wget: can't connect … Connection refused`) | Host `localhost` (résolu en IPv6) | Host **`127.0.0.1`**, path `/api/health`, port 3000 |
| 503 « Configuration incomplète » | Variable manquante | Ajouter (en *Runtime only*), *Restart* |
| Disque plein | Anciennes images Docker | Réduire *Images to keep*, nettoyer depuis le serveur |
