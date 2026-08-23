import {
  decimal,
  Decimal,
  fromDecimal,
  isValuable,
  type CurrencyCode,
  type DecimalString,
  type PriceType,
  type QuoteFreshness,
} from "@portfolio-lab/domain";

/**
 * Moteur de valorisation.
 *
 * Le module est **pur** : aucune entrée/sortie, aucune horloge implicite, aucun
 * accès réseau. Toute donnée nécessaire est passée en argument, ce qui rend
 * chaque résultat reproductible à l'octet près à partir de ses composants —
 * exigence de `DATA_MODEL.md` pour que le total en CHF soit vérifiable.
 *
 * Le moteur **ne choisit jamais un prix**. Le service de marché lui transmet le
 * prix, son type et sa fraîcheur déjà déterminés ; le résultat les propage.
 * Laisser le moteur retomber silencieusement sur une clôture précédente
 * reviendrait à masquer la vraie nature de la donnée affichée.
 */

/** Version du moteur, stockée avec chaque snapshot. */
export const CALCULATION_VERSION = "1.0.0";

/** Prix de valorisation, avec sa provenance et sa fraîcheur. */
export type Mark = {
  readonly price: DecimalString;
  readonly currency: CurrencyCode;
  readonly priceType: PriceType;
  readonly freshness: QuoteFreshness;
  /** Horodatage fournisseur, ISO 8601 UTC. */
  readonly asOf: string;
  readonly provider: string;
  /** Clôture précédente, nécessaire à la variation du jour. */
  readonly previousClose?: DecimalString;
};

/** Taux de change vers la devise de consolidation. */
export type FxRate = {
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
  readonly rate: DecimalString;
  readonly asOf: string;
  readonly provider: string;
  readonly freshness: QuoteFreshness;
};

export type PositionInput = {
  readonly positionId: string;
  readonly accountId: string;
  readonly instrumentId: string;
  readonly quantity: DecimalString;
  readonly averageCost: DecimalString;
  readonly costCurrency: CurrencyCode;
  /** 1 pour action, ETF, fonds et cash ; valeur du contrat pour une option. */
  readonly multiplier: DecimalString;
};

/** Raison pour laquelle une position n'a pas pu être valorisée. */
export type ValuationGap =
  | { readonly kind: "NO_MARK" }
  | { readonly kind: "MARK_UNAVAILABLE" }
  | { readonly kind: "NO_FX_RATE"; readonly from: CurrencyCode; readonly to: CurrencyCode }
  | { readonly kind: "COST_FX_MISSING"; readonly from: CurrencyCode; readonly to: CurrencyCode };

export type PositionValuation = {
  readonly positionId: string;
  readonly accountId: string;
  readonly instrumentId: string;

  readonly marketValueNative: DecimalString;
  readonly marketValueBase: DecimalString;
  readonly costBasisNative: DecimalString;
  readonly costBasisBase: DecimalString;
  readonly unrealizedPnlBase: DecimalString;
  /** `null` quand le coût de revient est nul : un pourcentage serait trompeur. */
  readonly unrealizedPnlPct: DecimalString | null;
  /** `null` quand aucune clôture précédente n'est disponible. */
  readonly dayPnlBase: DecimalString | null;

  readonly nativeCurrency: CurrencyCode;
  readonly baseCurrency: CurrencyCode;
  readonly priceType: PriceType;
  readonly freshness: QuoteFreshness;
  readonly asOf: string;
  readonly provider: string;
  /** Taux appliqué, conservé pour rendre la conversion vérifiable. */
  readonly fxRate: DecimalString;
  readonly fxAsOf: string | null;
  readonly calculationVersion: string;
};

export type UnvaluedPosition = {
  readonly positionId: string;
  readonly accountId: string;
  readonly instrumentId: string;
  readonly reason: ValuationGap;
};

