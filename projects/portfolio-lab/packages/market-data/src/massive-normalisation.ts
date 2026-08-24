import { decimal, fromDecimal, type DecimalString } from "@portfolio-lab/domain";

import type { ChainContract, OptionChain } from "./option-chain.js";
import { ProviderError, type OptionContractDetails } from "./contract.js";
import { buildOsiSymbol, parseOsiSymbol, type OptionType } from "./osi.js";
import { providerDecimal } from "./provider-decimal.js";

export const MASSIVE_PROVIDER_ID = "massive";

/**
 * Normalisation des charges utiles Massive.
 *
 * Isolée du transport HTTP pour une raison précise : les chemins d'endpoint et
 * la forme exacte des réponses n'ont **pas** pu être confrontés à l'API réelle
 * depuis cet environnement, dont la politique de sortie réseau refuse
 * `massive.com`, et aucune clé n'est disponible. Ce qui est ici est en revanche
 * entièrement vérifiable et vérifié : les règles métier que la donnée doit
 * respecter une fois lue, quelle que soit la forme dans laquelle elle arrive.
 *
 * Le jour où l'accès existera, corriger la forme du fil ne touchera que la
 * fonction d'extraction, jamais les invariants ci-dessous.
 */

type RawContract = {
  ticker?: unknown;
  contract_type?: unknown;
  expiration_date?: unknown;
  strike_price?: unknown;
  shares_per_contract?: unknown;
  exercise_style?: unknown;
  primary_exchange?: unknown;
  underlying_ticker?: unknown;
};

function optionTypeFrom(value: unknown): OptionType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "call" || normalized === "c") return "CALL";
  if (normalized === "put" || normalized === "p") return "PUT";
  return null;
}

function exerciseStyleFrom(value: unknown): OptionContractDetails["exerciseStyle"] {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "american") return "AMERICAN";
  if (normalized === "european") return "EUROPEAN";
  return null;
}

/**
 * Construit le détail canonique d'un contrat d'option.
 *
 * Trois refus délibérés, chacun correspondant à une erreur silencieuse
 * observée dans ce domaine :
 *
 * 1. **Le multiplicateur n'a pas de valeur par défaut.** Un contrat ajusté
 *    après un split ne vaut pas 100 parts. Supposer 100 fausse la valorisation
 *    d'un facteur entier sans rien casser visiblement — l'erreur la plus chère
 *    du domaine. Absent, on échoue.
 * 2. **Un symbole OSI qui contredit les attributs est rejeté.** Si le
 *    fournisseur publie `AAPL 260116C00150000` mais annonce un strike de 160,
 *    l'un des deux est faux ; choisir en silence reviendrait à parier.
 * 3. **L'échéance doit être une date ISO complète.** Une échéance partielle
 *    rendrait deux maturités indiscernables.
 */
export function massiveOptionContract(raw: unknown): OptionContractDetails {
  if (typeof raw !== "object" || raw === null) {
    throw new ProviderError("MALFORMED_RESPONSE", MASSIVE_PROVIDER_ID, "Contrat option absent");
  }
  const contract = raw as RawContract;

  const optionType = optionTypeFrom(contract.contract_type);
  if (optionType === null) {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      MASSIVE_PROVIDER_ID,
      "Type de contrat illisible : ni call ni put",
    );
  }

  const expiration = typeof contract.expiration_date === "string" ? contract.expiration_date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiration)) {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      MASSIVE_PROVIDER_ID,
      `Échéance illisible : ${JSON.stringify(contract.expiration_date)}`,
    );
  }

  const strike = providerDecimal(contract.strike_price, MASSIVE_PROVIDER_ID, "strike_price");

  if (contract.shares_per_contract === undefined || contract.shares_per_contract === null) {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      MASSIVE_PROVIDER_ID,
      "Multiplicateur absent : un contrat ajusté après un split ne vaut pas 100, " +
        "et le supposer fausserait la valorisation d'un facteur entier",
    );
  }
  const multiplier = providerDecimal(
    contract.shares_per_contract,
    MASSIVE_PROVIDER_ID,
    "shares_per_contract",
  );
  if (decimal(multiplier).lessThanOrEqualTo(0)) {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      MASSIVE_PROVIDER_ID,
      `Multiplicateur non strictement positif : ${multiplier}`,
    );
  }

  const underlyingSymbol =
    typeof contract.underlying_ticker === "string" ? contract.underlying_ticker : "";
  if (underlyingSymbol === "") {
    throw new ProviderError("MALFORMED_RESPONSE", MASSIVE_PROVIDER_ID, "Sous-jacent absent");
  }

  const published = typeof contract.ticker === "string" ? contract.ticker.replace(/^O:/, "") : null;
  const osiSymbol = reconcileOsi(published, {
    underlying: underlyingSymbol,
    expiration,
    optionType,
    strike,
  });

  return {
    underlyingSymbol,
    optionType,
    expiration,
    strike,
    multiplier,
    osiSymbol,
    exerciseStyle: exerciseStyleFrom(contract.exercise_style),
    settlementType: null,
  };
}

