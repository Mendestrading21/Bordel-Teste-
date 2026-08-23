import {
  decimal,
  displayFractionDigits,
  type CurrencyCode,
  type DecimalString,
} from "@portfolio-lab/domain";

/**
 * Locale numérique de PortfolioLab : `de-CH`, y compris pour une interface en
 * français.
 *
 * Ce n'est pas un oubli. Les données ICU de `fr-CH` sont incohérentes entre
 * elles : la devise sort en `1 234.50` (séparateur décimal point) alors que les
 * pourcentages et les nombres simples sortent en `1,23%` et `1 234,5`
 * (séparateur décimal virgule). Afficher les deux sur le même écran donnerait
 * une valeur et sa variation avec deux conventions décimales différentes.
 *
 * `de-CH` est cohérent — `CHF 1'234.50`, `+1.23%`, `1'234.5` — et correspond à
 * la convention effectivement utilisée par les établissements financiers
 * suisses, apostrophe de milliers comprise. Les libellés, eux, restent en
 * français : seule la mise en forme des nombres suit cette locale.
 */
export const NUMERIC_LOCALE = "de-CH";

/**
 * Formatage monétaire pour l'affichage uniquement.
 *
 * L'arrondi est appliqué au dernier moment, sur une copie : la valeur métier
 * transportée reste la `DecimalString` d'origine, à pleine précision.
 */
export function formatMoney(
  value: DecimalString,
  currency: CurrencyCode,
  locale: string = NUMERIC_LOCALE,
): string {
  const digits = displayFractionDigits(currency);
  const rounded = decimal(value).toFixed(digits);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(rounded));
}

/**
 * Montant sans son code de devise.
 *
 * Réservé aux tableaux dont **toutes** les cellules sont dans la même devise et
 * dont l'en-tête la porte : répéter « CHF » à chaque ligne consomme la largeur
 * dont les chiffres ont besoin, et sur un écran de 390 px cela finit par
 * tronquer les montants eux-mêmes.
 *
 * Le nombre de décimales reste celui de la devise : un montant en CHF garde ses
 * deux décimales même sans son code.
 */
export function formatAmount(
  value: DecimalString,
  currency: CurrencyCode,
  locale: string = NUMERIC_LOCALE,
): string {
  const digits = displayFractionDigits(currency);
  const rounded = decimal(value).toFixed(digits);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(rounded));
}

/**
 * Formate une variation en pourcentage avec son signe explicite.
 *
 * `null` produit un tiret cadratin : une variation inconnue ne doit jamais être
 * rendue comme `0.00 %`, qui se lirait comme « stable ».
 */
export function formatPercent(
  value: DecimalString | null,
  locale: string = NUMERIC_LOCALE,
  fractionDigits = 2,
): string {
  if (value === null) {
    return "—";
  }
  // `toFixed` en amont borne la valeur transmise à Intl ; on garde deux
  // décimales de marge pour que l'arrondi final soit celui d'Intl.
  const asNumber = Number(decimal(value).toFixed(fractionDigits + 2));
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    signDisplay: "exceptZero",
  }).format(asNumber);
}

/**
 * Formate une quantité pour l'affichage.
 *
 * PostgreSQL renvoie `numeric(30, 12)` avec ses douze décimales : « 2 » revient
 * en « 2.000000000000 ». Les zéros de queue sont retirés — ils n'ajoutent
 * aucune information et rendent une quantité entière illisible — mais la
 * précision réelle est conservée quand elle existe : une fraction de fonds
 * comme « 150.75 » reste intacte.
 */
export function formatQuantity(
  value: DecimalString,
  locale: string = NUMERIC_LOCALE,
  maximumFractionDigits = 12,
): string {
  const parsed = decimal(value);
  // `toFixed()` sans argument évite la notation exponentielle ; le nettoyage
  // porte ensuite sur la représentation positionnelle.
  const positional = parsed.toFixed();
  const decimals = positional.includes(".")
    ? (positional.split(".")[1]?.replace(/0+$/, "").length ?? 0)
    : 0;

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(decimals, maximumFractionDigits),
  }).format(Number(positional));
}

/** Signe d'une décimale, pour choisir un token de couleur. */
export function signOf(value: DecimalString): "positive" | "negative" | "neutral" {
  const parsed = decimal(value);
  if (parsed.isPositive() && !parsed.isZero()) {
    return "positive";
  }
  if (parsed.isNegative() && !parsed.isZero()) {
    return "negative";
  }
  return "neutral";
}

/**
 * Extrait le séparateur décimal d'une locale.
 *
 * Sert au test d'invariant qui empêche de réintroduire une locale mélangeant
 * deux conventions entre montants et pourcentages.
 */
export function decimalSeparator(locale: string = NUMERIC_LOCALE): string {
  return (
    new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")
      ?.value ?? "."
  );
}
