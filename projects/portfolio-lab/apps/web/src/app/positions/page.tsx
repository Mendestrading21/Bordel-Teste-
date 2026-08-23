import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Positions" };

export default function PositionsPage(): React.JSX.Element {
  return (
    <>
      <PageHeader title="Positions" subtitle="Détail de chaque ligne, par compte et par devise." />
      <EmptyState
        title="Aucune position"
        lines={[
          "La liste affichera la valeur native, la valeur en CHF, la variation et le P&L latent de chaque ligne.",
          "Chaque position portera un badge indiquant si le cours est en direct, différé, issu de la dernière clôture ou d'une NAV.",
        ]}
        action={{ href: "/ajouter", label: "Ajouter une position" }}
      />
    </>
  );
}
