# Déployer avec Coolify (sur ton propre serveur)

**Convient** ✅ si tu acceptes d'administrer un petit serveur. Coolify est **gratuit** quand tu l'héberges toi-même
(« free forever, just pay for your server ») : tu ne paies que le **VPS**. *Coolify Cloud* (5 $/mois, 2 serveurs) ne fait
que piloter tes serveurs : il faut quand même en fournir un.

Durée : 1 à 2 heures la première fois. Pré-requis : [préparation commune](../08-deploiement.md#préparation-commune-avant-nimporte-quel-hébergeur),
un nom de domaine (avec accès à sa zone DNS) et un compte GitHub.

> Sources : documentation Coolify lue le 20/11/2026. Les points non confirmés sont marqués *(à vérifier)*.

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

## 4. Connecter GitHub (dépôt privé)

Méthode recommandée : **GitHub App**.

1. **Sources → New source → GitHub App** → nomme-la ; **Continue**.
2. *Webhook endpoint* : **Use an instance endpoint** (URL de base, sans `/webhooks`) ; **Register with GitHub**.
3. Sur GitHub : nom unique → **Create GitHub App**. De retour dans Coolify : **Install repositories** → **Only select repositories**
   → ton dépôt → **Install**.

(Alternative : une *deploy key* en lecture seule pour un seul dépôt ; dans ce cas il faut configurer le webhook à la main.)

## 5. Créer l'application

1. **Projects → (ton projet) → environnement → + New → Private Repository (with GitHub App)**.
2. Choisis le serveur, la source GitHub, le dépôt → **Load Repository**.
3. Renseigne :

| Champ | Valeur |
|---|---|
| **Branch** | `main` (la branche se choisit à la création ; les autres branches ne déploient rien) |
| **Build pack** | `Dockerfile` |
| **Base Directory** | `/platform` |
| **Dockerfile Location** | `/Dockerfile` (relatif au Base Directory) |
| **Ports Exposes** | `3000` |

Le processus doit écouter sur `0.0.0.0` (c'est le cas de l'image).

## 6. Variables d'environnement — **point de sécurité important**

Application → **Environment Variables** → colle les variables du modèle (vue « Developer » : texte `.env`).

> ⚠️ Par défaut, une nouvelle variable est « **Available during build** » **et** « **Available in the container** ».
> Les variables de build peuvent se retrouver dans les métadonnées de l'image. **Pour toutes tes variables, choisis
> « Runtime only »** (non disponible pendant le build) : l'image de cette application n'a besoin d'aucune variable pour être
> construite.

Après un changement de variable « runtime », utilise **Restart** (pas besoin de reconstruire).

## 7. Sonde de santé

Application → **Healthcheck** :

| Champ | Valeur |
|---|---|
| Type | HTTP |
| Method / Scheme | GET / http |
| Host | `localhost` |
| Port | `3000` |
| Path | `/api/health` |

**Save changes**, puis **Enable** et confirme. (La commande de santé du `Dockerfile` est remplacée tant que celle du tableau de bord est
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

[Tests après déploiement](../08-deploiement.md#tests-après-déploiement-tous-hébergeurs), puis la
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
| Sonde de santé en échec | `wget` ou chemin incorrect | Path `/api/health`, port 3000 |
| 503 « Configuration incomplète » | Variable manquante | Ajouter (en *Runtime only*), *Restart* |
| Disque plein | Anciennes images Docker | Réduire *Images to keep*, nettoyer depuis le serveur |
