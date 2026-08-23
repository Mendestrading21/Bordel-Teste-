import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Analyse" };

export default function AnalysePage(): React.JSX.Element {
  return (
    <>
      <PageHeader
        title="Analyse"
        subtitle="Allocation, évolution du patrimoine et contribution au P&L."
      />
      <EmptyState
        title="Pas encore de données à analyser"
        lines={[
          "Les répartitions par classe d'actifs, par compte et par devise apparaîtront dès qu'une position sera enregistrée.",
          "Les graphiques resteront doublés de valeurs chiffrées lisibles ; ils ne remplacent jamais les chiffres.",
        ]}
      />
    </>
  );
}
