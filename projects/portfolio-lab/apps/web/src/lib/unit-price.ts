import { decimal, toDecimalString, type DecimalString } from "@portfolio-lab/domain";

/**
 * Reconstitue le cours unitaire à partir de la valorisation.
 *
 * Le moteur conserve la valeur de marché, pas le cours : `marketValueNative`
 * vaut `quantité × multiplicateur × cours`. La division inverse redonne donc
 * **exactement** le cours retenu, sans ré-interroger le fournisseur ni risquer
 * d'afficher un chiffre plus récent que celui qui a servi au calcul — la fiche
 * resterait alors incohérente avec son propre total.
 *
 * Retourne `null` lorsque le dénominateur est nul : une position soldée ou un
 * multiplicateur absent ne permettent aucun cours, et zéro serait un mensonge.
 * Un dénominateur négatif est en revanche légitime — une position vendue à
 * découvert garde un cours positif.
 */
export function unitPriceFromValue(
  marketValueNative: DecimalString,
  quantity: DecimalString,
  multiplier: DecimalString,
): DecimalString | null {
  const denominator = decimal(quantity).times(decimal(multiplier));
  if (denominator.isZero()) return null;
  return toDecimalString(decimal(marketValueNative).dividedBy(denominator).toFixed());
}
