import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Ajouter" };

export default function AjouterPage(): React.JSX.Element {
  return (
    <>
      <PageHeader
        title="Ajouter un placement"
        subtitle="Recherche par nom, ticker ou ISIN ; sélection guidée pour les options."
      />
      <EmptyState
        title="Formulaire en cours de construction"
        lines={[
          "La saisie manuelle des comptes et des positions arrive au Lot 03 de la feuille de route.",
          "La recherche d'instruments chez les fournisseurs de données arrive au Lot 04.",
          "Aucun instrument ne sera proposé tant qu'un fournisseur ne l'aura pas réellement résolu.",
        ]}
      />
    </>
  );
}
