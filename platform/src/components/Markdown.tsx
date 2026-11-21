import ReactMarkdown from "react-markdown";
import { markdownOptions } from "@/lib/markdown-config";
import { normalizeDashes } from "@/lib/text";

/** Rendu markdown sûr : voir lib/markdown-config.ts (pas de HTML brut, pas d'image, liens durcis). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown {...markdownOptions}>{normalizeDashes(children)}</ReactMarkdown>
    </div>
  );
}
