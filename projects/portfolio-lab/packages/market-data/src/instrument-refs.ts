import type { AssetType } from "@portfolio-lab/domain";

import type { InstrumentReference } from "./contract.js";
import { parseOsiSymbol } from "./osi.js";
import type { QuoteRequest } from "./quote-refresh.js";

/**
 * Traduction du référentiel local en références fournisseur.
 *
 * Un instrument n'est interrogeable que s'il porte un identifiant enregistré.
 * Le nom ne suffit pas et ne servira jamais de repli : chercher « AAPL » chez
 * un fournisseur renvoie aussi AAPU, AAPB, AAPD — des produits à levier qui ne
 * sont pas Apple. Un instrument sans identifiant est donc déclaré non
 * identifiable, avec son motif, plutôt que résolu au jugé.
 */

/** Une ligne de `instrument_identifiers`, telle que lue en base. */
export type IdentifierRow = {
  readonly instrumentId: string;
  readonly identifierType: "TICKER" | "ISIN" | "FIGI" | "PROVIDER_SYMBOL" | "OSI";
  readonly identifierValue: string;
  readonly provider: string | null;
  readonly exchangeMic: string | null;
};

export type InstrumentRow = {
  readonly instrumentId: string;
  readonly assetType: AssetType;
  readonly exchangeMic: string | null;
};

export type UnidentifiedInstrument = {
  readonly instrumentId: string;
  readonly reason: string;
};

export type InstrumentRefResult = {
  readonly requests: readonly QuoteRequest[];
  readonly unidentified: readonly UnidentifiedInstrument[];
};

/**
 * Ordre de préférence des identifiants.
 *
 * `PROVIDER_SYMBOL` d'abord : c'est le seul qui désigne l'instrument **chez un
 * fournisseur donné**, sans traduction. `ISIN` ensuite, parce qu'il est
 * mondialement unique. `TICKER` seulement après : un même ticker désigne des
 * sociétés différentes selon la place. `FIGI` en dernier, faute d'adaptateur
 * qui le consomme aujourd'hui.
 */
const PREFERENCE: readonly IdentifierRow["identifierType"][] = [
  "PROVIDER_SYMBOL",
  "ISIN",
  "TICKER",
  "FIGI",
];

const NO_IDENTIFIER =
  "Aucun identifiant fournisseur enregistré pour cet instrument. " +
  "Le nom seul ne permet pas de le désigner sans risque de confusion.";

const BAD_OSI =
  "Le symbole d'option enregistré n'est pas un OSI valide : " +
  "échéance et prix d'exercice ne peuvent pas en être déduits.";

function toReference(row: IdentifierRow): InstrumentReference | null {
  switch (row.identifierType) {
    case "PROVIDER_SYMBOL":
      // Sans nom de fournisseur, un symbole propriétaire ne désigne rien : il
      // n'existe que dans le référentiel de celui qui l'a émis.
      if (row.provider === null || row.provider.trim() === "") return null;
      return { kind: "PROVIDER_SYMBOL", provider: row.provider, symbol: row.identifierValue };
    case "ISIN":
      return { kind: "ISIN", isin: row.identifierValue };
    case "TICKER":
      return row.exchangeMic === null
        ? { kind: "TICKER", ticker: row.identifierValue }
        : { kind: "TICKER", ticker: row.identifierValue, exchangeMic: row.exchangeMic };
    case "FIGI":
      return { kind: "FIGI", figi: row.identifierValue };
    case "OSI": {
      const components = parseOsiSymbol(row.identifierValue);
      if (components === null) return null;
      return {
        kind: "OPTION",
        underlying: components.underlying,
        optionType: components.optionType,
        expiration: components.expiration,
        strike: components.strike,
      };
    }
  }
}

/**
 * Construit les requêtes de cours à partir du référentiel local.
 *
 * Les instruments sont rendus dans l'ordre reçu, et ceux qu'on ne sait pas
 * désigner sont listés à part avec leur motif — jamais omis. Un instrument qui
 * disparaît des deux listes serait indiscernable d'un instrument dont le cours
 * n'a simplement pas encore été demandé.
 */
