import { APPLY_MIN, STATUSES, STATUS_LABELS } from "./states.ts";

/**
 * Contenu de la page d'aide (FAQ). Les réponses sont en markdown. Les limites (analyses par jour, niveau maximum)
 * sont injectées depuis la configuration réelle du serveur : la FAQ ne ment jamais si l'administrateur les change.
 * Pas de tiret long ni de demi-cadratin ici (un test le vérifie).
 */
export interface FaqItem {
  q: string;
  a: string;
}
export interface FaqSection {
  id: string;
  title: string;
  items: FaqItem[];
}
export interface FaqParams {
  /** Analyses par 24 h glissantes et par personne (0 = sans limite). */
  dailyLimit: number;
  /** Analyses simultanées par personne. */
  maxConcurrent: number;
  /** Niveau de modèle maximum autorisé par l'administrateur. */
  maxTier: "economy" | "standard" | "premium";
}

const TIER_LABEL = { economy: "économique", standard: "standard", premium: "premium" } as const;

const STATUS_MEANING: Record<string, string> = {
  Evaluated: "l'offre est analysée, tu n'as pas encore décidé",
  Applied: "tu as envoyé ta candidature",
  Responded: "l'entreprise t'a répondu",
  Assessment: "test technique ou présélection en cours",
  Interview: "tu es en processus d'entretien",
  Offer: "tu as reçu une proposition",
  Hired: "tu as accepté, bravo",
  Rejected: "l'entreprise a refusé",
  Discarded: "tu as renoncé, ou l'offre est fermée",
  SKIP: "ne correspond pas, tu ne postules pas",
};

