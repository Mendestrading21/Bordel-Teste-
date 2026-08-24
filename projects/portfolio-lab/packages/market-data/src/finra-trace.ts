import { decimal, fromDecimal, type CurrencyCode, type DecimalString } from "@portfolio-lab/domain";

import { ProviderError, type NormalizedQuote } from "./contract.js";
import { providerDecimal } from "./provider-decimal.js";

export const FINRA_PROVIDER_ID = "finra-trace";

/**
 * FINRA TRACE — obligations américaines de gré à gré.
 *
 * TRACE n'est **pas** un carnet d'ordres. C'est un registre de transactions
 * déclarées : chaque ligne dit qu'un échange a eu lieu, à quel prix, à quel
 * moment. Il n'y a ni bid ni ask, et aucun engagement de qui que ce soit à
 * traiter à ce prix maintenant.
 *
 * Cette distinction n'est pas académique. Une obligation d'entreprise peut ne
 * pas s'échanger pendant des semaines : présenter son dernier prix comme un
 * cours courant valoriserait un portefeuille sur une transaction qui n'a plus
 * cours. C'est pourquoi la fraîcheur est ici **calculée depuis l'âge du
 * dernier échange**, et jamais annoncée par le fournisseur.
 */

/**
 * Seuils d'âge d'une transaction TRACE.
 *
 * Ils sont plus larges que ceux d'une action parce que l'illiquidité est
 * normale sur ce marché — mais ils existent, et ils finissent par déclarer la
 * donnée périmée plutôt que de la présenter indéfiniment comme un prix.
 */
export const TRACE_AGE_THRESHOLDS = {
  /** En deçà, la transaction est récente au regard de ce marché. */
  recentMs: 24 * 3_600_000,
  /** Au-delà, la donnée est explicitement périmée. */
  staleMs: 7 * 24 * 3_600_000,
} as const;

/**
 * Fraîcheur d'un prix obligataire, déduite de l'âge de la transaction.
 *
 * Jamais `LIVE` : aucun prix TRACE n'est un cours temps réel ferme, quelle que
 * soit sa fraîcheur. Le meilleur cas reste `DELAYED` — une transaction réelle,
 * récente, mais passée.
 */
export function traceFreshness(tradedAt: Date, now: Date): NormalizedQuote["freshness"] {
  const ageMs = now.getTime() - tradedAt.getTime();
  if (ageMs < 0) {
    /*
     * Une transaction dans le futur signale une horloge fausse ou un fuseau
     * mal interprété. La traiter comme récente masquerait le problème, et un
     * prix daté du futur ne périme jamais.
     */
    return "UNAVAILABLE";
  }
  if (ageMs <= TRACE_AGE_THRESHOLDS.recentMs) return "DELAYED";
  if (ageMs <= TRACE_AGE_THRESHOLDS.staleMs) return "EOD";
  return "STALE";
}

export type TraceTrade = {
  /** CUSIP ou identifiant FINRA du titre. */
  readonly identifier: string;
  /** Prix propre, exprimé **pour 100 de nominal**. */
  readonly pricePer100: DecimalString;
  /** Nominal échangé, quand FINRA le publie. Souvent masqué sur les gros blocs. */
  readonly size: DecimalString | null;
  readonly tradedAt: string;
  readonly currency: CurrencyCode;
  /** Source déclarée. TRACE agrège plusieurs lieux d'exécution. */
  readonly venue: string;
};

type RawTrade = {
  cusip?: unknown;
  isin?: unknown;
  price?: unknown;
  quantity?: unknown;
  executionDate?: unknown;
  executionTime?: unknown;
  tradeReportDate?: unknown;
  venue?: unknown;
};

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

/**
 * Normalise une ligne de dissémination TRACE.
 *
 * Le quantum échangé est **facultatif** et le rester est délibéré : FINRA
 * plafonne l'affichage des gros blocs — « 5MM+ » — pour ne pas révéler la
 * taille exacte. Interpréter ce plafond comme une quantité exacte serait faux ;
 * `null` dit qu'on ne sait pas.
 */
