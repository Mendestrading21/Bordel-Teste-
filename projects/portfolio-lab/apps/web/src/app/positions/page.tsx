import type { Metadata } from "next";

import type { AssetType, CurrencyCode } from "@portfolio-lab/domain";

import { DemoBanner } from "@/components/demo-banner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PositionsList, type PositionRow } from "@/components/positions-list";
import { loadPortfolioView } from "@/lib/data/portfolio";

export const metadata: Metadata = { title: "Positions" };
export const dynamic = "force-dynamic";

export default async function PositionsPage(): Promise<React.JSX.Element> {
  const view = await loadPortfolioView();
  const { valuation } = view;

  if (valuation === null || view.positions.length === 0) {
    return (
      <>
        <PageHeader
          title="Positions"
          subtitle="Détail de chaque ligne, par compte et par devise."
        />
        <DemoBanner mode={view.mode} />
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

  const valuationById = new Map(valuation.positions.map((value) => [value.positionId, value]));
  const gapById = new Map(valuation.unvalued.map((gap) => [gap.positionId, gap]));

  /*
   * La vue est aplatie ici, côté serveur, avant d'atteindre le composant
   * client : celui-ci n'a besoin ni du modèle complet des positions ni de la
   * valorisation entière, et tout ce qui traverse la frontière serveur/client
   * est sérialisé puis envoyé au navigateur. On n'envoie donc que l'affiché.
   */
  const rows: readonly PositionRow[] = view.positions.map((position) => {
    const value = valuationById.get(position.positionId);
    const gap = gapById.get(position.positionId);

    if (value === undefined) {
      return {
        positionId: position.positionId,
        instrumentId: position.instrumentId,
        instrumentName: position.instrumentName,
        symbol: position.shortName,
        assetType: position.assetType as AssetType,
        accountName: position.accountName,
        marketValueBase: null,
        // La position n'est pas valorisée : la devise de base reste celle du
        // portefeuille, jamais celle du coût, qui peut différer.
        baseCurrency: valuation.baseCurrency as CurrencyCode,
        unrealizedPnlPct: null,
        freshness: "UNAVAILABLE",
        asOf: null,
        provider: null,
        unavailableReason:
          gap === undefined
            ? "Valorisation indisponible"
            : "Aucun cours fiable disponible pour cette position",
      };
    }

    return {
      positionId: position.positionId,
      instrumentId: position.instrumentId,
      instrumentName: position.instrumentName,
      symbol: position.shortName,
      assetType: position.assetType as AssetType,
      accountName: position.accountName,
      marketValueBase: value.marketValueBase,
      baseCurrency: value.baseCurrency as CurrencyCode,
      unrealizedPnlPct: value.unrealizedPnlPct,
      freshness: value.freshness,
      asOf: value.asOf,
      provider: value.provider,
      unavailableReason: null,
    };
  });

  return (
    <>
      <PageHeader title="Positions" subtitle="Détail de chaque ligne, par compte et par devise." />
      <DemoBanner mode={view.mode} />
      <div className="mt-4">
        <PositionsList rows={rows} baseCurrency={valuation.baseCurrency as CurrencyCode} />
      </div>
    </>
  );
}