export type PortfolioValuation = {
  readonly baseCurrency: CurrencyCode;
  readonly positions: readonly PositionValuation[];
  /**
   * Positions qu'aucune donnée fiable ne permet de valoriser.
   *
   * Elles sont exposées séparément et **jamais comptées comme zéro** : une
   * position manquante qui pèserait zéro dans le total ferait silencieusement
   * baisser le patrimoine affiché.
   */
  readonly unvalued: readonly UnvaluedPosition[];
  readonly totalMarketValueBase: DecimalString;
  readonly totalCostBasisBase: DecimalString;
  readonly totalUnrealizedPnlBase: DecimalString;
  /** `null` dès qu'une position valorisée n'a pas de clôture précédente. */
  readonly totalDayPnlBase: DecimalString | null;
  /** Fraîcheur la plus dégradée parmi les positions valorisées. */
  readonly worstFreshness: QuoteFreshness;
  readonly calculationVersion: string;
};

/**
 * Ordre de dégradation de la fraîcheur, du meilleur au pire.
 *
 * Sert à déterminer la fraîcheur globale d'un portefeuille : elle vaut celle de
 * sa position la plus dégradée. Annoncer « en direct » un total dont une ligne
 * date de la veille serait un mensonge par agrégation.
 */
const FRESHNESS_RANK: Readonly<Record<QuoteFreshness, number>> = {
  LIVE: 0,
  DELAYED: 1,
  EOD: 2,
  NAV: 3,
  MANUAL: 4,
  STALE: 5,
  UNAVAILABLE: 6,
};

export function worseFreshness(a: QuoteFreshness, b: QuoteFreshness): QuoteFreshness {
  return FRESHNESS_RANK[a] >= FRESHNESS_RANK[b] ? a : b;
}

/** Table de taux indexée par couple de devises. */
export type FxTable = ReadonlyMap<string, FxRate>;

export function fxKey(from: CurrencyCode, to: CurrencyCode): string {
  return `${from}/${to}`;
}

export function buildFxTable(rates: readonly FxRate[]): FxTable {
  return new Map(rates.map((rate) => [fxKey(rate.from, rate.to), rate]));
}

/**
 * Résout le taux d'une devise vers la devise de consolidation.
 *
 * Une devise identique vaut 1 sans consulter la table : convertir un montant
 * déjà libellé en CHF par un taux CHF/CHF issu d'un fournisseur introduirait un
 * arrondi parasite et pourrait le marquer périmé sans raison.
 *
 * Le taux inverse est accepté et inversé exactement — `1/rate` en précision 34,
 * pas en flottant.
 */
export type ResolvedFx = {
  readonly rate: Decimal;
  readonly asOf: string | null;
  /**
   * Fraîcheur du taux, ou `null` pour une conversion identité.
   *
   * `null` et non `MANUAL` : une conversion CHF → CHF n'apporte aucune donnée
   * et ne doit donc **pas** dégrader la fraîcheur du prix. Lui attribuer
   * `MANUAL` ferait apparaître un fonds valorisé par sa NAV comme une saisie
   * manuelle, et une clôture comme une valeur saisie à la main.
   */
  readonly freshness: QuoteFreshness | null;
};

export function resolveFxRate(
  from: CurrencyCode,
  to: CurrencyCode,
  table: FxTable,
): ResolvedFx | null {
  if (from === to) {
    return { rate: new Decimal(1), asOf: null, freshness: null };
  }

  const direct = table.get(fxKey(from, to));
  if (direct !== undefined) {
    return { rate: decimal(direct.rate), asOf: direct.asOf, freshness: direct.freshness };
  }

  const inverse = table.get(fxKey(to, from));
  if (inverse !== undefined) {
    const inverseRate = decimal(inverse.rate);
    if (inverseRate.isZero()) {
      return null;
    }
    return {
      rate: new Decimal(1).div(inverseRate),
      asOf: inverse.asOf,
      freshness: inverse.freshness,
    };
  }

  return null;
}