/**
 * Vérifie qu'un symbole OSI publié décrit bien le contrat annoncé.
 *
 * Lève si le symbole publié contredit les attributs : c'est le seul cas où
 * deux sources d'une même vérité divergent, et garder l'une des deux en
 * silence reviendrait à parier sur celle qui a raison.
 *
 * En sortie, la **forme canonique** est préférée à la forme publiée. OSI cadre
 * la racine sur six caractères — `AAPL  260116C00150000` — là où les
 * fournisseurs publient couramment la forme compacte. Renvoyer celle qui est
 * arrivée donnerait deux représentations du même contrat selon la source, et
 * tout rapprochement entre fournisseurs échouerait sur une différence
 * d'espaces.
 */
function reconcileOsi(
  published: string | null,
  expected: {
    underlying: string;
    expiration: string;
    optionType: OptionType;
    strike: DecimalString;
  },
): string | null {
  const rebuilt = ((): string | null => {
    try {
      return buildOsiSymbol({
        underlying: expected.underlying,
        expiration: expected.expiration,
        optionType: expected.optionType,
        strike: expected.strike,
      });
    } catch {
      // Un sous-jacent trop long ou un strike hors plage OSI : le symbole
      // canonique n'existe pas, ce qui est une information en soi.
      return null;
    }
  })();

  if (published === null) return rebuilt;

  const parsed = parseOsiSymbol(published);
  if (parsed === null) {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      MASSIVE_PROVIDER_ID,
      `Symbole d'option illisible : ${published}`,
    );
  }

  const disagreements: string[] = [];
  if (parsed.optionType !== expected.optionType) {
    disagreements.push(`type ${parsed.optionType} vs ${expected.optionType}`);
  }
  if (parsed.expiration !== expected.expiration) {
    disagreements.push(`échéance ${parsed.expiration} vs ${expected.expiration}`);
  }
  if (!decimal(parsed.strike).equals(decimal(expected.strike))) {
    disagreements.push(`strike ${parsed.strike} vs ${expected.strike}`);
  }

  if (disagreements.length > 0) {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      MASSIVE_PROVIDER_ID,
      `Le symbole ${published} contredit les attributs du contrat : ${disagreements.join(", ")}`,
    );
  }

  // Forme canonique de préférence ; la forme publiée sert de secours quand la
  // racine sort des bornes qu'OSI sait encoder.
  return rebuilt ?? published;
}

type RawQuoteSide = { bid?: unknown; ask?: unknown; last?: unknown; open_interest?: unknown };

/**
 * Assemble une ligne de chaîne d'options.
 *
 * Le point milieu n'est **pas** calculé ici et n'est pas non plus stocké : une
 * fourchette dont un seul côté existe n'a pas de milieu, et en inventer un
 * donnerait un prix qui n'a jamais existé. Le choix du prix de valorisation
 * appartient à `option-mark.ts`, qui sait dire lequel il a retenu.
 */
export function massiveChainContract(rawContract: unknown, rawQuote: unknown): ChainContract {
  const details = massiveOptionContract(rawContract);
  const quote = (typeof rawQuote === "object" && rawQuote !== null ? rawQuote : {}) as RawQuoteSide;

  const optional = (value: unknown, field: string): DecimalString | undefined =>
    value === undefined || value === null
      ? undefined
      : providerDecimal(value, MASSIVE_PROVIDER_ID, field);

  const openInterest =
    typeof quote.open_interest === "number" && Number.isFinite(quote.open_interest)
      ? quote.open_interest
      : undefined;

  return {
    providerSymbol: details.osiSymbol ?? `${details.underlyingSymbol}:${details.expiration}`,
    osiSymbol: details.osiSymbol,
    optionType: details.optionType,
    expiration: details.expiration,
    strike: details.strike,
    multiplier: details.multiplier,
    currency: "USD",
    ...(optional(quote.bid, "bid") === undefined ? {} : { bid: optional(quote.bid, "bid")! }),
    ...(optional(quote.ask, "ask") === undefined ? {} : { ask: optional(quote.ask, "ask")! }),
    ...(optional(quote.last, "last") === undefined ? {} : { last: optional(quote.last, "last")! }),
    ...(openInterest === undefined ? {} : { openInterest }),
  };
}

