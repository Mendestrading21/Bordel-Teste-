import type { Metadata } from "next";
import Link from "next/link";

import { ASSET_TYPE_LABEL, type AssetType, type CurrencyCode } from "@portfolio-lab/domain";
import { allocate, type AllocationSlice } from "@portfolio-lab/portfolio-engine";
import { formatShare } from "@portfolio-lab/ui";

import { DemoBanner } from "@/components/demo-banner";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { OptionExposure } from "@/components/option-exposure";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui";
import { PnlContributions } from "@/components/pnl-contributions";
import { Reconciliation } from "@/components/reconciliation";
import { SnapshotForm } from "@/components/snapshot-form";
import { WealthHistory } from "@/components/wealth-history";
import { loadAnalytics } from "@/lib/data/analytics";
import { requireOwner } from "@/lib/auth/owner";
import { historyPeriods } from "@/lib/history-periods";
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
                  <span className="pl-numeric">{formatShare(slice.grossPct)}</span>
                  {" · "}
                  <Money value={slice.marketValueBase} currency={currency} />
                </span>
              </div>
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-token-sm bg-elevated"
                role="presentation"
              >
                <div
                  className="h-full bg-accent"
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
  await requireOwner();
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

  /*
   * Les fenêtres sont découpées ici, sur le serveur : le moteur décimal reste
   * hors du navigateur, et les bornes ne peuvent pas différer entre ce qui est
   * calculé et ce qui est affiché.
   *
   * L'ancrage est la date du jour, pas celle du dernier point : « 1 mois »
   * désigne le dernier mois écoulé. Si l'historique s'arrête il y a six mois,
   * les fenêtres courtes disparaissent — c'est l'information juste.
   */
  const history = analytics?.history ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const periods = historyPeriods(history, today);

  /** Pourquoi aucune courbe n'est tracée — jamais un écran muet. */
  const historyGap =
    history.length === 0
      ? "Aucun point enregistré pour l'instant. L'historique se construit à partir de valorisations réellement effectuées : reconstituer une courbe passée avec les cours d'aujourd'hui produirait un graphique convaincant et faux."
      : history.length === 1
        ? `Un seul point enregistré, le ${history[0]?.date}. Une variation demande au moins deux points.`
        : analytics !== null && !analytics.comparable
          ? "L'historique mêle plusieurs versions du moteur de calcul ou plusieurs devises de consolidation. Les points ne sont pas comparables entre eux ; la courbe n'est donc pas tracée."
          : "Aucune fenêtre ne contient deux points enregistrés. Les points existants sont trop espacés pour former une courbe.";

  return (
    <>
      <PageHeader
        title="Analyse"
        subtitle="Allocation, évolution du patrimoine et contribution au P&L."
      />
      <DemoBanner mode={view.mode} />

      {/*
       * 1 et 2. Période puis évolution : la première question quotidienne est
       * « qu'est-ce qui a bougé », et elle n'a de sens qu'une fois la fenêtre
       * de lecture choisie.
       */}
      {periods.length > 0 ? (
        <WealthHistory periods={periods} currency={currency} />
      ) : (
        <Card as="section" padding="md" aria-labelledby="evolution">
          <h2 id="evolution" className="text-xs tracking-wide text-tertiary uppercase">
            Évolution
          </h2>
          <p className="mt-2 text-sm text-stale">{historyGap}</p>
        </Card>
      )}

      {/* 3. Répartition : une carte, une question. */}
      <AllocationList
        title="Répartition par classe d'actifs"
        slices={byAssetType}
        labels={assetLabels}
        currency={currency}
      />

      {/* 4. Performance par position. */}
      {analytics === null ? null : (
        <PnlContributions
          contributions={analytics.contributions}
          labels={positionLabels}
          currency={currency}
        />
      )}

      {/* 5. Comptes et devises : deux découpages de la même question. */}
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

      {/*
       * 6. Section avancée.
       *
       * Exposition options, réconciliation et enregistrement d'un point sont
       * des outils de vérification, pas des questions quotidiennes. Dépliés en
       * permanence, ils doublaient la hauteur de l'écran sous les chiffres que
       * l'on vient réellement consulter.
       */}
      {/*
       * Le lien vers les fonds reste hors de la section avancée : c'est de la
       * navigation vers un écran que l'on consulte, pas un outil de
       * vérification. Replié, il devenait introuvable.
       */}
      <Card as="section" padding="md" className="mt-4" aria-labelledby="fonds">
        <h2 id="fonds" className="text-xs tracking-wide text-tertiary uppercase">
          Fonds de placement
        </h2>
        <p className="mt-1 text-xs text-tertiary">
          Valorisés par leur dernière NAV publiée, avec sa date et sa fréquence.
        </p>
        <Link
          href="/fonds"
          className="inline-flex min-h-[var(--pl-touch-target)] items-center text-sm text-accent hover:underline"
        >
          Voir le détail des fonds →
        </Link>
      </Card>

      {/*
       * Le dépliant ne porte **aucune bordure** : ses deux pixels rétrécissaient
       * les sections imbriquées, et le tableau d'exposition se remettait à
       * tronquer le notionnel sur 390 px. Seul le résumé est stylé en barre.
       */}
      <details className="group mt-4">
        <summary className="flex min-h-[var(--pl-touch-target)] cursor-pointer list-none items-center justify-between gap-3 rounded-token-lg border border-subtle bg-surface px-5 text-sm text-secondary">
          <span>Détails avancés</span>
          <span aria-hidden="true" className="text-xs text-tertiary group-open:hidden">
            Afficher
          </span>
          <span aria-hidden="true" className="hidden text-xs text-tertiary group-open:inline">
            Masquer
          </span>
        </summary>

        {/*
         * Aucune marge horizontale ici : les sections imbriquées portent déjà
         * la leur. En ajouter une rétrécissait le conteneur du tableau
         * d'exposition, qui se remettait à tronquer le notionnel — le défaut
         * même qu'un parcours E2E surveille depuis le Lot 08.
         */}
        <div className="pb-2">
          {analytics === null ? null : (
            <>
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

          <div className="mt-4 rounded-token-lg border border-subtle bg-surface p-5">
            <SnapshotForm />
            <p className="mt-2 text-xs leading-relaxed text-tertiary">
              Le point enregistre les totaux actuels, la version du moteur de calcul et une
              empreinte des cours et taux utilisés. Deux enregistrements au même instant mettent à
              jour le même point plutôt que d&apos;en créer deux.
            </p>
          </div>
        </div>
      </details>

      <p className="mt-4 text-xs leading-relaxed text-secondary">
        Les parts sont calculées sur l&apos;exposition brute, en valeurs absolues. Les positions
        qu&apos;aucun cours ne permet de valoriser sont exclues de ces répartitions et signalées sur
        l&apos;accueil.
      </p>
    </>
  );
}
