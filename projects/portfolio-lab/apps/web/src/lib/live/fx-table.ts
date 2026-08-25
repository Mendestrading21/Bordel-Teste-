import { buildFxTable, type FxRate, type FxTable } from "@portfolio-lab/portfolio-engine";
import type { FxRefreshReport } from "@portfolio-lab/market-data";

/**
 * Traduit un rapport de taux en table utilisable par le moteur de valorisation.
 *
 * Pur et sans accès réseau, pour que la règle qui suit soit réellement
 * vérifiable : **un taux manquant ne se remplace pas**. Il est simplement
 * absent de la table, et le moteur rend alors les positions de cette devise non
 * valorisées, avec leur motif.
 *
 * L'alternative — retomber sur un taux de fixture, ou sur le dernier connu —
 * produirait un total plausible et faux, que rien à l'écran ne distinguerait
 * d'un total correct. C'est le seul cas de ce produit où une valeur manquante
 * est franchement préférable à une valeur approchée.
 */
export function fxTableFromReport(report: FxRefreshReport): FxTable {
  const rates: FxRate[] = [];

  for (const outcome of report.outcomes) {
    if (outcome.kind !== "RESOLVED") continue;
    rates.push({
      from: outcome.fx.base,
      to: outcome.fx.quote,
      rate: outcome.fx.rate,
      asOf: outcome.fx.asOf,
      provider: outcome.fx.provider,
      // La fraîcheur du taux est reprise telle quelle : le moteur la combine
      // avec celle du prix et retient la pire des deux.
      freshness: outcome.fx.freshness,
    });
  }

  return buildFxTable(rates);
}