/**
 * Assemble une chaîne d'options complète.
 *
 * Les contrats illisibles sont **écartés avec leur raison** plutôt qu'ignorés :
 * une chaîne à laquelle il manque trois strikes sans que rien ne le dise mène à
 * conclure que le marché ne les cote pas.
 */
export function massiveOptionChain(
  underlyingSymbol: string,
  rows: readonly { contract: unknown; quote?: unknown }[],
  asOf: string,
): { chain: OptionChain; rejected: readonly { raw: unknown; reason: string }[] } {
  const contracts: ChainContract[] = [];
  const rejected: { raw: unknown; reason: string }[] = [];

  for (const row of rows) {
    try {
      contracts.push(massiveChainContract(row.contract, row.quote));
    } catch (error) {
      rejected.push({
        raw: row.contract,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { chain: { underlyingSymbol, contracts, asOf }, rejected };
}

/* ------------------------------------------------------------------ futures */

export type FuturesContract = {
  /** Racine du contrat : `ES`, `NQ`, `CL`. */
  readonly root: string;
  /** Échéance exacte, `AAAA-MM`. Deux maturités ne sont jamais fusionnées. */
  readonly maturity: string;
  readonly providerSymbol: string;
  readonly currency: string;
  readonly multiplier: DecimalString | null;
};

const MONTH_CODES: Readonly<Record<string, string>> = {
  F: "01",
  G: "02",
  H: "03",
  J: "04",
  K: "05",
  M: "06",
  N: "07",
  Q: "08",
  U: "09",
  V: "10",
  X: "11",
  Z: "12",
};

/**
 * Décompose un symbole de future en racine et échéance.
 *
 * Les futures utilisent un code de mois d'une lettre suivi de l'année :
 * `ESZ26` est le S&P 500 de décembre 2026. Traiter `ESZ26` et `ESH27` comme le
 * même instrument — ce que fait n'importe quel rapprochement par racine seule —
 * fusionnerait deux contrats aux prix et aux échéances différents.
 *
 * L'année à deux chiffres est résolue par rapport à l'année courante : un
 * contrat expire dans un futur proche, jamais un siècle plus tôt.
 */
export function parseFuturesSymbol(symbol: string, currentYear: number): FuturesContract | null {
  const match = /^([A-Z0-9]{1,3})([FGHJKMNQUVXZ])(\d{1,2})$/.exec(symbol.trim().toUpperCase());
  if (match === null) return null;

  const [, root, monthCode, yearDigits] = match;
  if (root === undefined || monthCode === undefined || yearDigits === undefined) return null;

  const month = MONTH_CODES[monthCode];
  if (month === undefined) return null;

  const century = Math.floor(currentYear / 100) * 100;
  const twoDigit = Number.parseInt(yearDigits.padStart(2, "0"), 10);
  let year = century + twoDigit;
  // Un contrat coté aujourd'hui n'expire pas dans le passé lointain : si
  // l'année résolue est trop ancienne, c'est le siècle suivant.
  if (year < currentYear - 1) year += 100;

  return {
    root,
    maturity: `${year}-${month}`,
    providerSymbol: symbol.trim().toUpperCase(),
    currency: "USD",
    multiplier: null,
  };
}

/**
 * `true` si deux symboles désignent le **même** contrat, échéance comprise.
 *
 * Existe pour rendre impossible le rapprochement par racine seule.
 */
export function isSameFuturesContract(a: string, b: string, currentYear: number): boolean {
  const left = parseFuturesSymbol(a, currentYear);
  const right = parseFuturesSymbol(b, currentYear);
  if (left === null || right === null) return false;
  return left.root === right.root && left.maturity === right.maturity;
}

export { fromDecimal };
