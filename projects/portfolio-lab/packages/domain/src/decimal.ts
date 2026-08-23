import { Decimal } from "decimal.js";

/**
 * Configuration décimale de PortfolioLab.
 *
 * Toute la comptabilité du produit passe par `decimal.js`. Les montants ne sont
 * jamais manipulés en `number` : la précision binaire IEEE-754 introduit des
 * écarts qui deviennent visibles dès qu'on additionne des dizaines de positions
 * ou qu'on applique un taux FX.
 *
 * `precision: 34` correspond au decimal128 IEEE-754 et couvre largement les
 * plages du modèle de données (`numeric(30, 12)` côté PostgreSQL).
 */
Decimal.set({
  precision: 34,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -30,
  toExpPos: 40,
});

export { Decimal };

/**
 * Représentation transportable d'une décimale exacte.
 *
 * Les frontières JSON (API, base, fixtures fournisseurs) échangent toujours des
 * chaînes : `JSON.parse` d'un nombre reconstruit un flottant et perd la valeur.
 */
export type DecimalString = string & { readonly __brand: "DecimalString" };

const DECIMAL_STRING_PATTERN = /^-?(?:\d+)(?:\.\d+)?$/;

/** `true` si la chaîne est une décimale finie sans notation exponentielle. */
export function isDecimalString(value: unknown): value is DecimalString {
  return typeof value === "string" && DECIMAL_STRING_PATTERN.test(value);
}

export class InvalidDecimalError extends Error {
  constructor(value: unknown) {
    super(`Valeur décimale invalide : ${JSON.stringify(value)}`);
    this.name = "InvalidDecimalError";
  }
}

/** Valide et marque une chaîne comme `DecimalString`. */
export function toDecimalString(value: unknown): DecimalString {
  if (!isDecimalString(value)) {
    throw new InvalidDecimalError(value);
  }
  return value;
}

/**
 * Construit une `Decimal` depuis une chaîne décimale.
 *
 * On refuse volontairement `number` en entrée : accepter `0.1 + 0.2` ici
 * réintroduirait l'erreur flottante que tout le package cherche à éviter.
 */
export function decimal(value: DecimalString | Decimal): Decimal {
  if (value instanceof Decimal) {
    return value;
  }
  const parsed = new Decimal(value);
  if (!parsed.isFinite()) {
    throw new InvalidDecimalError(value);
  }
  return parsed;
}

/**
 * Sérialise une `Decimal` en `DecimalString` en notation positionnelle.
 *
 * `toFixed()` sans argument évite la notation exponentielle que produirait
 * `toString()` sur les très petites ou très grandes valeurs.
 */
export function fromDecimal(value: Decimal): DecimalString {
  if (!value.isFinite()) {
    throw new InvalidDecimalError(value.toString());
  }
  return value.toFixed() as DecimalString;
}

/** Zéro exact, réutilisable comme valeur par défaut d'un agrégat. */
export const ZERO: DecimalString = "0" as DecimalString;

/** Somme exacte d'une liste de décimales. Une liste vide vaut `0`. */
export function sumDecimals(values: readonly DecimalString[]): DecimalString {
  return fromDecimal(
    values.reduce<Decimal>((total, value) => total.plus(decimal(value)), new Decimal(0)),
  );
}
