import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MagicLinkForm, PasswordForm } from "@/components/LoginForms";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Connexion" };

const ERRORS: Record<string, string> = {
  link: "Ce lien n'est plus valide (expiré ou déjà utilisé). Demande-en un nouveau ci-dessous.",
  forbidden: "Ce compte n'a pas accès à l'application.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSessionUser()) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">Chasseur d'emploi</h1>
        <p className="mt-1 text-muted">Évalue les offres, adapte ton CV, suis tes candidatures.</p>
      </div>
      {error && ERRORS[error] && <p role="alert" className="alert alert-error">{ERRORS[error]}</p>}
      <section className="card space-y-4" aria-labelledby="login-title">
        <h2 id="login-title" className="font-semibold">Connexion</h2>
        <PasswordForm />
      </section>
      <section className="card space-y-4" aria-labelledby="magic-title">
        <h2 id="magic-title" className="font-semibold">Mot de passe oublié ?</h2>
        <MagicLinkForm />
      </section>
      <p className="text-center text-sm text-muted">Accès sur invitation uniquement.</p>
    </main>
  );
}