export function parseTraceTrade(raw: unknown, defaultCurrency: CurrencyCode = "USD"): TraceTrade {
  if (typeof raw !== "object" || raw === null) {
    throw new ProviderError("MALFORMED_RESPONSE", FINRA_PROVIDER_ID, "Transaction TRACE absente");
  }
  const trade = raw as RawTrade;

  const identifier = firstString(trade.cusip, trade.isin);
  if (identifier === null) {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      FINRA_PROVIDER_ID,
      "Transaction sans identifiant : un prix obligataire sans titre n'est rien",
    );
  }

  const pricePer100 = providerDecimal(trade.price, FINRA_PROVIDER_ID, "price");
  if (decimal(pricePer100).lessThanOrEqualTo(0)) {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      FINRA_PROVIDER_ID,
      `Prix obligataire non positif : ${pricePer100}`,
    );
  }

  const date = firstString(trade.executionDate, trade.tradeReportDate);
  if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      FINRA_PROVIDER_ID,
      `Date d'exécution illisible : ${JSON.stringify(trade.executionDate)}`,
    );
  }
  const time = firstString(trade.executionTime) ?? "00:00:00";
  const tradedAt = new Date(`${date}T${time}Z`);
  if (Number.isNaN(tradedAt.getTime())) {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      FINRA_PROVIDER_ID,
      `Horodatage d'exécution illisible : ${date}T${time}`,
    );
  }

  /*
   * Une quantité plafonnée — « 5MM+ », « 1MM+ » — n'est pas un nombre. La
   * convertir donnerait une taille exacte que FINRA a justement refusé de
   * publier.
   */
  const rawSize = trade.quantity;
  const size = ((): DecimalString | null => {
    if (rawSize === undefined || rawSize === null) return null;
    if (typeof rawSize === "string" && /\+|MM|K$/i.test(rawSize)) return null;
    try {
      return providerDecimal(rawSize, FINRA_PROVIDER_ID, "quantity");
    } catch {
      return null;
    }
  })();

  return {
    identifier,
    pricePer100,
    size,
    tradedAt: tradedAt.toISOString(),
    currency: defaultCurrency,
    venue: firstString(trade.venue) ?? "TRACE",
  };
}

/**
 * Convertit un prix TRACE en cotation normalisée.
 *
 * Le type de prix est toujours `LAST_TRADE` : c'est littéralement ce dont il
 * s'agit. Il n'est jamais `BID`, `ASK` ni `MID`, qui affirmeraient l'existence
 * d'une contrepartie prête à traiter.
 */
export function traceQuote(trade: TraceTrade, instrumentId: string, now: Date): NormalizedQuote {
  return {
    instrumentId,
    provider: FINRA_PROVIDER_ID,
    providerSymbol: trade.identifier,
    currency: trade.currency,
    price: trade.pricePer100,
    priceType: "LAST_TRADE",
    freshness: traceFreshness(new Date(trade.tradedAt), now),
    asOf: trade.tradedAt,
    receivedAt: now.toISOString(),
  };
}

/**
 * Valeur d'une position obligataire, à partir d'un prix pour 100 de nominal.
 *
 * Les obligations se cotent en pourcentage du nominal : un prix de `98.75` sur
 * 10 000 de nominal vaut 9 875, pas 98.75 × 10 000. Traiter le prix comme un
 * prix unitaire surévaluerait la position d'un facteur cent — une erreur qui
 * passe d'autant plus facilement qu'elle produit un nombre plausible.
 *
 * Cette fonction existe pour que la conversion soit nommée, testée et
 * impossible à oublier.
 */
export function bondPositionValue(
  pricePer100: DecimalString,
  faceValue: DecimalString,
): DecimalString {
  return fromDecimal(decimal(pricePer100).dividedBy(100).times(decimal(faceValue)));
}
