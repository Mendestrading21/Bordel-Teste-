import type { Metadata } from "next";
import Link from "next/link";

import { ASSET_TYPE_LABEL, type AssetType, type CurrencyCode } from "@portfolio-lab/domain";
import { allocate, type AllocationSlice } from "@portfolio-lab/portfolio-engine";
import { formatPercent } from "@portfolio-lab/ui";

import { DemoBanner } from "@/components/demo-banner";
import { EmptyState } from "@/components/empty-state";
import { Money, Percent } from "@/components/money";
import { OptionExposure } from "@/components/option-exposure";
import { PageHeader } from "@/components/page-header";
import { PnlContributions } from "@/components/pnl-contributions";
import { Reconciliation } from "@/components/reconciliation";
import { SnapshotForm } from "@/components/snapshot-form";
import { WealthChart } from "@/components/wealth-chart";
import { loadAnalytics } from "@/lib/data/analytics";
import { loadPortfolioView } from "@/lib/data/portfolio";

export const metadata: Metadata = { title: "Analyse" };
export const dynamic = "force-dynamic";

/**
 * Répartition sous forme de barres.
 *
 * Chaque barre est doublée de sa valeur chiffrée et d'un libellé textuel : le
 * graphique ne remplace jamais les chiffres, et la part n'est pas communiquée
 * par la seule longueur de la barre.
 */
