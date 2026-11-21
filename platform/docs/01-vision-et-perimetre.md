# 01 — Vision et périmètre

## Objectif

Offrir à quelques proches (cousine, frère, propriétaire) un outil simple pour **chercher mieux, pas plus** :
analyser honnêtement les offres par rapport à leur vrai CV, préparer des candidatures sur mesure, suivre l'avancement.
Chacun a son espace privé ; une seule personne (le propriétaire) paie les appels IA et garde la main sur les coûts.

## Utilisateurs

| Rôle | Ce qu'il fait |
|---|---|
| **Invité** | Importe son CV, renseigne ses préférences, analyse des offres, prépare lettre/CV, suit ses candidatures |
| **Administrateur** (propriétaire) | Invite et retire des personnes, voit l'usage et le coût estimé, règle quotas et modèles, déploie, exécute les scripts SQL |

## Dans le périmètre (Sprint 0–1, livré)

Comptes sur invitation · CV (PDF/texte → markdown validé) · profil de recherche · analyse d'offre notée /5 (URL ou texte) ·
suivi des candidatures · lettre de motivation · CV adapté avec détecteur de chiffres inventés · quotas et page d'administration ·
bascule automatique entre deux fournisseurs IA.

## Hors périmètre (volontairement)

- **Envoyer une candidature à la place de l'utilisateur** — jamais. L'humain relit et envoie.
- **Lire LinkedIn automatiquement** — on demande de coller le texte (règle héritée du moteur).
- **Service public / commercial** — pas d'inscription libre, pas de paiement. Si ça change : nom de produit différent
  (marque du moteur réservée), mentions légales, conformité RGPD complète, vraie facturation.
- **Garantir un entretien ou une embauche** — la note est une recommandation, pas une probabilité.

## Principes non négociables

1. **Le CV est la seule source de vérité** : l'IA reformule, n'invente jamais (employeurs, dates, chiffres, outils).
2. **L'humain décide** : note < 4,0/5 → on déconseille, l'utilisateur peut passer outre en connaissance de cause.
3. **Vie privée par défaut** : chacun ne voit que ses données ; le CV n'est envoyé qu'au fournisseur IA configuré ;
   le fichier importé n'est pas conservé.
4. **Les coûts sont plafonnés** : quotas par personne et globaux, niveau de modèle plafonné, estimation visible.
5. **Rien ne touche la base sans script relu** : changements de base = scripts versionnés exécutés par le propriétaire.

## Contraintes

| Contrainte | Conséquence |
|---|---|
| Budget personnel | Modèle « standard » par défaut, quotas, mise en cache des prompts, repli sur le fournisseur le moins cher disponible |
| Données personnelles (CV) — RGPD | Hébergement UE, suppression en cascade, liste des sous-traitants (fournisseurs IA, Supabase, hébergeur) |
| Marque du moteur réservée | Nom « Chasseur d'emploi », jamais « career-ops » dans le nom du service |
| Un seul développeur / décideur | Processus léger mais strict (branches, scripts, plan de sprints) |

## Critères de réussite

- Un invité passe de « invitation reçue » à « première analyse lue » en moins de 10 minutes, sans aide.
- Aucune donnée d'un utilisateur n'est jamais visible d'un autre (vérifié par tests d'isolation et par une recette manuelle).
- Coût mensuel prévisible et inférieur au plafond fixé par le propriétaire (suivi via `/admin`).
- Aucun secret dans le dépôt, aucun incident de sécurité.
