import type { Metadata } from "next";
import type { AssetType } from "@portfolio-lab/domain";

import { AccountsHint, AddPositionFlow } from "@/components/add-position-flow";
import { DemoBanner } from "@/components/demo-banner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { listInstruments, loadPortfolioView } from "@/lib/data/portfolio";

export const metadata: Metadata = { title: "Ajouter" };
export const dynamic = "force-dynamic";

export default async function AjouterPage(): Promise<React.JSX.Element> {
  const [view, instruments] = await Promise.all([loadPortfolioView(), listInstruments()]);

  const header = (
    <>
      <PageHeader
        title="Ajouter un placement"
        subtitle="Saisie manuelle. Aucune connexion bancaire, aucun import automatique."
      />
      <DemoBanner mode={view.mode} />
    </>
  );

  if (view.mode.kind === "unavailable") {
    return (
      <>
        {header}
        <EmptyState
          title="Enregistrement impossible"
          lines={[
            view.mode.reason,
            "Aucune position ne peut être créée tant que la couche de données n'est pas configurée.",
          ]}
        />
      </>
    );
  }

  if (view.accounts.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Créez d'abord un compte"
          lines={[
            "Une position est toujours rattachée à un compte — Swissquote, IBKR, BCGE, UBS ou tout autre libellé de votre choix.",
            "Ces comptes sont de simples étiquettes d'organisation : aucun identifiant bancaire n'est demandé.",
          ]}
          action={{ href: "/reglages", label: "Créer un compte" }}
        />
      </>
    );
  }

  return (
    <>
      {header}

      <AddPositionFlow
        accounts={view.accounts.map((account) => ({ id: account.id, name: account.name }))}
        instruments={instruments.map((instrument) => ({
          id: instrument.id,
          name: instrument.name,
          assetType: instrument.assetType as AssetType,
          currency: instrument.currency,
        }))}
      />
      <AccountsHint />
    </>
  );
}