export function faqSections(p: FaqParams): FaqSection[] {
  const limit = p.dailyLimit > 0 ? `**${p.dailyLimit}** par période glissante de 24 h` : "**sans limite journalière**";
  const apply = APPLY_MIN.toFixed(1).replace(".", ","); // « 4,0 » (et non « 4 »)
  const statuses = STATUSES.map((s) => `- **${STATUS_LABELS[s]}** : ${STATUS_MEANING[s]}`).join("\n");

  return [
    {
      id: "demarrer",
      title: "Pour commencer",
      items: [
        {
          q: "À quoi sert cette application ?",
          a: "Elle t'aide à chercher mieux, pas plus. Elle compare une offre d'emploi à **ton vrai CV**, te donne une note sur 5 avec tes points forts et ce qui te manque, puis te prépare une lettre de motivation et un CV adapté. Tu y suis aussi l'avancement de tes candidatures.\n\n**Elle n'envoie jamais rien à ta place** : tu relis, et c'est toi qui postules.",
        },
        {
          q: "Par où commencer ?",
          a: "1. Va dans **Profil & CV** et importe ton CV (ou colle-le), puis valide-le.\n2. Remplis tes préférences : postes visés, ville, salaire, règles bloquantes.\n3. Sur le **Tableau de bord**, colle le lien ou le texte d'une offre et clique sur **Analyser cette offre**.\n4. Lis le rapport. Si la note est d'au moins " + apply + ", prépare une lettre et un CV adapté depuis la page de la candidature.",
        },
        {
          q: "Comment fonctionne l'import de mon CV ?",
          a: "Tu peux importer un **PDF, un fichier .md ou .txt** (5 Mo maximum, 15 pages maximum pour un PDF). Le texte est extrait, converti en markdown, puis **vérifié automatiquement** contre le texte de ton fichier : mots coupés, colonnes mélangées, puces cassées et dates détachées sont réparés.\n\nTu vois ensuite un encadré **« Ce qui a été contrôlé et corrigé »** avec trois parties : *Corrections*, *À vérifier* et *Contrôle automatique des nombres*. **Rien n'est enregistré tant que tu n'as pas cliqué sur « Utiliser ce CV »**. Le fichier PDF lui-même n'est pas conservé.",
        },
        {
          q: "Mon PDF est refusé ou illisible, que faire ?",
          a: "Les causes habituelles : PDF **scanné en image** (il n'y a pas de texte à lire), PDF protégé, plus de 15 pages ou plus de 5 Mo. Dans tous les cas, tu peux **coller le texte de ton CV** directement dans la zone « Mon CV » de la page Profil & CV.",
        },
        {
          q: "Pourquoi mon CV est-il écrit en « markdown » ?",
          a: "Le markdown est du texte simple (`#` pour un titre, `-` pour une puce). C'est la **seule source de vérité** de l'application : tout ce qu'elle écrit pour toi (lettre, CV adapté) vient de ce texte, rien n'est inventé. Tu peux le modifier quand tu veux.\n\nLes fautes de ton propre CV (orthographe d'une technologie, accent manquant) ne sont **pas corrigées en silence** : elles sont signalées dans les notes de contrôle pour que tu décides.",
        },
      ],
    },
    {
      id: "analyser",
      title: "Analyser une offre",
      items: [
        {
          q: "Je colle un lien ou le texte de l'annonce ?",
          a: "Les deux marchent, mais **le texte est plus fiable**. Les pages carrière des entreprises sont souvent lisibles ; les offres Greenhouse et Lever sont lues directement.\n\nCertains sites ne peuvent pas être lus automatiquement : **LinkedIn**, les grands sites d'emploi qui refusent les robots (erreur 403) et les pages chargées par JavaScript. Dans ce cas, ouvre l'offre, copie l'annonce complète et colle-la dans « …ou le texte de l'annonce ».",
        },
        {
          q: "Quelle différence entre « Essentiel » et « Complet » ?",
          a: "**Essentiel** (environ 1 minute) : résumé du rôle, correspondance avec ton CV, légitimité de l'annonce, risques et verdict.\n\n**Complet** (environ 3 minutes) : en plus, niveau et stratégie, rémunération, plan de personnalisation de ta candidature, préparation d'entretien et mots-clés.\n\nUne candidature analysée en essentiel peut être relancée en complet depuis sa page, sans recoller l'offre.",
        },
        {
          q: "Comment lire la note ?",
          a: `- **4,5 à 5** : très bon match, regarde-la en priorité.\n- **${apply} à 4,4** : à considérer, regarde ce qui te manque.\n- **Moins de ${apply}** : l'application déconseille de postuler, sauf si tu as une bonne raison.\n\nLa note est une **recommandation**, pas une probabilité d'être embauché. Tu peux passer outre.`,
        },
        {
          q: "Que signifient « High Confidence », « Proceed with Caution » et « Suspicious » ?",
          a: "C'est la **légitimité de l'annonce**, estimée à partir de son texte.\n\n- **High Confidence** : rien de suspect.\n- **Proceed with Caution** : des signaux à vérifier (description vague, employeur peu identifiable, offre qui semble ancienne).\n- **Suspicious** : plusieurs signaux d'arnaque ou d'annonce fantôme.\n\nL'application n'a pas accès au web : vérifie toi-même l'entreprise avant de postuler.",
        },
        {
          q: "Pourquoi certaines lignes disent « not evaluated » ou « unknown » ?",
          a: "L'application ne peut ni chercher sur le web ni consulter des avis d'employés. Plutôt que d'inventer un salaire de marché ou une réputation, elle écrit **inconnu**. À toi de compléter ces points.",
        },
        {
          q: "Pourquoi les titres du rapport sont-ils en anglais ?",
          a: "Les titres des sections (Role Summary, Match with CV, etc.) viennent du modèle de rapport. **Le contenu, lui, est écrit dans la langue choisie** dans Profil & CV (français par défaut).",
        },
        {
          q: "L'analyse s'arrête avec « Cette offre enfreint une de tes règles »",
          a: "Tu as défini des **règles bloquantes** dans Profil & CV (par exemple « pas de poste 100 % sur site »). Quand une offre en enfreint une, l'analyse s'arrête et te l'explique. Si tu veux quand même voir le rapport, clique sur **« Évaluer quand même »**.",
        },
        {
          q: "Que veut dire « Rapport tronqué » ?",
          a: "Le modèle a atteint sa limite de longueur. La note et les premiers blocs sont complets, seule la fin manque. Tu peux relancer l'analyse, par exemple en mode essentiel, si tu veux la version entière.",
        },
      ],
    },
    {
      id: "candidatures",
      title: "Candidatures, lettre et CV adapté",
      items: [
        {
          q: "Quels sont les statuts d'une candidature ?",
          a: `${statuses}\n\nTu changes le statut depuis la liste des candidatures ou depuis la page de la candidature, où tu peux aussi ajouter des notes et la date d'envoi.`,
        },
        {
          q: "Que se passe-t-il si j'analyse deux fois la même offre ?",
          a: "Si tu colles le **même lien** (les paramètres de suivi comme `utm_source` sont ignorés), la candidature existante est **mise à jour** avec un nouveau rapport. Ton statut et tes notes sont conservés, il n'y a pas de doublon.\n\nUne offre collée sans lien crée une nouvelle candidature à chaque fois.",
        },
        {
          q: "Comment générer une lettre de motivation ou un CV adapté ?",
          a: "Ouvre la candidature, puis la zone **« Préparer la candidature »** : **Rédiger la lettre** ou **Adapter mon CV**. Il faut qu'un rapport existe déjà. Tu peux ajouter une consigne (ton, point à mettre en avant), mais **elle ne peut pas ajouter de faits** qui ne sont pas dans ton CV.",
        },
        {
          q: "Puis-je faire confiance au CV adapté ?",
          a: "Il reformule et réordonne les puces pour coller à l'offre, mais il ne doit **rien inventer** : employeurs, intitulés, dates et diplômes restent identiques, et ton niveau n'est jamais relevé. Les postes restent dans l'ordre chronologique.\n\nUn **encadré rouge** liste les chiffres qui ne figurent pas dans ton CV d'origine : vérifie-les ou supprime-les. **Relis toujours chaque ligne avant d'envoyer.**",
        },
        {
          q: "Comment obtenir un PDF ?",
          a: "Sur la page du document, clique sur **« Imprimer / enregistrer en PDF »**, puis choisis **« Enregistrer au format PDF »** comme imprimante dans la fenêtre de ton navigateur. Le bouton **Copier** permet aussi de coller le texte ailleurs.",
        },
        {
          q: "L'application postule-t-elle à ma place ?",
          a: "**Non, jamais.** Elle prépare, tu relis, tu envoies toi-même. C'est une règle de conception.",
        },
      ],
    },
    {
      id: "limites",
      title: "Niveaux, limites et coûts",
      items: [
        {
          q: "C'est quoi les niveaux économique, standard et premium ?",
          a: `Tu choisis le niveau dans **Profil & CV, « Niveau de l'IA »**.\n\n- **Économique** : le plus rapide et le moins cher.\n- **Standard** : équilibré, recommandé.\n- **Premium** : le plus capable, mais plus lent et plus cher.\n\nL'administrateur peut plafonner le niveau. Ici, le maximum autorisé est **${TIER_LABEL[p.maxTier]}**.`,
        },
        {
          q: "Combien d'analyses puis-je lancer ?",
          a: `${limit} et **${p.maxConcurrent}** en même temps. Chaque génération compte : analyse d'offre, lettre, CV adapté et import de CV. Le tableau de bord affiche ton compteur.\n\nUne erreur qui survient **avant** tout appel au modèle (lien illisible, CV absent) ne consomme rien.`,
        },
        {
          q: "Pourquoi mon analyse échoue ou reste « en cours » ?",
          a: "- **« Colle le texte de l'offre »** : le site refuse la lecture automatique (voir plus haut).\n- **« Limite atteinte »** ou **« Une analyse est déjà en cours »** : attends la fin de l'analyse précédente ou la fin des 24 h.\n- **« Le service d'IA a échoué »** : le fournisseur est indisponible ; l'application bascule seule sur un second fournisseur quand il est configuré. Relance un peu plus tard.\n- **« Analyse interrompue »** : le serveur a redémarré en cours de route ; relance-la.",
        },
      ],
    },
    {
      id: "confidentialite",
      title: "Vie privée et sécurité",
      items: [
        {
          q: "Qui peut voir mes données ?",
          a: "Dans l'application, **toi seul** : chaque compte est isolé des autres par une règle de la base de données. L'administrateur voit des **statistiques d'usage** (nombre d'analyses, volume, coût estimé), pas le contenu de tes documents.\n\nPar honnêteté : l'administrateur gère le service et a donc techniquement accès à la base. Si cela te pose un problème, parles-en avec lui.",
        },
        {
          q: "Où vont mon CV et mes données ?",
          a: "Ton CV, ton profil et tes candidatures sont enregistrés dans la base de l'application. **À chaque analyse**, ton CV, ton profil et le texte de l'offre sont envoyés au fournisseur de modèle configuré par l'administrateur (Anthropic ou OpenRouter) pour produire le résultat.\n\nN'écris donc pas dans ton CV des informations que tu ne veux pas partager. Le fichier PDF importé n'est **pas conservé** : seul le texte converti l'est.",
        },
        {
          q: "Comment supprimer mes données ou mon compte ?",
          a: "- **Supprimer cette candidature** (en bas de sa page) efface la candidature, son rapport et ses documents.\n- **Supprimer ce document** efface une lettre ou un CV adapté.\n- Pour **supprimer tout ton compte**, demande à l'administrateur : tout ce qui t'appartient est alors effacé.\n\nUn export et une suppression en libre-service sont prévus.",
        },
        {
          q: "J'ai oublié mon mot de passe, ou je veux le changer",
          a: "Sur la page de connexion, utilise **« Recevoir un lien de connexion »**. Une fois connecté, tu peux choisir un nouveau mot de passe [ici](/account/password) (10 caractères minimum).",
        },
        {
          q: "Pourquoi ne puis-je pas créer un compte moi-même ?",
          a: "L'accès se fait **sur invitation** de l'administrateur, pour garder l'outil privé. Si ton lien d'invitation ne marche plus, demande-lui de t'en renvoyer un.",
        },
        {
          q: "L'application peut-elle se tromper ?",
          a: "**Oui.** Les modèles peuvent mal interpréter une offre ou reformuler maladroitement ton expérience. C'est pour cela que l'application te demande de valider ton CV, signale les chiffres douteux et affiche des avertissements. **Relis toujours avant d'envoyer.**",
        },
      ],
    },
    {
      id: "conseils",
      title: "Conseils pour de meilleurs résultats",
      items: [
        {
          q: "Comment améliorer la qualité des analyses ?",
          a: "- Un **CV précis et chiffré**, à jour, sans fautes : tout part de lui.\n- Des **préférences complètes** (postes visés, ville, salaire minimum, règles bloquantes).\n- Le **texte complet** de l'annonce, pas un extrait.\n- Une section « Ce qui me rend unique » dans le profil : elle aide à cibler les offres.\n- Ne postule pas sous " + apply + " sans raison précise : mieux vaut cinq candidatures ciblées que cinquante au hasard.",
        },
      ],
    },
  ];
}
