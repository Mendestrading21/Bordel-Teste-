import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ASSET_TYPE_LABEL,
  PRICE_TYPE_LABEL,
  type AssetType,
  type CurrencyCode,
} from "@portfolio-lab/domain";

import { DeletePositionForm } from "@/components/delete-position-form";
import { DemoBanner } from "@/components/demo-banner";
import { FreshnessBadge } from "@/components/freshness-badge";
import { Money, Percent, Quantity } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { loadPortfolioView } from "@/lib/data/portfolio";

export const metadata: Metadata = { title: "Détail de la position" };
export const dynamic = "force-dynamic";

function Row({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-subtle py-3 last:border-b-0">
      <dt className="text-sm text-secondary">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

export default async function PositionDetailPage({
  params,
}: Readonly<{ params: Promise<{ positionId: string }> }>): Promise<React.JSX.Element> {
  const { positionId } = await params;
  const view = await loadPortfolioView();

  const position = view.positions.find((entry) => entry.positionId === positionId);
  if (position === undefined) {
    // RLS rend invisible la position d'un tiers : « introuvable » est donc la
    // réponse correcte autant pour une position inexistante que pour celle
    // d'autrui, sans divulguer laquelle.
    notFound();
  }

  const value = view.valuation?.positions.find((entry) => entry.positionId === positionId);

  return (
    <>
      <Link href="/positions" className="mb-4 inline-block text-sm text-copper hover:underline">
        ← Retour aux positions
      </Link>
      <PageHeader
        title={position.instrumentName}
        subtitle={`${ASSET_TYPE_LABEL[position.assetType as AssetType]} · ${position.accountName}`}
      />
      <DemoBanner mode={view.mode} />

      <section className="rounded-token-lg border border-subtle bg-surface px-5 py-4">
        <h2 className="mb-1 text-xs tracking-wide text-secondary uppercase">Valorisation</h2>
        {value === undefined ? (
          <p className="py-3 text-sm text-stale">
            Aucun cours fiable n&apos;est disponible pour cet instrument. La position est exclue du
            total du portefeuille plutôt que comptée pour zéro.
          </p>
        ) : (
          <dl>
            <Row label="Valeur en CHF">
              <Money value={value.marketValueBase} currency={value.baseCurrency as CurrencyCode} />
            </Row>
            <Row label="Valeur en devise native">
              <Money
                value={value.marketValueNative}
                currency={value.nativeCurrency as CurrencyCode}
              />
            </Row>
            <Row label="Coût de revient">
              <Money value={value.costBasisBase} currency={value.baseCurrency as CurrencyCode} />
            </Row>
            <Row label="P&L latent">
              <Money
                value={value.unrealizedPnlBase}
                currency={value.baseCurrency as CurrencyCode}
                colored
              />
            </Row>
            <Row label="Performance">
              <Percent value={value.unrealizedPnlPct} />
            </Row>
            <Row label="Variation du jour">
              {value.dayPnlBase === null ? (
                <span className="text-secondary">Clôture précédente inconnue</span>
              ) : (
                <Money
                  value={value.dayPnlBase}
                  currency={value.baseCurrency as CurrencyCode}
                  colored
                />
              )}
            </Row>
          </dl>
        )}
      </section>

      <section className="mt-4 rounded-token-lg border border-subtle bg-surface px-5 py-4">
        <h2 className="mb-1 text-xs tracking-wide text-secondary uppercase">Position</h2>
        <dl>
          <Row label="Quantité">
            <Quantity value={position.quantity} />
          </Row>
          <Row label="Coût moyen unitaire">
            <Money value={position.averageCost} currency={position.costCurrency} />
          </Row>
          <Row label="Multiplicateur">
            <Quantity value={position.multiplier} />
          </Row>
          <Row label="Compte">{position.accountName}</Row>
          {position.notes === null ? null : <Row label="Notes">{position.notes}</Row>}
        </dl>
      </section>

      {value === undefined ? null : (
        <section className="mt-4 rounded-token-lg border border-subtle bg-surface px-5 py-4">
          <h2 className="mb-1 text-xs tracking-wide text-secondary uppercase">
            Provenance de la donnée
          </h2>
          <dl>
            <Row label="Fraîcheur">
              <FreshnessBadge
                freshness={value.freshness}
                asOf={value.asOf}
                provider={value.provider}
              />
            </Row>
            <Row label="Méthode de valorisation">{PRICE_TYPE_LABEL[value.priceType]}</Row>
            <Row label="Fournisseur">{value.provider}</Row>
            <Row label="Horodatage du cours">
              {new Date(value.asOf).toLocaleString("fr-CH", { timeZone: "Europe/Zurich" })}
            </Row>
            <Row label="Taux de change appliqué">
              <span className="pl-numeric">
                {value.fxRate} {value.nativeCurrency}/{value.baseCurrency}
              </span>
            </Row>
            <Row label="Version du moteur de calcul">
              <span className="pl-numeric">{value.calculationVersion}</span>
            </Row>
          </dl>
        </section>
      )}

      <DeletePositionForm positionId={position.positionId} name={position.instrumentName} />
    </>
  );
}
