import type { Metadata } from "next";
import { CvForms, PreferencesForm } from "@/components/ProfileForms";
import { requireUser } from "@/lib/auth";
import { loadSettings } from "@/lib/data";
import { maxTier, TIERS } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profil & CV" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ cv?: string }> }) {
  const user = await requireUser();
  const { cv } = await searchParams;
  const supabase = await createClient();
  const settings = await loadSettings(supabase, user.id);
  const allowedTiers = TIERS.slice(0, TIERS.indexOf(maxTier()) + 1);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Profil & CV</h1>
      {cv === "ok" && <p role="status" className="alert alert-ok">CV mis à jour.</p>}

      <section className="card space-y-4" aria-labelledby="cv-title">
        <h2 id="cv-title" className="font-semibold">Mon CV</h2>
        <CvForms cv={settings.cv_md} />
      </section>

      <section className="card space-y-4" aria-labelledby="pref-title">
        <h2 id="pref-title" className="font-semibold">Mes préférences de recherche</h2>
        <PreferencesForm settings={settings} allowedTiers={allowedTiers} />
      </section>

      <p className="hint">
        Ton CV et ton profil sont envoyés au service d'IA configuré par l'administrateur (Anthropic ou OpenRouter) à chaque analyse.
        Ils ne sont jamais partagés avec les autres utilisateurs.
      </p>
    </div>
  );
}
