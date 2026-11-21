import type { Metadata } from "next";
import { updatePassword } from "@/actions/auth";
import { PasswordChangeForm } from "@/components/LoginForms";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Mot de passe" };

export default async function PasswordPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-bold">Choisir un mot de passe</h1>
      <div className="card">
        <PasswordChangeForm action={updatePassword} />
      </div>
    </div>
  );
}
