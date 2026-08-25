import { Button, Section } from "./ui";

import { logout } from "@/app/connexion/actions";

/**
 * Fermeture de session.
 *
 * Séparée de la zone irréversible : se déconnecter n'efface rien et se refait
 * en une phrase secrète. La confondre avec la suppression définitive rendrait
 * l'une comme l'autre plus difficiles à lire.
 *
 * Un bouton dans un formulaire, et non un lien : une déconnexion est une
 * écriture, et un lien la rendrait déclenchable par un préchargement.
 */
export function LogoutSection(): React.JSX.Element {
  return (
    <Section title="Session">
      <p className="text-sm leading-relaxed text-secondary">
        Fermer la session efface le cookie de ce navigateur. Aucune donnée
        n&apos;est supprimée : vos positions vous attendent à la prochaine
        connexion.
      </p>
      <form action={logout} className="mt-3">
        <Button type="submit" variant="secondary">
          Fermer la session
        </Button>
      </form>
    </Section>
  );
}