function AllocationList({
  title,
  slices,
  labels,
  currency,
}: Readonly<{
  title: string;
  slices: readonly AllocationSlice[];
  labels: ReadonlyMap<string, string>;
  currency: CurrencyCode;
}>): React.JSX.Element {
  return (
    <section className="mt-4 rounded-token-lg border border-subtle bg-surface p-5">
      <h2 className="mb-3 text-base font-medium text-primary">{title}</h2>
      <ul className="space-y-3">
        {slices.map((slice) => {
          const percent = Number(slice.grossPct);
          return (
            <li key={slice.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-primary">{labels.get(slice.key) ?? slice.key}</span>
                <span className="shrink-0 text-secondary">
                  <span className="pl-numeric">{formatPercent(slice.grossPct)}</span>
                  {" · "}
                  <Money value={slice.marketValueBase} currency={currency} />
                </span>
              </div>
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-token-sm bg-elevated"
                role="presentation"
              >
                <div
                  className="h-full bg-copper"
                  style={{ width: `${Math.max(0, Math.min(100, percent * 100))}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default async function AnalysePage(): Promise<React.JSX.Element> {
  const view = await loadPortfolioView();
  const { valuation } = view;

  if (valuation === null || valuation.positions.length === 0) {
    return (
      <>
        <PageHeader
          title="Analyse"
          subtitle="Allocation, évolution du patrimoine et contribution au P&L."
        />
        <DemoBanner mode={view.mode} />
        <EmptyState
          title="Pas encore de données à analyser"
          lines={[
            "Les répartitions par classe d'actifs, par compte et par devise apparaîtront dès qu'une position sera enregistrée.",
            "L'historique du patrimoine se construit à partir de points réellement enregistrés : aucune courbe passée n'est reconstituée après coup.",
            "Les graphiques resteront doublés de valeurs chiffrées lisibles ; ils ne remplacent jamais les chiffres.",
          ]}
        />
      </>
    );
  }

  const currency = valuation.baseCurrency as CurrencyCode;
  const analytics = await loadAnalytics(view);
  const positionById = new Map(view.positions.map((position) => [position.positionId, position]));

  const byAccount = allocate(
    valuation.positions.map((value) => ({
      key: value.accountId,
      marketValueBase: value.marketValueBase,
    })),
  );
  const accountLabels = new Map(view.accounts.map((account) => [account.id, account.name]));

  const byAssetType = allocate(
    valuation.positions.map((value) => ({
      key: positionById.get(value.positionId)?.assetType ?? "OTHER",
      marketValueBase: value.marketValueBase,
    })),
  );
  const assetLabels = new Map(
    byAssetType.map((slice) => [slice.key, ASSET_TYPE_LABEL[slice.key as AssetType] ?? slice.key]),
  );

  const byCurrency = allocate(
    valuation.positions.map((value) => ({
      key: value.nativeCurrency,
      marketValueBase: value.marketValueBase,
    })),
  );

  const positionLabels = new Map(
    view.positions.map((position) => [position.positionId, position.instrumentName]),
  );

  return (
    <>
      <PageHeader
        title="Analyse"
        subtitle="Allocation, évolution du patrimoine et contribution au P&L."
      />
      <DemoBanner mode={view.mode} />

      <section className="rounded-token-lg border border-subtle bg-surface p-5">
        <h2 className="text-base font-medium text-primary">Évolution du patrimoine</h2>

        {analytics === null || analytics.history.length === 0 ? (
          <p className="mt-1 text-sm text-secondary">
            Aucun point enregistré pour l&apos;instant. L&apos;historique se construit à partir de
            valorisations réellement effectuées : reconstituer une courbe passée avec les cours
            d&apos;aujourd&apos;hui produirait un graphique convaincant et faux.
          </p>
        ) : analytics.history.length === 1 ? (
          <p className="mt-1 text-sm text-secondary">
            Un seul point enregistré, le{" "}
            <span className="pl-numeric">{analytics.history[0]?.date}</span>. Une variation demande
            au moins deux points.
          </p>
        ) : !analytics.comparable || analytics.change === null || analytics.bounds === null ? (
          /*
           * Une série non comparable n'est pas tracée du tout : superposer des
           * points venus de deux versions du moteur — ou de deux devises de
           * consolidation — dessinerait une marche qui ne correspond à aucun
           * mouvement de patrimoine.
           */
          <p className="mt-1 text-sm text-secondary">
            L&apos;historique mêle plusieurs versions du moteur de calcul ou plusieurs devises de
            consolidation. Les points ne sont pas comparables entre eux ; la courbe n&apos;est donc
            pas tracée.
          </p>
        ) : (
          <>
            <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-xs tracking-wide text-secondary uppercase">Variation</dt>
                <dd className="mt-0.5">
                  <Money value={analytics.change.absolute} currency={currency} colored />
                </dd>
              </div>
              <div>
                <dt className="text-xs tracking-wide text-secondary uppercase">Sur la période</dt>
                <dd className="mt-0.5">
                  <Percent value={analytics.change.relative} />
                </dd>
              </div>
            </dl>
            <WealthChart
              history={analytics.history}
              bounds={analytics.bounds}
              currency={currency}
            />
          </>
        )}

        <div className="mt-4 border-t border-subtle pt-4">
          <SnapshotForm />
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            Le point enregistre les totaux actuels, la version du moteur de calcul et une empreinte
            des cours et taux utilisés. Deux enregistrements au même instant mettent à jour le même
            point plutôt que d&apos;en créer deux.
          </p>
        </div>
      </section>

      <AllocationList
        title="Par classe d'actifs"
        slices={byAssetType}
        labels={assetLabels}
        currency={currency}
      />
      <AllocationList
        title="Par compte"
        slices={byAccount}
        labels={accountLabels}
        currency={currency}
      />
      <AllocationList
        title="Par devise de cotation"
        slices={byCurrency}
        labels={new Map()}
        currency={currency}
      />

      {analytics === null ? null : (
        <>
          <PnlContributions
            contributions={analytics.contributions}
            labels={positionLabels}
            currency={currency}
          />
          <OptionExposure
            exposures={analytics.options}
            excluded={analytics.optionsExcluded}
            currency={currency}
          />
          <Reconciliation
            result={analytics.reconciliation}
            fingerprint={analytics.fingerprint}
            currency={currency}
          />
        </>
      )}

      <section className="mt-4 rounded-token-lg border border-subtle bg-surface p-5">
        <h2 className="mb-1 text-base font-medium text-primary">Fonds de placement</h2>
        <p className="mb-3 text-sm text-secondary">
          Les fonds sont valorisés par leur dernière NAV publiée, avec sa date et sa fréquence.
        </p>
        <Link
          href="/fonds"
          className="inline-flex min-h-[var(--pl-touch-target)] items-center text-sm text-copper hover:underline"
        >
          Voir le détail des fonds →
        </Link>
      </section>

      <p className="mt-4 text-xs leading-relaxed text-secondary">
        Les parts sont calculées sur l&apos;exposition brute, en valeurs absolues. Les positions
        qu&apos;aucun cours ne permet de valoriser sont exclues de ces répartitions et signalées sur
        l&apos;accueil.
      </p>
    </>
  );
}
