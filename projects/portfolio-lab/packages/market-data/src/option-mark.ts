import {
  decimal,
  fromDecimal,
  type DecimalString,
  type PriceType,
  type QuoteFreshness,
} from "@portfolio-lab/domain";

import type { NormalizedQuote } from "./contract.js";

/**
 * Choix du prix de valorisation d'une option.
 *
 * `MARKET_DATA.md` fixe la règle : midpoint si bid et ask sont présents, frais
 * et cohérents ; sinon dernier trade frais ; en dernier recours le dernier mark
 * connu, marqué `STALE`.
 *
 * Ce module existe séparément parce que le choix du mark est **la** décision qui
 * détermine la valeur d'une position d'option, et qu'il doit être auditable :
 * chaque résultat porte la méthode retenue et la raison de l'avoir retenue.
 */

export type MarkMethod =
  /** Milieu de fourchette bid/ask. */
  | "MID"
  /** Dernier échange, quand la fourchette est inexploitable. */
  | "LAST_TRADE"
  /** Dernier mark connu, conservé faute de mieux. */
  | "STALE_MARK";

export type MarkRejection =
  "NO_BID_ASK" | "CROSSED_SPREAD" | "ZERO_QUOTE" | "SPREAD_TOO_WIDE" | "STALE_QUOTE";

export type OptionMark = {
  readonly price: DecimalString;
  readonly method: MarkMethod;
  readonly priceType: PriceType;
  readonly freshness: QuoteFreshness;
  readonly asOf: string;
  /**
   * Pourquoi la méthode précédente a été écartée.
   *
   * Vide quand le midpoint a été retenu. Affiché dans la fiche : une option
   * valorisée par son dernier trade sans explication laisserait croire à une
   * fourchette absente alors qu'elle peut être simplement aberrante.
   */
  readonly rejections: readonly MarkRejection[];
};

export type OptionMarkFailure = {
  readonly reason: "NO_USABLE_PRICE";
  readonly rejections: readonly MarkRejection[];
};

export type MarkOptions = {
  /** Instant d'évaluation, injecté pour rendre les tests déterministes. */
  readonly now: Date;
  /**
   * Âge au-delà duquel une fourchette n'est plus jugée exploitable.
   *
   * Une option peu liquide peut afficher un bid/ask vieux de plusieurs heures ;
   * calculer un midpoint dessus donnerait une précision illusoire.
   */
  readonly maxQuoteAgeMs: number;
  /**
   * Largeur de fourchette au-delà de laquelle le midpoint est refusé, en
   * fraction du milieu.
   *
   * Sur une option très illiquide, un bid à 0.05 et un ask à 5.00 donnent un
   * midpoint de 2.525 qu'aucune transaction ne validerait.
   */
  readonly maxRelativeSpread: number;
};

export const DEFAULT_MARK_OPTIONS: Omit<MarkOptions, "now"> = {
  maxQuoteAgeMs: 15 * 60_000,
  // 50 % du milieu : au-delà, la fourchette ne dit plus grand-chose du prix.
  maxRelativeSpread: 0.5,
};

/**
 * Détermine le prix de valorisation d'une option.
 *
 * Renvoie un échec explicite plutôt qu'un prix de repli quand rien n'est
 * exploitable : le moteur du Lot 03 sait exposer une position non valorisée, et
 * c'est infiniment préférable à un chiffre inventé.
 */
