# Chasseur d'emploi — plateforme multi-comptes

Application web privée (famille, amis) construite sur le moteur [career-ops](../README.md) :
chaque personne a **son compte**, **son CV**, **son profil** et **ses candidatures**, et utilise
**tes clés Anthropic / OpenRouter** (variables d'environnement côté serveur — jamais visibles des utilisateurs).

> Nom du produit : « career-ops » est une marque réservée (voir [`../TRADEMARK.md`](../TRADEMARK.md)).
> Pour un usage privé ça ne pose aucun problème ; si tu rends le service public, n'utilise pas
> « career-ops » dans son nom. Le code est MIT.

## Ce que ça fait

| | |
|---|---|
| **Comptes** | Accès sur invitation (Supabase Auth) : mot de passe ou lien magique. Pas d'inscription libre. |
| **Profil & CV** | CV en PDF / texte → converti en markdown par l'IA, **validé par l'utilisateur**. Postes visés, salaire, règles bloquantes. |
| **Analyse d'offre** | URL ou texte collé → rapport noté /5 (rôle, adéquation CV, légitimité de l'annonce, risques…) avec les vrais prompts du moteur. Niveau « essentiel » (~1 min) ou « complet » (~3 min). |
| **Candidatures** | Tableau de suivi, statuts canoniques du moteur, notes, dédoublonnage par URL. |
| **Documents** | Lettre de motivation et CV adapté (avec détecteur de chiffres absents du CV d'origine), impression PDF depuis le navigateur. |
| **Garde-fous de coût** | Quota par personne et par 24 h, plafond global, niveau de modèle plafonné, page `/admin` (usage et coût estimé par personne). |
| **Fiabilité IA** | Si Anthropic est saturé / à court de crédit, bascule automatique sur OpenRouter (et inversement). |

Règles héritées du moteur : **jamais d'envoi automatique** d'une candidature, déconseille de postuler sous 4,0/5,
n'invente rien (le CV est la seule source de vérité), LinkedIn n'est pas aspiré (on demande de coller le texte).

## Architecture

```
Navigateur ─► Next.js (Docker, toujours allumé) ──► Supabase (Europe)
                 │  pages + Server Actions            ├─ Auth (invitations)
                 │                                    ├─ Postgres + RLS (1 utilisateur = ses lignes)
                 └─ analyse IA en arrière-plan        └─ (aucun fichier stocké)
                       │
                       ├─► Anthropic  (clé serveur)
                       └─► OpenRouter (clé serveur, secours)
```

- L'analyse démarre **après** la réponse HTTP : l'utilisateur voit une page de suivi qui interroge l'état toutes les 2 s.
- Le moteur (prompts `modes/*.md`) est copié dans `engine/` ; `npm run sync-engine` le met à jour depuis `../modes`.
- Les écritures « serveur » (rapports, documents, résultats d'analyse) passent par la clé *service role* ; tout le reste
  passe par la session de l'utilisateur et la RLS.

## Mise en route (≈ 30 min)

### 1. Supabase

1. Crée un projet sur [supabase.com](https://supabase.com), **région Europe** (RGPD).
2. **SQL Editor** → colle le contenu de [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → *Run*
   (rejouable sans risque).
3. **Authentication → Sign In / Providers → Email** : désactive **« Allow new users to sign up »**
   (l'accès se fait uniquement sur invitation).
4. **Authentication → URL Configuration** : *Site URL* = l'URL publique de ton app
   (`https://jobs.exemple.com`) ; ajoute `https://jobs.exemple.com/**` aux *Redirect URLs*.
5. **Authentication → Email Templates** : remplace le lien de ces trois modèles pour qu'il passe par l'app
   (sinon les liens ne fonctionnent pas d'un appareil à l'autre) :

   **Invite user**
   ```html
   <h2>Tu es invité·e</h2>
   <p>Clique pour créer ton mot de passe et accéder à l'application :</p>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Créer mon compte</a></p>
   ```
   **Magic Link**
   ```html
   <h2>Ton lien de connexion</h2>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Me connecter</a></p>
   ```
   **Reset Password**
   ```html
   <h2>Nouveau mot de passe</h2>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Choisir un nouveau mot de passe</a></p>
   ```
6. **Project Settings → API** : note l'URL, la clé *publishable* (ou *anon*) et la clé secrète *service_role*.

> Les e-mails par défaut de Supabase sont limités en nombre et partent parfois en spam : pour trois ou quatre
> personnes c'est suffisant ; au-delà, configure un SMTP (Resend, Brevo…) dans *Authentication → SMTP*.

### 2. Configuration

Copie [`.env.example`](.env.example) en `.env` (ou saisis ces variables chez ton hébergeur) :

| Variable | Rôle |
|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Connexion à Supabase (clé publique, soumise à la RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secrète.** Écritures serveur. Jamais côté navigateur. |
| `SITE_URL` | URL publique en https, identique au *Site URL* Supabase |
| `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` | Au moins une des deux. Les deux = bascule automatique en cas de panne. |
| `LLM_PROVIDER` | `anthropic` (défaut) ou `openrouter` : fournisseur principal |
| `ADMIN_EMAILS` | Accès à `/admin` ; pas de limite individuelle |
| `ALLOWED_EMAILS` | Liste blanche en plus des invitations (recommandé) |
| `DAILY_RUN_LIMIT`, `GLOBAL_DAILY_RUN_LIMIT`, `MAX_CONCURRENT_RUNS` | Quotas (défauts : 20 / 150 / 2) |
| `MAX_TIER` | `economy`, `standard` (défaut) ou `premium` : niveau maximum choisissable |

### 3. Déployer

L'app est un conteneur Docker (`Dockerfile`, contexte = ce dossier). Il faut un hébergeur qui garde **une instance
toujours allumée** : l'analyse tourne en arrière-plan dans le processus, ne coupe pas la machine à l'inactivité.

- **Fly.io** : `fly launch` (détecte le Dockerfile), puis `fly secrets set SUPABASE_URL=… ANTHROPIC_API_KEY=…`
  (toutes les variables du tableau). Dans `fly.toml` : `auto_stop_machines = false`, `min_machines_running = 1`,
  mémoire 512 Mo minimum, sonde de santé sur `/api/health`.
- **Railway / Render** : nouveau service depuis le dépôt Git, *root directory* = `platform`, type Docker,
  variables dans l'interface, sonde `/api/health`, port 3000.
- **VPS** : `docker compose up -d --build` puis un reverse proxy HTTPS devant (Caddy, Traefik, Cloudflare Tunnel).
- **Vercel** : possible (`maxDuration = 300 s` est déjà déclaré) mais une analyse « complète » peut dépasser le délai
  d'un plan gratuit. Docker reste la voie recommandée.

Une fois en ligne : `https://ton-domaine/api/health` doit répondre `{"ok":true}`.

### 4. Inviter ta cousine, ton frère… et toi

**Supabase → Authentication → Users → Invite user** : saisis l'e-mail. La personne reçoit le mail, clique, **choisit son
mot de passe**, et arrive sur le tableau de bord. Ajoute aussi l'adresse à `ALLOWED_EMAILS`.
Pour retirer quelqu'un : supprime-le dans Supabase — **toutes ses données disparaissent en cascade**.

### 5. Premier usage (à expliquer aux invités)

1. **Profil & CV** : importer son CV (PDF) → relire la version convertie → *Utiliser ce CV*.
2. Remplir ses préférences (postes visés, salaire, règles bloquantes).
3. **Tableau de bord** : coller le lien d'une offre (ou son texte) → *Analyser*.
4. Si note ≥ 4,0 : rédiger la lettre / adapter le CV, **relire**, envoyer soi-même.

## Coûts (ordre de grandeur)

Tarifs publics affichés par OpenRouter (en direct chez Anthropic ils sont en principe identiques : vérifie sur ta console), par million de tokens :

| Niveau | Modèle | Entrée | Sortie | Lecture cache |
|---|---|---|---|---|
| Économique | Haiku 5.5 | 0,10 $ | 0,50 $ | 0,01 $ |
| Standard | Sonnet 5.5 | 2 $ | 10 $ | 0,10 $ |
| Premium | Opus 5.5 | 4 $ | 20 $ | 0,20 $ |

Le prompt du moteur + CV + profil pèse ≈ 30 000 tokens, **mis en cache** (valable ~5 min : des analyses enchaînées
coûtent moins). Estimation par analyse en Standard : **≈ 0,05 à 0,10 $ (essentiel)**, **≈ 0,10 à 0,20 $ (complet)** ;
en Économique, moins d'un centime. La page `/admin` affiche l'usage réel et un coût estimé par personne ; seule la facture
du fournisseur fait foi. Pense à fixer une **limite de dépense mensuelle** dans la console Anthropic / OpenRouter.

## Sécurité et confidentialité

- **Isolation** : RLS Postgres sur toutes les tables, testée sur un vrai Postgres (`tests/rls.test.ts`) : chacun ne voit,
  ne modifie et ne supprime que ses lignes ; personne ne peut fabriquer un rapport ou contourner un quota.
- **Clés** : uniquement dans les variables d'environnement du serveur ; jamais renvoyées au navigateur ni écrites dans
  l'image Docker ; les messages d'erreur ne les recopient pas.
- **Accès** : invitations + liste blanche optionnelle ; la connexion par lien n'envoie jamais de mail à une adresse inconnue
  et répond de la même façon dans tous les cas.
- **URL d'offres** (saisies par les utilisateurs) : protection SSRF (réseau interne, métadonnées cloud, DNS rebinding vérifié à
  la connexion, redirections contrôlées, taille et délai bornés). L'offre est traitée comme une **donnée**, jamais comme
  une instruction.
- **Rendu** : le markdown produit par l'IA est rendu sans HTML brut (pas d'injection de balises).
- **Données personnelles** : le CV et le profil sont envoyés à Anthropic / OpenRouter à chaque analyse (dis-le aux
  invités). Le fichier PDF importé n'est **pas conservé** : seul le texte converti l'est, dans la base Supabase (UE).
  Pour un usage au-delà du cercle familial : mentions légales, politique de confidentialité, procédure d'export/suppression.

## Mettre à jour le moteur

```bash
cd platform && npm run sync-engine   # recopie ../modes/{_shared,oferta,_writing}.md dans engine/
git add engine && git commit -m "chore(platform): sync engine"
```

## Développement local

```bash
cd platform
cp .env.example .env      # remplir avec un projet Supabase de test
npm ci
npm run dev               # http://localhost:3000
npm run typecheck
npm test                  # 72 tests : parsing, SSRF, prompts, IA mockée, flux complet, quotas, RLS
```

## Limites connues / pistes

- Pas (encore) de **scanner de portails** (le scan du moteur, sans IA, peut être ajouté comme tâche planifiée partagée entre
  utilisateurs) ni de suivi des relances / préparation d'entretien.
- PDF = impression du navigateur (pas de rendu serveur) : pas de Chromium à héberger.
- Une analyse interrompue par un redémarrage du serveur est marquée « échouée » au bout de 12 min : relancer.
- Les pages d'offres chargées uniquement par JavaScript ou protégées ne sont pas lisibles : l'utilisateur colle le texte.
- Pas de paiement ni de crédits par utilisateur : l'usage est plafonné, pas facturé.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| Le lien de l'e-mail mène à « lien invalide » | Modèles d'e-mail non modifiés (étape 1.5) ou *Site URL* différent de `SITE_URL` |
| Boucle de redirection vers `/login` | `SITE_URL` en http alors que le site est en https, ou cookies bloqués |
| « Aucune clé IA configurée » | `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` absentes ou vides côté hébergeur |
| « Le service d'IA a échoué : HTTP 401 » | Clé invalide ; vérifier aussi qu'il n'y a pas d'espace ou de guillemets dans la valeur |
| Analyse bloquée « en cours » | Instance arrêtée par l'hébergeur : désactiver l'arrêt automatique |
| Page `/admin` inaccessible | Ton e-mail n'est pas dans `ADMIN_EMAILS` |