export function buildQuoteRequests(
  instruments: readonly InstrumentRow[],
  identifiers: readonly IdentifierRow[],
): InstrumentRefResult {
  const byInstrument = new Map<string, IdentifierRow[]>();
  for (const row of identifiers) {
    const bucket = byInstrument.get(row.instrumentId);
    if (bucket === undefined) byInstrument.set(row.instrumentId, [row]);
    else bucket.push(row);
  }

  const requests: QuoteRequest[] = [];
  const unidentified: UnidentifiedInstrument[] = [];

  for (const instrument of instruments) {
    const rows = byInstrument.get(instrument.instrumentId) ?? [];

    /*
     * Une option se désigne par son OSI et par rien d'autre.
     *
     * Se rabattre sur le ticker du sous-jacent donnerait le cours de l'action
     * au lieu de celui du contrat : un chiffre plausible, du bon ordre de
     * grandeur, et complètement faux. C'est exactement le genre d'erreur qu'un
     * écran ne rattrape jamais.
     */
    if (instrument.assetType === "OPTION") {
      const osi = rows.find((row) => row.identifierType === "OSI");
      if (osi === undefined) {
        unidentified.push({ instrumentId: instrument.instrumentId, reason: NO_IDENTIFIER });
        continue;
      }
      const reference = toReference(osi);
      if (reference === null) {
        unidentified.push({ instrumentId: instrument.instrumentId, reason: BAD_OSI });
        continue;
      }
      requests.push({
        instrumentId: instrument.instrumentId,
        reference,
        assetType: instrument.assetType,
        exchangeMic: instrument.exchangeMic,
      });
      continue;
    }

    let reference: InstrumentReference | null = null;
    for (const type of PREFERENCE) {
      const candidate = rows.find((row) => row.identifierType === type);
      if (candidate === undefined) continue;
      reference = toReference(candidate);
      if (reference !== null) break;
    }

    if (reference === null) {
      unidentified.push({ instrumentId: instrument.instrumentId, reason: NO_IDENTIFIER });
      continue;
    }

    requests.push({
      instrumentId: instrument.instrumentId,
      reference,
      assetType: instrument.assetType,
      exchangeMic: instrument.exchangeMic,
    });
  }

  return { requests, unidentified };
}

/** Un symbole suivi en temps réel, et l'instrument qu'il désigne. */
export type SubscriptionSymbol = {
  readonly symbol: string;
  readonly instrumentId: string;
};

/**
 * Choisit **un** symbole par instrument, pour l'abonnement temps réel.
 *
 * Un instrument porte souvent plusieurs identifiants — un ticker et un ISIN,
 * par exemple. S'abonner aux deux consommerait deux places sur les cinquante
 * qu'une connexion accepte, pour un seul cours utile : au-delà du plafond, les
 * symboles excédentaires ne sont pas refusés, ils ne cotent simplement jamais.
 *
 * La préférence est la même que celle des requêtes REST. Deux ordres
 * différents feraient suivre un instrument sous un symbole par le flux et sous
 * un autre par la scrutation, avec deux cours qui ne se recouvriraient pas
 * toujours — et rien à l'écran pour expliquer lequel croire.
 */
export function pickSubscriptionSymbols(
  identifiers: readonly IdentifierRow[],
): readonly SubscriptionSymbol[] {
  const best = new Map<string, { rank: number; symbol: string }>();

  for (const row of identifiers) {
    const rank = PREFERENCE.indexOf(row.identifierType);
    // `OSI` n'est pas dans la préférence : une option ne se suit pas par le
    // symbole de son sous-jacent, et aucun canal ne la diffuse ici.
    if (rank === -1) continue;
    if (row.identifierType === "PROVIDER_SYMBOL" && (row.provider ?? "") === "") continue;

    const current = best.get(row.instrumentId);
    if (current === undefined || rank < current.rank) {
      best.set(row.instrumentId, { rank, symbol: row.identifierValue });
    }
  }

  return [...best.entries()]
    .map(([instrumentId, entry]) => ({ instrumentId, symbol: entry.symbol }))
    // Trié pour que deux appels identiques produisent le même jeton.
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}
