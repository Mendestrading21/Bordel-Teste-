"use client";

import { useActionState } from "react";

import { Button, Card } from "@/components/ui";

import { login, type LoginState } from "./actions";

const INITIAL: LoginState = { error: null };

/**
 * Formulaire de connexion.
 *
 * Un seul champ. Il n'y a ni identifiant à saisir — l'application n'a qu'un
 * propriétaire — ni lien « mot de passe oublié » : personne ne peut réémettre
 * une phrase que le serveur ne connaît que sous forme hachée. La phrase se
 * change en régénérant `PORTFOLIO_LAB_PASSPHRASE_HASH`, et l'écran le dit.
 */
export function LoginForm(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(login, INITIAL);

  return (
    <Card padding="lg">
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-secondary">Phrase secrète</span>
          <input
            type="password"
            name="passphrase"
            autoComplete="current-password"
            required
            autoFocus
            className="min-h-[var(--pl-touch-target)] w-full rounded-token-md border border-subtle bg-surface px-3 text-base text-primary placeholder:text-tertiary"
          />
        </label>

        {state.error === null ? null : (
          <p role="alert" className="text-sm text-negative" data-pl-login-error>
            {state.error}
          </p>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Vérification…" : "Entrer"}
        </Button>

        <p className="text-xs leading-relaxed text-tertiary">
          Aucune récupération n&apos;est possible : le serveur ne conserve que
          l&apos;empreinte de votre phrase, jamais la phrase. Pour en changer,
          régénérez <code>PORTFOLIO_LAB_PASSPHRASE_HASH</code>.
        </p>
      </form>
    </Card>
  );
}
