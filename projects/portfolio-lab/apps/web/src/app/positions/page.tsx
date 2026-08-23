import type { Metadata } from "next";
import Link from "next/link";

import { ASSET_TYPE_LABEL, type AssetType, type CurrencyCode } from "@portfolio-lab/domain";

import { DemoBanner } from "@/components/demo-banner";
import { EmptyState } from "@/components/empty-state";
import { FreshnessBadge } from "@/components/freshness-badge";
import { Money, Percent, Quantity, Unavailable } from "@/components/money";
import { PageHeader } from "@/components/page-header";
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

  return (
    <>
      <PageHeader title="Positions" subtitle="Détail de chaque ligne, par compte et par devise." />
      <DemoBanner mode={view.mode} />

      <ul className="space-y-3">
        {view.positions.map((position) => {
          const value = valuationById.get(position.positionId);
          const gap = gapById.get(position.positionId);

          return (
            <li key={position.positionId}>
              <Link
                href={`/positions/${position.positionId}`}
                className="block rounded-token-md border border-subtle bg-surface px-4 py-3 transition-colors hover:bg-elevated"
                style={{ transitionDuration: "var(--pl-transition-fast)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-primary">{position.instrumentName}</p>
                    <p className="mt-0.5 truncate text-xs text-secondary">
                      {ASSET_TYPE_LABEL[position.assetType as AssetType]} · {position.accountName}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {value === undefined ? (
                      <Unavailable
                        reason={
                          gap === undefined
                            ? "Valorisation indisponible"
                            : "Aucun cours fiable disponible pour cette position"
                        }
                      />
                    ) : (
                      <>
                        <p>
                          <Money
                            value={value.marketValueBase}
                            currency={value.baseCurrency as CurrencyCode}
                          />
                        </p>
                        <p className="mt-0.5 text-sm">
                          <Percent value={value.unrealizedPnlPct} />
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {value === undefined ? (
                    <FreshnessBadge freshness="UNAVAILABLE" />
                  ) : (
                    <>
                      <FreshnessBadge
                        freshness={value.freshness}
                        asOf={value.asOf}
                        provider={value.provider}
                      />
                      <span className="text-xs text-secondary">
                        <Quantity value={position.quantity} /> ×{" "}
                        <Money value={position.averageCost} currency={position.costCurrency} />
                      </span>
                    </>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
