import type { CurrencyCode } from "@portfolio-lab/domain";

import type { FxQuote } from "./contract.js";
import type { ProviderRouter } from "./provider-router.js";
import { failureReason } from "./quote-refresh.js";

/**
 * Rafraîchissement des taux de change vers la devise de consolidation.
 *
 * Séparé du rafraîchissement des cours parce que la règle d'échec y est
 * l'inverse. Un instrument sans cours laisse **une** ligne non valorisée ; un
 * taux manquant en fausse **toutes** celles libellées dans cette devise, et le
 * total avec elles. Un taux absent doit donc rendre les positions concernées
 * explicitement non valorisées — jamais être remplacé par un taux plus ancien
 * présenté comme courant, et encore moins par 1.
 */

export type FxRefreshOutcome =
  | { readonly kind: "RESOLVED"; readonly base: CurrencyCode; readonly fx: FxQuote }
  | {
      readonly kind: "MISSING";
      readonly base: CurrencyCode;
      readonly quote: CurrencyCode;
      readonly reason: string;
    };

export type FxRefreshReport = {
  readonly outcomes: readonly FxRefreshOutcome[];
  readonly resolved: number;
  readonly missing: number;
};

/**
 * Relève un taux par devise distincte, vers `quoteCurrency`.
 *
 * Les devises sont dédoublonnées avant l'appel : douze positions en USD ne
 * doivent produire qu'une seule requête. Sur un plan gratuit compté en dizaines
 * d'appels par minute, la différence n'est pas cosmétique.
 *
 * L'ordre du rapport suit celui des devises reçues, quelle que soit la vitesse
 * des réponses.
 */
export async function refreshFxRates(
  router: ProviderRouter,
  currencies: readonly CurrencyCode[],
  quoteCurrency: CurrencyCode,
): Promise<FxRefreshReport> {
  const distinct: CurrencyCode[] = [];
  const seen = new Set<CurrencyCode>();
  for (const currency of currencies) {
    if (seen.has(currency)) continue;
    seen.add(currency);
    distinct.push(currency);
  }

  const outcomes = await Promise.all(
    distinct.map(async (base): Promise<FxRefreshOutcome> => {
      try {
        const { fx } = await router.fxRate(base, quoteCurrency);
        return { kind: "RESOLVED", base, fx };
      } catch (error) {
        return {
          kind: "MISSING",
          base,
          quote: quoteCurrency,
          reason: failureReason(error),
        };
      }
    }),
  );

  return {
    outcomes,
    resolved: outcomes.filter((outcome) => outcome.kind === "RESOLVED").length,
    missing: outcomes.filter((outcome) => outcome.kind === "MISSING").length,
  };
}
