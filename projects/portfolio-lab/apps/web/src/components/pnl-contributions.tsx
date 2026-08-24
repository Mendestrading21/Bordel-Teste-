import type { CurrencyCode } from "@portfolio-lab/domain";
import type { PnlContribution } from "@portfolio-lab/portfolio-engine";
import { formatShare } from "@portfolio-lab/ui";

import { Money } from "./money";

/**
 * Contribution de chaque position au P&L du portefeuille.
 *
 * Les lignes sont triées par ampleur, gains et pertes confondus : la plus
 * grosse perte est aussi utile à voir que le plus gros gain, et un tri par
 * valeur signée l'aurait reléguée en bas de liste.
 */
export function PnlContributions({
  contributions,
  labels,
  currency,
}: Readonly<{
  contributions: readonly PnlContribution[];
  labels: ReadonlyMap<string, string>;
  currency: CurrencyCode;
}>): React.JSX.Element {
  const everyShareUnknown = contributions.every((contribution) => contribution.share === null);

  return (
    <section className="mt-4 rounded-token-lg border border-subtle bg-surface p-5">
      <h2 className="text-base font-medium text-primary">Contribution au P&amp;L</h2>
      {everyShareUnknown ? (
        <p className="mt-1 text-sm text-secondary">
          Les gains et les pertes se compensent exactement : aucune part ne peut être calculée sur
          un total nul. Les montants restent affichés.
        </p>
      ) : (
        <p className="mt-1 text-sm text-secondary">
          Part de chaque position dans le P&amp;L latent total, gains et pertes confondus.
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {contributions.map((contribution) => (
          <li
            key={contribution.positionId}
            className="flex items-baseline justify-between gap-3 border-t border-subtle pt-2 text-sm first:border-0 first:pt-0"
          >
            <span className="truncate text-primary">
              {labels.get(contribution.positionId) ?? contribution.instrumentId}
            </span>
            <span className="shrink-0 text-secondary">
              {contribution.share === null ? null : (
                <>
                  <span className="pl-numeric">{formatShare(contribution.share)}</span>
                  {" · "}
                </>
              )}
              <Money value={contribution.unrealizedPnlBase} currency={currency} colored />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
