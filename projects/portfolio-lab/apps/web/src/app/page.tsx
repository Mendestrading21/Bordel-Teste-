import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SessionNotice } from "@/components/session-notice";
import { getServerSessionState } from "@/lib/auth/server";
import { canAccessData } from "@/lib/auth/session";

export default function AccueilPage(): React.JSX.Element {
  const session = getServerSessionState();

  return (
    <>
      <PageHeader title="Accueil" subtitle="Votre patrimoine consolidé en francs suisses." />
      <SessionNotice state={session} />
      {canAccessData(session) ? (
        <EmptyState
          title="Aucun placement enregistré"
          lines={[
            "PortfolioLab ne se connecte à aucune banque et n'importe rien automatiquement : vous ajoutez vous-même chaque placement.",
            "Une fois une position saisie, l'application récupère les cours disponibles, convertit en CHF et affiche la source ainsi que la fraîcheur de chaque donnée.",
            "Les comptes — Swissquote, IBKR, BCGE, UBS — sont de simples étiquettes d'organisation, sans aucun identifiant bancaire.",
          ]}
          action={{ href: "/ajouter", label: "Ajouter mon premier placement" }}
        />
      ) : (
        <EmptyState
          title="Patrimoine privé"
          lines={[
            "PortfolioLab est une application personnelle : vos positions ne sont visibles qu'une fois votre session ouverte.",
            "Aucune donnée n'est affichée avant authentification, et aucune donnée de démonstration ne vient combler l'écran.",
            "L'application ne se connecte à aucune banque et ne demande aucun mot de passe bancaire.",
          ]}
        />
      )}
    </>
  );
}