/**
 * Valorise une position.
 *
 * Renvoie `null` assorti d'une raison plutôt que des zéros lorsqu'une donnée
 * manque : un zéro se propagerait dans les totaux et ferait apparaître une
 * baisse de patrimoine là où il n'y a qu'une absence d'information.
 */
export function valuePosition(
  position: PositionInput,
  mark: Mark | undefined,
  fx: FxTable,
  baseCurrency: CurrencyCode,
):
  | { readonly ok: true; readonly value: PositionValuation }
  | {
      readonly ok: false;
      readonly reason: ValuationGap;
    } {
  if (mark === undefined) {
    return { ok: false, reason: { kind: "NO_MARK" } };
  }
  if (!isValuable(mark.freshness)) {
    return { ok: false, reason: { kind: "MARK_UNAVAILABLE" } };
  }

  const priceFx = resolveFxRate(mark.currency, baseCurrency, fx);
  if (priceFx === null) {
    return { ok: false, reason: { kind: "NO_FX_RATE", from: mark.currency, to: baseCurrency } };
  }

  /*
   * Le coût est converti avec le taux de SA devise, qui n'est pas
   * nécessairement celle du prix : un titre peut être acheté en USD et coté sur
   * une place en EUR. Réutiliser le taux du prix fausserait le P&L.
   */
  const costFx = resolveFxRate(position.costCurrency, baseCurrency, fx);
  if (costFx === null) {
    return {
      ok: false,
      reason: { kind: "COST_FX_MISSING", from: position.costCurrency, to: baseCurrency },
    };
  }

  const quantity = decimal(position.quantity);
  const multiplier = decimal(position.multiplier);
  const price = decimal(mark.price);
  const averageCost = decimal(position.averageCost);

  const exposure = quantity.times(multiplier);
  const marketValueNative = exposure.times(price);
  const marketValueBase = marketValueNative.times(priceFx.rate);
  const costBasisNative = exposure.times(averageCost);
  const costBasisBase = costBasisNative.times(costFx.rate);
  const unrealizedPnlBase = marketValueBase.minus(costBasisBase);

  /*
   * Le pourcentage latent est rapporté à la valeur absolue du coût : une
   * position vendeuse a un coût négatif, et diviser par lui inverserait le
   * signe du rendement affiché.
   *
   * Un coût nul ne donne pas 0 % mais `null` : « aucun rendement » et
   * « rendement de zéro » sont deux informations différentes.
   */
  const absoluteCost = costBasisNative.abs();
  const unrealizedPnlPct = absoluteCost.isZero()
    ? null
    : marketValueNative
        .times(priceFx.rate)
        .minus(costBasisNative.times(costFx.rate))
        .div(absoluteCost.times(costFx.rate.abs()));

  const dayPnlBase =
    mark.previousClose === undefined
      ? null
      : exposure.times(price.minus(decimal(mark.previousClose))).times(priceFx.rate);

  return {
    ok: true,
    value: {
      positionId: position.positionId,
      accountId: position.accountId,
      instrumentId: position.instrumentId,
      marketValueNative: fromDecimal(marketValueNative),
      marketValueBase: fromDecimal(marketValueBase),
      costBasisNative: fromDecimal(costBasisNative),
      costBasisBase: fromDecimal(costBasisBase),
      unrealizedPnlBase: fromDecimal(unrealizedPnlBase),
      unrealizedPnlPct: unrealizedPnlPct === null ? null : fromDecimal(unrealizedPnlPct),
      dayPnlBase: dayPnlBase === null ? null : fromDecimal(dayPnlBase),
      nativeCurrency: mark.currency,
      baseCurrency,
      priceType: mark.priceType,
      /*
       * La fraîcheur retenue est la pire du couple prix/taux : un prix en
       * direct converti par un taux de la veille n'est pas une valeur en
       * direct. Une conversion identité, elle, n'apporte aucune donnée et
       * laisse la fraîcheur du prix intacte.
       */
      freshness:
        priceFx.freshness === null
          ? mark.freshness
          : worseFreshness(mark.freshness, priceFx.freshness),
      asOf: mark.asOf,
      provider: mark.provider,
      fxRate: fromDecimal(priceFx.rate),
      fxAsOf: priceFx.asOf,
      calculationVersion: CALCULATION_VERSION,
    },
  };
}

