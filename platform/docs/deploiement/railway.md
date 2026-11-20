# Déployer sur Railway

**Convient** ✅ avec l'offre **Hobby (5 $/mois)**. L'offre Free (0 $) n'est pas adaptée : services mis en veille, 0,5 Go de
mémoire, 1 $ de crédit, aucun domaine personnalisé — voir le [comparatif](../08-deploiement.md).
L'**essai** (5 $ une fois, 30 jours, sans carte) permet de tester gratuitement ; à l'épuisement du crédit, les déploiements
s'arrêtent.

Durée : ≈ 30 minutes. Pré-requis : [préparation commune](../08-deploiement.md#préparation-commune-avant-nimporte-quel-hébergeur)
(Supabase prêt, variables préparées).

> Sources : documentation Railway lue le 20/11/2026. Les intitulés exacts de l'interface peuvent légèrement varier ;
> les éléments non confirmés dans la documentation sont marqués *(à vérifier dans l'interface)*.

## 1. Compte et plan

1. Crée un compte sur [railway.com](https://railway.com) (connexion avec GitHub).
2. Commence par l'**essai**. Quand tout fonctionne, passe en **Hobby** (carte bancaire requise ; Railway n'accepte que des
   cartes de crédit post-payées). Le crédit d'essai restant est reporté sur Hobby.

## 2. Créer le projet depuis GitHub

1. **New Project → Deploy from GitHub repo**, puis autorise l'application GitHub de Railway sur ton dépôt (le fork de ce projet).
   Il faut qu'au moins un membre du projet ait un compte GitHub connecté avec accès en contribution.
2. Ouvre le service créé → **Settings**.
3. **Root Directory** : `/platform` (Railway ne récupère alors que ce dossier ; le reste du dépôt n'est pas utilisé).
4. **Branche à déployer** (réglage du déclencheur) : `main` une fois les branches fusionnées — ainsi **chaque fusion que tu
   fais redéploie l'application**. Pour un premier essai, tu peux choisir la branche de travail.
5. Railway détecte le fichier nommé exactement `Dockerfile` à la racine du dossier : dans les journaux de build tu dois lire
   **« Using detected Dockerfile! »**. Les builds sont gratuits (non facturés).

## 3. Variables d'environnement

1. Service → onglet **Variables** → **RAW Editor** → colle le modèle de la [préparation commune](../08-deploiement.md#préparation-commune-avant-nimporte-quel-hébergeur)
   avec tes vraies valeurs (saisies **uniquement ici**, jamais dans le dépôt).
2. **Ne définis pas `PORT`** : Railway l'injecte ; l'image écoute dessus (sinon 3000).
3. **Scelle les secrets** : menu « ⋯ » de la variable → **Seal** pour `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
   `OPENROUTER_API_KEY`. Une variable scellée n'est plus jamais affichée (ni dans l'interface ni par l'API) et ne peut plus être
   éditée : pour la changer, tu la recrées. C'est le comportement voulu pour des clés.
4. Les changements de variables sont **mis en attente** : clique sur le bouton de déploiement pour les appliquer.
5. Si l'application est injoignable (502) alors que le déploiement est vert, ajoute la variable `HOSTNAME=0.0.0.0`
   (le serveur doit écouter sur toutes les interfaces ; la documentation Railway lue ne précise pas ce point).

## 4. Sonde de santé

Settings → section de déploiement → **Healthcheck path** = `/api/health` *(intitulé à vérifier dans l'interface)*.
Railway attend une réponse `2xx` avant de basculer le trafic ; délai par défaut 300 s. La sonde n'est jouée qu'au début
d'un déploiement. Un déploiement échoué = l'ancienne version reste en ligne.

## 5. Domaine public et `SITE_URL`

1. Settings → **Networking → Public Networking → Generate Domain**. Railway détecte le port 3000 comme port cible.
   Le domaine `*.up.railway.app` est en HTTPS (« Automatic SSL »).
2. Note l'URL (ex. `https://ton-service.up.railway.app`).
3. Onglet **Variables** : `SITE_URL=https://ton-service.up.railway.app` (sans slash final) → déploie.
4. **Dans Supabase** → *Authentication → URL Configuration* : *Site URL* = cette URL ; *Redirect URLs* : `https://ton-service.up.railway.app/**` ;
   puis les 3 modèles d'e-mail ([README §1](../../README.md)).

### Domaine personnalisé (facultatif)

Settings → Public Networking → **+ Custom Domain** → saisis le domaine. Il faut **deux** enregistrements DNS chez ton
registrar : un `CNAME` (valeur affichée par Railway) **et** un `TXT` de vérification (sans le `TXT`, les requêtes renvoient 404).
Certificat Let's Encrypt automatique (≈ 1 h après le DNS). Domaine « racine » (sans sous-domaine) : CNAME flattening ou ALIAS
selon ton fournisseur DNS. Si tu passes par Cloudflare : mode SSL **Full** (pas « Full (Strict) »).
Hobby : 2 domaines personnalisés. Pense à mettre à jour `SITE_URL` et Supabase avec le nouveau domaine.

## 6. Réglages à ne pas oublier

| Réglage | Valeur |
|---|---|
| Nombre de répliques | **1** (ne jamais augmenter) |
| Mise en veille (« serverless » / App Sleeping) | **désactivée** : l'application doit rester allumée *(emplacement du réglage à vérifier dans l'interface)* |
| Région | choisir une région **Europe** si l'interface la propose *(non vérifié)* |
| Déploiement automatique | sur push de la branche choisie ; option **Wait for CI** utilisable si tu ajoutes un workflow GitHub qui lance les tests |

## 7. Vérifier

Exécute les [tests après déploiement](../08-deploiement.md#tests-après-déploiement-tous-hébergeurs), puis la
[checklist de mise en ligne](../05-securite.md#checklist-de-mise-en-ligne).

## 8. Surveiller les coûts

- Facture ≈ mémoire × 10 $/Go/mois + CPU × 20 $/vCPU/mois + réseau 0,05 $/Go, avec un **minimum de 5 $** (Hobby).
- Regarde l'usage de ton service la première semaine ; l'estimation attendue est de 3 à 5 $ d'usage.
- Les coûts IA ne passent **pas** par Railway : ils se règlent chez Anthropic / OpenRouter (limites de dépense à régler là-bas).

## 9. Mettre à jour et revenir en arrière

- **Mise à jour** : tu fusionnes dans la branche déployée → Railway reconstruit et redéploie.
- **Retour arrière** : la méthode la plus sûre et indépendante de l'interface est d'annuler la fusion dans Git
  (nouvelle branche `fix/…` contenant l'annulation, que tu fusionnes). Tu peux aussi relancer un déploiement précédent depuis
  l'historique des déploiements du service *(à vérifier dans l'interface)*.
- **Base de données** : un retour arrière du code ne défait pas un script SQL — voir [06](../06-base-de-donnees.md).

## Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| Build échoue, « Dockerfile does not exist » | *Root Directory* incorrect | Mettre `/platform` |
| Déploiement vert mais 502 | Écoute sur la mauvaise interface ou le mauvais port | Variable `HOSTNAME=0.0.0.0` ; vérifier le port cible du domaine (3000 / `PORT`) |
| Page « Configuration incomplète » (503) | `SITE_URL` ou `ALLOWED_EMAILS` manquantes | Les ajouter, déployer |
| Health check en échec | Application qui ne démarre pas | Lire les journaux de déploiement ; `/api/health` doit répondre sans configuration |
| Boucle vers `/login` | `SITE_URL` ≠ URL réelle | Corriger `SITE_URL` et le *Site URL* Supabase |
| Service arrêté « crédit épuisé » | Fin de l'essai / de l'offre Free | Passer à Hobby |
| 404 sur le domaine personnalisé | Enregistrement `TXT` manquant | Ajouter le `TXT` de vérification |
