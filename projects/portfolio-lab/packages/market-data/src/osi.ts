import { decimal, toDecimalString, type DecimalString } from "@portfolio-lab/domain";

/**
 * Symbole OSI — Options Symbology Initiative.
 *
 * Format canonique des options américaines, sur 21 caractères :
 *
 * ```text
 *   AAPL  270115C00200000
 *   ^^^^^^ ^^^^^^ ^^^^^^^^
 *   racine échéance  strike
 *   6 car.  6 car.   8 car.
 * ```
 *
 * - racine : ticker du sous-jacent, complété par des espaces à droite ;
 * - échéance : `AAMMJJ` ;
 * - type : `C` ou `P` ;
 * - strike : millièmes, sur 8 chiffres — `00200000` vaut 200.000.
 *
 * Ce format est implémenté ici plutôt que délégué à un fournisseur parce qu'il
 * est **la** clé d'identité d'un contrat. Deux contrats qui ne diffèrent que par
 * le strike ont des valeurs sans rapport ; se tromper d'un facteur mille sur les
 * millièmes produirait une position absurde mais silencieuse.
 */

export type OptionType = "CALL" | "PUT";

export type OsiComponents = {
  readonly underlying: string;
  readonly expiration: string;
  readonly optionType: OptionType;
  readonly strike: DecimalString;
};

const OSI_PATTERN = /^([A-Z0-9 .]{1,6})\s*(\d{6})([CP])(\d{8})$/;

export class OsiFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OsiFormatError";
  }
}

/**
 * Construit un symbole OSI.
 *
 * Le strike est converti en millièmes par arithmétique décimale exacte : passer
 * par un flottant produirait `199999` au lieu de `200000` sur certaines valeurs,
 * et le contrat résultant n'existerait pas.
 */
export function buildOsiSymbol(components: OsiComponents): string {
  const { underlying, expiration, optionType, strike } = components;

  if (!/^[A-Z0-9.]{1,6}$/.test(underlying)) {
    throw new OsiFormatError(`Racine de sous-jacent invalide : ${underlying}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiration)) {
    throw new OsiFormatError(`Échéance attendue au format ISO : ${expiration}`);
  }

  const strikeDecimal = decimal(strike);
  if (strikeDecimal.lessThanOrEqualTo(0)) {
    throw new OsiFormatError("Le strike doit être strictement positif");
  }

  const thousandths = strikeDecimal.times(1000);
  if (!thousandths.isInteger()) {
    // Le format OSI ne peut pas représenter un strike plus fin que le millième.
    throw new OsiFormatError(`Strike non représentable en millièmes : ${strike}`);
  }
  if (thousandths.greaterThan(99_999_999)) {
    throw new OsiFormatError(`Strike hors plage OSI : ${strike}`);
  }

  const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiration) as RegExpExecArray;

  return (
    underlying.padEnd(6, " ") +
    `${(year as string).slice(2)}${month}${day}` +
    (optionType === "CALL" ? "C" : "P") +
    thousandths.toFixed(0).padStart(8, "0")
  );
}

/**
 * Analyse un symbole OSI.
 *
 * Renvoie `null` plutôt que de lever : un symbole illisible reçu d'un
 * fournisseur est une donnée à écarter, pas une erreur de programmation.
 */
export function parseOsiSymbol(symbol: string): OsiComponents | null {
  const match = OSI_PATTERN.exec(symbol.toUpperCase());
  if (match === null) {
    return null;
  }

  const [, root, date, type, strikeRaw] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
  ];

  const year = Number(date.slice(0, 2));
  const month = date.slice(2, 4);
  const day = date.slice(4, 6);

  /*
   * OSI code l'année sur deux chiffres. La convention retenue — 20xx — couvre
   * 2000 à 2099. Aucune option listée n'a d'échéance antérieure à 2000, et le
   * format aura disparu bien avant 2100.
   */
  const fullYear = 2000 + year;
  const expiration = `${fullYear}-${month}-${day}`;

  // Vérifie que la date existe réellement : `270230` passerait le motif.
  const parsed = new Date(`${expiration}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== expiration) {
    return null;
  }

  const strike = decimal(toDecimalString(strikeRaw)).div(1000);

  return {
    underlying: root.trim(),
    expiration,
    optionType: type === "C" ? "CALL" : "PUT",
    strike: toDecimalString(strike.toFixed()),
  };
}

/** `true` si les deux symboles désignent le même contrat. */
export function isSameContract(a: string, b: string): boolean {
  const left = parseOsiSymbol(a);
  const right = parseOsiSymbol(b);
  if (left === null || right === null) {
    return false;
  }
  return (
    left.underlying === right.underlying &&
    left.expiration === right.expiration &&
    left.optionType === right.optionType &&
    // Comparaison décimale : « 200 » et « 200.000 » désignent le même strike.
    decimal(left.strike).equals(decimal(right.strike))
  );
}
