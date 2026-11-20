"use client";

import { sendMagicLink, signInWithPassword } from "@/actions/auth";
import { ActionForm, SubmitButton } from "./forms";

export function PasswordForm() {
  return (
    <ActionForm action={signInWithPassword}>
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">Mot de passe</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
      </div>
      <SubmitButton className="btn btn-primary w-full" pending="Connexion…">Se connecter</SubmitButton>
    </ActionForm>
  );
}

export function MagicLinkForm() {
  return (
    <ActionForm action={sendMagicLink}>
      <div>
        <label className="label" htmlFor="magic-email">E-mail</label>
        <input id="magic-email" name="email" type="email" required autoComplete="email" className="input" />
        <p className="hint">Tu reçois un lien à usage unique : pratique si tu as oublié ton mot de passe.</p>
      </div>
      <SubmitButton className="btn btn-secondary w-full" pending="Envoi…">Recevoir un lien de connexion</SubmitButton>
    </ActionForm>
  );
}

export function PasswordChangeForm({ action }: { action: Parameters<typeof ActionForm>[0]["action"] }) {
  return (
    <ActionForm action={action}>
      <div>
        <label className="label" htmlFor="password">Nouveau mot de passe</label>
        <input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" className="input" />
        <p className="hint">10 caractères minimum.</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirmation</label>
        <input id="confirm" name="confirm" type="password" required minLength={10} autoComplete="new-password" className="input" />
      </div>
      <SubmitButton pending="Enregistrement…">Enregistrer le mot de passe</SubmitButton>
    </ActionForm>
  );
}
