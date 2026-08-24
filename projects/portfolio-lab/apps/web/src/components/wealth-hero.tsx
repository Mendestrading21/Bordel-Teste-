import {
  ASSET_TYPE_LABEL,
  type AssetType,
  type CurrencyCode,
  type DecimalString,
} from "@portfolio-lab/domain";
import type { PortfolioValuation } from "@portfolio-lab/portfolio-engine";

import { FreshnessBadge } from "./freshness-badge";
import { Money, Percent } from "./money";
import { Card, Chip } from "./ui";

/**
 * Bloc dominant de l'accueil : le patrimoine consolidé.
 *
 * Un seul chiffre porte la taille `hero`, et c'est celui-ci. C'est la raison
 * pour laquelle l'application est ouverte ; tout le reste de l'écran se lit en
 * second.
 *
 * La variation du jour est **dans** ce bloc plutôt qu'en carte séparée : « ce
 * que je possède » et « combien cela a bougé aujourd'hui » forment une seule
 * question, et les séparer obligeait à parcourir l'écran pour la reconstituer.
 */
export function WealthHero({
  valuation,
  currency,
  marksAsOf,
  positionCount,
  returnPct,
}: Readonly<{
  valuation: PortfolioValuation;
  currency: CurrencyCode;
  marksAsOf: string | null;
  positionCount: number;
  returnPct: DecimalString | null;
}>): React.JSX.Element {
  return (
    <Card as="section" tone="elevated" padding="lg" aria-labelledby="patrimoine-total">
      <h2 id="patrimoine-total" className="text-xs tracking-wide text-tertiary uppercase">
        <span aria-hidden="true">💼 </span>Patrimoine total
      </h2>

      <p className="pl-numeric mt-2 text-[2.5rem] leading-none font-semibold tracking-tight text-primary">
        <Money value={valuation.totalMarketValueBase} currency={currency} />
      </p>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="text-tertiary">
          Aujourd&apos;hui{" "}
          {valuation.totalDayPnlBase === null ? (
            <span className="pl-numeric text-stale">non calculable</span>
          ) : (
            <Money value={valuation.totalDayPnlBase} currency={currency} colored />
          )}
        </span>
        <span className="text-tertiary">
          Total <Percent value={returnPct} />
        </span>
      </div>

      {valuation.totalDayPnlBase === null ? (
        /*
         * L'explication reste **visible**, pas reléguée dans un `title`.
         *
         * Une première version n'affichait qu'un tiret avec une infobulle : sur
         * un téléphone il n'y a pas de survol, si bien qu'un utilisateur voyant
         * n'avait plus aucune explication. La ligne ne coûte que le cas où le
         * total est réellement incalculable, ce qui est déjà l'exception.
         */
        <p className="mt-2 text-xs leading-relaxed text-tertiary">
          Au moins une position n&apos;a pas de clôture précédente connue. Afficher un total partiel
          serait trompeur.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <FreshnessBadge freshness={valuation.worstFreshness} asOf={marksAsOf} />
        <Chip tone="neutral">
          {positionCount} position{positionCount > 1 ? "s" : ""}
        </Chip>
      </div>
    </Card>
  );
}

/**
 * Indicateurs secondaires, sur une seule rangée.
 *
 * Ils étaient trois cartes pleine largeur empilées, soit près de 210 px pour
 * trois nombres courts. Une grille de trois colonnes les rend comparables d'un
 * coup d'œil — ce qui est précisément l'usage : on les lit ensemble, jamais
 * l'un après l'autre.
 */
export function WealthMetrics({
  valuation,
  currency,
  returnPct,
}: Readonly<{
  valuation: PortfolioValuation;
  currency: CurrencyCode;
  returnPct: DecimalString | null;
}>): React.JSX.Element {
  return (
    <Card as="section" padding="md" className="mt-3" aria-label="Indicateurs du portefeuille">
      {/*
       * La devise est annoncée une fois pour les trois colonnes plutôt que
       * répétée dans chaque cellule : sur 390 px, trois montants avec leur
       * « CHF » ne tiennent pas et le navigateur les tronque.
       */}
      <p className="mb-2 text-xs text-tertiary">
        Montants en <span className="pl-numeric">{currency}</span>
      </p>
      <dl className="grid grid-cols-3 gap-3">
        <div className="min-w-0">
          <dt className="text-xs text-tertiary">P&amp;L latent</dt>
          <dd className="pl-numeric mt-1 truncate text-sm font-medium">
            <Money value={valuation.totalUnrealizedPnlBase} currency={currency} colored bare />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-tertiary">Performance</dt>
          <dd className="pl-numeric mt-1 truncate text-sm font-medium">
            <Percent value={returnPct} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-tertiary">Investi</dt>
          <dd className="pl-numeric mt-1 truncate text-sm font-medium">
            <Money value={valuation.totalCostBasisBase} currency={currency} bare />
          </dd>
        </div>
      </dl>
    </Card>
  );
}

export type AllocationRow = {
  readonly assetType: AssetType;
  readonly sharePct: number;
};

/**
 * Répartition par classe d'actifs, en barres proportionnelles.
 *
 * Les parts portent un émoji **sémantique** : il désigne la classe d'actif, il
 * n'est pas décoratif. Il est masqué aux lecteurs d'écran, le libellé portant
 * déjà le sens.
 */
const ASSET_ICON: Readonly<Partial<Record<AssetType, string>>> = {
  STOCK: "📈",
  ETF: "🧺",
  OPTION: "🎯",
  MUTUAL_FUND: "🏦",
  CASH: "💵",
  BOND: "📜",
  CRYPTO: "🪙",
};

export function AllocationSummary({
  rows,
}: Readonly<{ rows: readonly AllocationRow[] }>): React.JSX.Element | null {
  if (rows.length === 0) return null;

  return (
    <Card as="section" padding="md" className="mt-3" aria-labelledby="repartition">
      <h2 id="repartition" className="text-xs tracking-wide text-tertiary uppercase">
        Répartition
      </h2>
      <ul className="mt-3 space-y-2.5">
        {rows.map((row) => (
          <li key={row.assetType}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-secondary">
                <span aria-hidden="true">{ASSET_ICON[row.assetType] ?? "•"} </span>
                {ASSET_TYPE_LABEL[row.assetType]}
              </span>
              <span className="pl-numeric shrink-0 text-tertiary">{row.sharePct.toFixed(1)} %</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-token-pill bg-raised">
              <div
                className="h-full rounded-token-pill bg-accent"
                style={{ width: `${Math.max(row.sharePct, 1.5)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
