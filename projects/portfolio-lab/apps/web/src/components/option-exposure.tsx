import type { CurrencyCode } from "@portfolio-lab/domain";
import { formatAmount, signOf } from "@portfolio-lab/ui";

import type { ExcludedContract, OptionExposureRecord } from "@/lib/data/analytics";

/**
 * Exposition des options par sous-jacent.
 *
 * La valeur de marché et le **notionnel** sont affichés côte à côte, jamais
 * l'un à la place de l'autre : deux calls valant mille francs peuvent engager
 * plusieurs dizaines de milliers de francs si les contrats sont exercés, et
 * n'afficher que leur prime laisserait croire à une exposition modeste.
 */
/** Explication utilisateur de chaque motif d'exclusion. */
const EXCLUSION_LABEL: Readonly<Record<ExcludedContract["reason"], string>> = {
  NOT_VALUED: "aucun cours ne permet de les valoriser",
  CURRENCY_MISMATCH: "le cours reçu n'est pas dans la devise du contrat",
};

export function OptionExposure({
  exposures,
  excluded,
  currency,
}: Readonly<{
  exposures: readonly OptionExposureRecord[];
  excluded: readonly ExcludedContract[];
  currency: CurrencyCode;
}>): React.JSX.Element | null {
  if (exposures.length === 0 && excluded.length === 0) {
    return null;
  }

  /*
   * Les motifs sont regroupés : lister dix fois « aucun cours disponible »
   * n'apprend rien de plus que « dix contrats, aucun cours disponible ».
   */
  const byReason = new Map<ExcludedContract["reason"], number>();
  for (const contract of excluded) {
    byReason.set(contract.reason, (byReason.get(contract.reason) ?? 0) + 1);
  }

  return (
    <section className="mt-4 rounded-token-lg border border-subtle bg-surface p-5">
      <h2 className="text-base font-medium text-primary">Exposition options</h2>
      <p className="mt-1 text-sm text-secondary">
        Le notionnel est calculé sur le multiplicateur réellement enregistré pour chaque contrat —
        jamais sur une valeur supposée.
      </p>

      {/*
       * La devise figure dans les en-têtes, pas dans chaque cellule.
       *
       * Toutes les valeurs sont dans la devise de consolidation : la répéter
       * six fois consommait la largeur dont les chiffres avaient besoin, et le
       * notionnel finissait tronqué à « CHF 17'800.0 » sur un écran de 390 px —
       * un montant faux, pas un détail de mise en page.
       */}
      {byReason.size === 0 ? null : (
        <ul className="mt-2 space-y-1 text-sm text-warning">
          {[...byReason.entries()].map(([reason, count]) => (
            <li key={reason}>
              {count} contrat{count > 1 ? "s" : ""} écarté{count > 1 ? "s" : ""} de ce total :{" "}
              {EXCLUSION_LABEL[reason]}.
            </li>
          ))}
        </ul>
      )}

      {exposures.length === 0 ? null : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Valeur de marché et exposition notionnelle des options, par sous-jacent
            </caption>
            <thead>
              <tr className="text-xs tracking-wide text-secondary uppercase">
                <th scope="col" className="py-1 pr-3 text-left font-medium">
                  Sous-jacent
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium whitespace-nowrap">
                  Valeur ({currency})
                </th>
                <th scope="col" className="py-1 text-right font-medium whitespace-nowrap">
                  Notionnel ({currency})
                </th>
              </tr>
            </thead>
            <tbody>
              {exposures.map((exposure) => (
                <tr key={exposure.underlyingId} className="border-t border-subtle">
                  <th scope="row" className="py-2 pr-3 text-left font-normal text-primary">
                    {exposure.underlyingLabel}
                    <span className="block text-xs text-secondary">
                      {exposure.contractCount} contrat{exposure.contractCount > 1 ? "s" : ""}
                    </span>
                  </th>
                  <td className="pl-numeric py-2 pr-3 text-right whitespace-nowrap text-primary">
                    {formatAmount(exposure.marketValueBase, currency)}
                  </td>
                  <td
                    className={`pl-numeric py-2 text-right whitespace-nowrap ${
                      signOf(exposure.notionalBase) === "negative"
                        ? "text-negative"
                        : "text-primary"
                    }`}
                  >
                    {formatAmount(exposure.notionalBase, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