export function markOption(
  quote: NormalizedQuote,
  options: MarkOptions,
):
  | { readonly ok: true; readonly mark: OptionMark }
  | {
      readonly ok: false;
      readonly failure: OptionMarkFailure;
    } {
  const rejections: MarkRejection[] = [];

  const quoteAge = options.now.getTime() - Date.parse(quote.asOf);
  const quoteIsFresh = Number.isFinite(quoteAge) && quoteAge <= options.maxQuoteAgeMs;

  // ---------------------------------------------------------------------------
  // 1. Midpoint, si la fourchette est présente, fraîche et cohérente.
  // ---------------------------------------------------------------------------
  if (quote.bid === undefined || quote.ask === undefined) {
    rejections.push("NO_BID_ASK");
  } else {
    const bid = decimal(quote.bid);
    const ask = decimal(quote.ask);

    if (bid.lessThanOrEqualTo(0) || ask.lessThanOrEqualTo(0)) {
      // Un bid à zéro est courant sur une option très hors de la monnaie ; le
      // midpoint qui en résulterait n'aurait aucun sens.
      rejections.push("ZERO_QUOTE");
    } else if (bid.greaterThan(ask)) {
      rejections.push("CROSSED_SPREAD");
    } else if (!quoteIsFresh) {
      rejections.push("STALE_QUOTE");
    } else {
      const mid = bid.plus(ask).div(2);
      const relativeSpread = ask.minus(bid).div(mid);

      if (relativeSpread.greaterThan(options.maxRelativeSpread)) {
        rejections.push("SPREAD_TOO_WIDE");
      } else {
        return {
          ok: true,
          mark: {
            price: fromDecimal(mid),
            method: "MID",
            priceType: "MID",
            freshness: quote.freshness,
            asOf: quote.asOf,
            rejections: [],
          },
        };
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Dernier trade, s'il est frais.
  // ---------------------------------------------------------------------------
  const last = decimal(quote.price);
  if (last.greaterThan(0) && quoteIsFresh) {
    return {
      ok: true,
      mark: {
        price: quote.price,
        method: "LAST_TRADE",
        priceType: "LAST_TRADE",
        freshness: quote.freshness,
        asOf: quote.asOf,
        rejections,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Dernier mark connu, explicitement périmé.
  // ---------------------------------------------------------------------------
  if (last.greaterThan(0)) {
    return {
      ok: true,
      mark: {
        price: quote.price,
        method: "STALE_MARK",
        priceType: "LAST_TRADE",
        // Le statut est dégradé quoi qu'annonce le fournisseur : une option peu
        // liquide conserve un dernier trade qui peut dater de plusieurs jours.
        freshness: "STALE",
        asOf: quote.asOf,
        rejections: [...rejections, "STALE_QUOTE"],
      },
    };
  }

  return { ok: false, failure: { reason: "NO_USABLE_PRICE", rejections } };
}

/** Libellés utilisateur des méthodes de valorisation. */
export const MARK_METHOD_LABEL: Readonly<Record<MarkMethod, string>> = {
  MID: "Milieu de fourchette bid/ask",
  LAST_TRADE: "Dernier échange",
  STALE_MARK: "Dernier prix connu, périmé",
};

/** Libellés utilisateur des motifs de rejet. */
export const MARK_REJECTION_LABEL: Readonly<Record<MarkRejection, string>> = {
  NO_BID_ASK: "aucune fourchette bid/ask publiée",
  CROSSED_SPREAD: "fourchette incohérente, bid supérieur à ask",
  ZERO_QUOTE: "bid ou ask à zéro",
  SPREAD_TOO_WIDE: "fourchette trop large pour être significative",
  STALE_QUOTE: "cotation trop ancienne",
};

/**
 * Jours calendaires restant avant l'échéance.
 *
 * Calendaires et non ouvrés : une option expire à une date fixe, week-end ou
 * non. Une valeur négative signale un contrat déjà expiré, que l'interface doit
 * signaler plutôt que valoriser normalement.
 */
export function daysToExpiration(expiration: string, now: Date): number {
  const expiry = Date.parse(`${expiration}T00:00:00.000Z`);
  if (Number.isNaN(expiry)) {
    return Number.NaN;
  }
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((expiry - today) / 86_400_000);
}

/** `true` si le contrat est arrivé à échéance. */
export function isExpired(expiration: string, now: Date): boolean {
  const remaining = daysToExpiration(expiration, now);
  return Number.isFinite(remaining) && remaining < 0;
}