/**
 * Valorise un portefeuille complet.
 *
 * Les positions non valorisables sont écartées du total et listées à part. Le
 * total du jour devient `null` dès qu'une position valorisée n'a pas de clôture
 * précédente : additionner les seules variations connues donnerait un chiffre
 * partiel présenté comme complet.
 */
export function valuePortfolio(
  positions: readonly PositionInput[],
  marks: ReadonlyMap<string, Mark>,
  fx: FxTable,
  baseCurrency: CurrencyCode,
): PortfolioValuation {
  const valued: PositionValuation[] = [];
  const unvalued: UnvaluedPosition[] = [];

  for (const position of positions) {
    const result = valuePosition(position, marks.get(position.instrumentId), fx, baseCurrency);
    if (result.ok) {
      valued.push(result.value);
    } else {
      unvalued.push({
        positionId: position.positionId,
        accountId: position.accountId,
        instrumentId: position.instrumentId,
        reason: result.reason,
      });
    }
  }

  let totalMarketValue = new Decimal(0);
  let totalCostBasis = new Decimal(0);
  let totalDayPnl: Decimal | null = new Decimal(0);
  let worst: QuoteFreshness = "LIVE";

  for (const value of valued) {
    totalMarketValue = totalMarketValue.plus(decimal(value.marketValueBase));
    totalCostBasis = totalCostBasis.plus(decimal(value.costBasisBase));
    worst = worseFreshness(worst, value.freshness);

    if (totalDayPnl !== null) {
      totalDayPnl = value.dayPnlBase === null ? null : totalDayPnl.plus(decimal(value.dayPnlBase));
    }
  }

  return {
    baseCurrency,
    positions: valued,
    unvalued,
    totalMarketValueBase: fromDecimal(totalMarketValue),
    totalCostBasisBase: fromDecimal(totalCostBasis),
    totalUnrealizedPnlBase: fromDecimal(totalMarketValue.minus(totalCostBasis)),
    totalDayPnlBase: totalDayPnl === null ? null : fromDecimal(totalDayPnl),
    // Un portefeuille vide n'a pas de fraîcheur dégradée à signaler.
    worstFreshness: valued.length === 0 ? "UNAVAILABLE" : worst,
    calculationVersion: CALCULATION_VERSION,
  };
}

/** Part d'une position dans l'exposition brute du portefeuille. */
export type AllocationSlice = {
  readonly key: string;
  readonly marketValueBase: DecimalString;
  /** Part de l'exposition **brute**, en valeurs absolues. */
  readonly grossPct: DecimalString;
};

/**
 * Répartit l'exposition par clé — classe d'actifs, compte ou devise.
 *
 * Le dénominateur est la somme des valeurs **absolues** : avec des positions
 * vendeuses, une somme algébrique proche de zéro produirait des parts
 * aberrantes, voire une division par zéro.
 */
export function allocate(
  entries: readonly { readonly key: string; readonly marketValueBase: DecimalString }[],
): readonly AllocationSlice[] {
  const totals = new Map<string, Decimal>();
  for (const entry of entries) {
    const previous = totals.get(entry.key) ?? new Decimal(0);
    totals.set(entry.key, previous.plus(decimal(entry.marketValueBase)));
  }

  let gross = new Decimal(0);
  for (const value of totals.values()) {
    gross = gross.plus(value.abs());
  }

  return [...totals.entries()]
    .map(([key, value]) => ({
      key,
      marketValueBase: fromDecimal(value),
      grossPct: gross.isZero() ? ("0" as DecimalString) : fromDecimal(value.abs().div(gross)),
    }))
    .sort(
      (a, b) => decimal(b.grossPct).comparedTo(decimal(a.grossPct)) || a.key.localeCompare(b.key),
    );
}
