import type { Metadata } from "next";
import Link from "next/link";
import { Markdown } from "@/components/Markdown";
import { requireUser } from "@/lib/auth";
import { dailyRunLimit, maxConcurrentRuns, maxTier } from "@/lib/env";
import { faqSections } from "@/lib/faq";

export const metadata: Metadata = { title: "Aide et FAQ" };

export default async function FaqPage() {
  await requireUser();
  const sections = faqSections({ dailyLimit: dailyRunLimit(), maxConcurrent: maxConcurrentRuns(), maxTier: maxTier() });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-bold">Aide et questions fréquentes</h1>
        <p className="text-muted">
          Tout ce qu'il faut savoir pour utiliser l'application. Pour démarrer, va dans <Link className="text-accent underline" href="/profile">Profil &amp; CV</Link>,
          puis analyse ta première offre depuis le <Link className="text-accent underline" href="/">tableau de bord</Link>.
        </p>
        <nav aria-label="Sections de la FAQ" className="flex flex-wrap gap-2 pt-1">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="badge hover:bg-accent-soft">
              {s.title}
            </a>
          ))}
        </nav>
      </header>

      {sections.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="card scroll-mt-4 space-y-2">
          <h2 id={`${s.id}-title`} className="text-lg font-semibold">{s.title}</h2>
          <div className="divide-y divide-border">
            {s.items.map((item) => (
              <details key={item.q} className="group py-3">
                <summary className="cursor-pointer list-none font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="mr-2 inline-block text-accent transition-transform group-open:rotate-90" aria-hidden="true">›</span>
                  {item.q}
                </summary>
                <div className="mt-2 pl-5">
                  <Markdown>{item.a}</Markdown>
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <p className="hint">
        Une question qui n'est pas ici ? Demande à l'administrateur de l'application. Pense à lui copier le message d'erreur exact, sans jamais lui envoyer de mot de passe.
      </p>
    </div>
  );
}
