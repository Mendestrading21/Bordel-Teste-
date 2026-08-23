import {
  decimal,
  Decimal,
  fromDecimal,
  type CurrencyCode,
  type DecimalString,
} from "@portfolio-lab/domain";

import type { PortfolioValuation, PositionValuation } from "./valuation.js";

/**
 * Agrégats d'analyse du portefeuille.
 *
 * Toute valeur produite ici doit se **réconcilier** avec les positions et les
 * taux stockés — c'est le critère d'acceptation du lot. Chaque fonction est
 * donc pure et déterministe, et les tests vérifient les identités comptables
 * plutôt que des valeurs figées.
 */

/**
 * Rendement latent du portefeuille, en fraction (0.0523 = 5.23 %).
 *
 * Rapporté à la **valeur absolue** du capital investi : un portefeuille dont le
 * coût net est négatif — positions vendeuses dominantes — verrait sinon le
 * signe de son rendement inversé.
 *
 * `null` quand le capital investi est nul. Zéro divisé par zéro n'est pas
 * « 0 % de rendement » ; afficher `0.00 %` laisserait croire à une stabilité
 * mesurée alors que rien ne l'a été.
 *
 * Le calcul est **décimal** : passer par un flottant pour ce ratio réintroduit
 * l'erreur que `packages/domain` élimine partout ailleurs, sur le chiffre le
 * plus regardé de l'écran d'accueil.
 */
export function portfolioReturn(valuation: PortfolioValuation): DecimalString | null {
  const cost = decimal(valuation.totalCostBasisBase).abs();
  if (cost.isZero()) {
    return null;
  }
  return fromDecimal(decimal(valuation.totalUnrealizedPnlBase).div(cost));
}

/** Contribution d'une position au P&L total. */
export type PnlContribution = {
  readonly positionId: string;
  readonly instrumentId: string;
  readonly accountId: string;
  readonly unrealizedPnlBase: DecimalString;
  /**
   * Part de cette position dans le P&L **total**.
   *
   * `null` quand le P&L total est nul : une part de quelque chose qui vaut zéro
   * n'a pas de sens, et afficher 0 % laisserait croire à une contribution nulle
   * alors que la position peut avoir gagné beaucoup, compensée par une autre.
   */
  readonly share: DecimalString | null;
};

/**
 * Contributions au P&L, triées par valeur absolue décroissante.
 *
 * Le tri est en **valeur absolue** : la plus grosse perte est aussi
 * intéressante que le plus gros gain, et les reléguer en fin de liste
 * masquerait ce que l'utilisateur cherche précisément à voir.
 */
export function pnlContributions(valuation: PortfolioValuation): readonly PnlContribution[] {
  const total = decimal(valuation.totalUnrealizedPnlBase);

  return valuation.positions
    .map((position) => ({
      positionId: position.positionId,
      instrumentId: position.instrumentId,
      accountId: position.accountId,
      unrealizedPnlBase: position.unrealizedPnlBase,
      share: total.isZero() ? null : fromDecimal(decimal(position.unrealizedPnlBase).div(total)),
    }))
    .sort((a, b) =>
      decimal(b.unrealizedPnlBase).abs().comparedTo(decimal(a.unrealizedPnlBase).abs()),
    );
}

/**
 * Exposition d'options par sous-jacent.
 *
 * L'exposition d'une option n'est **pas** sa valeur de marché : deux calls sur
 * le même sous-jacent valant 1 000 CHF représentent une exposition notionnelle
 * bien plus grande. Les deux chiffres sont donc rendus séparément, et l'écran
 * doit les distinguer explicitement.
 */
export type UnderlyingExposure = {
  readonly underlyingId: string;
  /** Somme des valeurs de marché des contrats, en devise de consolidation. */
  readonly marketValueBase: DecimalString;
  /**
   * Notionnel : quantité × multiplicateur × strike, converti.
   *
   * C'est le montant réellement engagé si les contrats sont exercés — l'ordre
   * de grandeur que la valeur de marché seule ne montre pas.
   */
  readonly notionalBase: DecimalString;
  readonly contractCount: number;
};

export type OptionPositionInput = {
  readonly positionId: string;
  readonly underlyingId: string;
  readonly quantity: DecimalString;
  readonly multiplier: DecimalString;
  readonly strike: DecimalString;
  readonly marketValueBase: DecimalString;
  /** Taux appliqué au strike pour obtenir le notionnel en devise de base. */
  readonly fxRate: DecimalString;
};

/** Contrat d'option tel qu'il est stocké, avant confrontation à sa valorisation. */
export type OptionContractInput = {
  readonly positionId: string;
  readonly underlyingId: string;
  readonly quantity: DecimalString;
  readonly multiplier: DecimalString;
  readonly strike: DecimalString;
  /** Devise du contrat, celle dans laquelle son strike est libellé. */
  readonly contractCurrency: CurrencyCode;
};

/** Valorisation d'un contrat, telle que le moteur l'a produite. */
export type OptionValuationInput = {
  readonly nativeCurrency: CurrencyCode;
  readonly marketValueBase: DecimalString;
  readonly fxRate: DecimalString;
};

/** Raison pour laquelle un contrat n'entre pas dans l'exposition. */
export type OptionExclusion = {
  readonly positionId: string;
  readonly reason: "NOT_VALUED" | "CURRENCY_MISMATCH";
};

export type PreparedOptionExposure = {
  readonly inputs: readonly OptionPositionInput[];
  readonly excluded: readonly OptionExclusion[];
};

/**
 * Confronte chaque contrat à sa valorisation avant de calculer l'exposition.
 *
 * Deux situations écartent un contrat, et **aucune ne le compte à zéro** :
 *
 * - **non valorisé** : sa valeur de marché est inconnue ; lui en prêter une de
 *   zéro sous-estimerait l'exposition affichée ;
 * - **devise incohérente** : le strike est libellé dans la devise du contrat,
 *   alors que le taux disponible est celui appliqué à son prix. Les deux
 *   coïncident normalement — c'est le même instrument — mais rien ne le
 *   garantit, et un cours reçu dans une autre devise produirait un notionnel
 *   faux d'un facteur de change entier.
 */
export function prepareOptionExposure(
  contracts: readonly OptionContractInput[],
  valuations: ReadonlyMap<string, OptionValuationInput>,
): PreparedOptionExposure {
  const inputs: OptionPositionInput[] = [];
  const excluded: OptionExclusion[] = [];

  for (const contract of contracts) {
    const valued = valuations.get(contract.positionId);
    if (valued === undefined) {
      excluded.push({ positionId: contract.positionId, reason: "NOT_VALUED" });
      continue;
    }
    if (valued.nativeCurrency !== contract.contractCurrency) {
      excluded.push({ positionId: contract.positionId, reason: "CURRENCY_MISMATCH" });
      continue;
    }
    inputs.push({
      positionId: contract.positionId,
      underlyingId: contract.underlyingId,
      quantity: contract.quantity,
      multiplier: contract.multiplier,
      strike: contract.strike,
      marketValueBase: valued.marketValueBase,
      fxRate: valued.fxRate,
    });
  }

  return { inputs, excluded };
}

export function optionExposure(
  positions: readonly OptionPositionInput[],
): readonly UnderlyingExposure[] {
  const byUnderlying = new Map<
    string,
    { marketValue: Decimal; notional: Decimal; count: number }
  >();

  for (const position of positions) {
    const entry = byUnderlying.get(position.underlyingId) ?? {
      marketValue: new Decimal(0),
      notional: new Decimal(0),
      count: 0,
    };

    entry.marketValue = entry.marketValue.plus(decimal(position.marketValueBase));
    entry.notional = entry.notional.plus(
      decimal(position.quantity)
        .times(decimal(position.multiplier))
        .times(decimal(position.strike))
        .times(decimal(position.fxRate)),
    );
    entry.count += 1;
    byUnderlying.set(position.underlyingId, entry);
  }

  return [...byUnderlying.entries()]
    .map(([underlyingId, entry]) => ({
      underlyingId,
      marketValueBase: fromDecimal(entry.marketValue),
      notionalBase: fromDecimal(entry.notional),
      contractCount: entry.count,
    }))
    .sort((a, b) => decimal(b.notionalBase).abs().comparedTo(decimal(a.notionalBase).abs()));
}

/** Point de l'historique du patrimoine. */
export type WealthPoint = {
  /** Date ISO `AAAA-MM-JJ`. */
  readonly date: string;
  readonly marketValueBase: DecimalString;
  readonly costBasisBase: DecimalString;
  readonly unrealizedPnlBase: DecimalString;
  readonly baseCurrency: CurrencyCode;
  /** Version du moteur ayant produit ce point. */
  readonly calculationVersion: string;
};

/**
 * Variation entre deux points d'historique.
 *
 * `null` quand le point de départ est nul ou absent : diviser par zéro
 * produirait l'infini, et afficher 0 % laisserait croire à une stabilité.
 */
export type WealthChange = {
  readonly absolute: DecimalString;
  readonly relative: DecimalString | null;
  readonly from: WealthPoint;
  readonly to: WealthPoint;
};

/**
 * Snapshot tel qu'il est stocké : horodaté à l'instant, pas à la journée.
 *
 * `DATA_MODEL.md` prévoit **plusieurs** snapshots par jour — un après la
 * publication des données attendues, et un après chaque modification manuelle
 * importante. L'historique quotidien est donc *dérivé*, jamais supposé unique.
 */
export type SnapshotRecord = {
  /** Instant ISO 8601 (`snapshot_at`). */
  readonly snapshotAt: string;
  readonly marketValueBase: DecimalString;
  readonly costBasisBase: DecimalString;
  readonly unrealizedPnlBase: DecimalString;
  readonly baseCurrency: CurrencyCode;
  readonly calculationVersion: string;
};

/**
 * Fuseau déterminant la frontière des journées.
 *
 * Le patrimoine est consolidé en CHF pour un utilisateur suisse : découper les
 * journées en UTC rattacherait un snapshot pris à 00 h 30 à Zurich au jour
 * **précédent**, et l'historique montrerait deux points le même jour puis un
 * trou le lendemain.
 */
export const HISTORY_TIME_ZONE = "Europe/Zurich";

/**
 * Jour civil d'un instant, dans le fuseau donné.
 *
 * `en-CA` produit `AAAA-MM-JJ`, format déjà trié par comparaison de chaînes.
 */
export function civilDay(instant: string, timeZone: string = HISTORY_TIME_ZONE): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Instant ISO 8601 invalide : ${instant}`);
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Historique quotidien dérivé des snapshots stockés.
 *
 * Quand une journée porte plusieurs snapshots, **le dernier est retenu** : il
 * intègre les modifications manuelles faites dans la journée, alors que le
 * premier décrirait un portefeuille que l'utilisateur a depuis changé.
 *
 * Les points sont rendus par date croissante, prêts à être tracés de gauche à
 * droite sans tri supplémentaire à l'écran.
 */
export function dailyHistory(
  snapshots: readonly SnapshotRecord[],
  timeZone: string = HISTORY_TIME_ZONE,
): readonly WealthPoint[] {
  const byDay = new Map<string, { instant: string; snapshot: SnapshotRecord }>();

  for (const snapshot of snapshots) {
    const day = civilDay(snapshot.snapshotAt, timeZone);
    const kept = byDay.get(day);
    if (kept === undefined || snapshot.snapshotAt > kept.instant) {
      byDay.set(day, { instant: snapshot.snapshotAt, snapshot });
    }
  }

  return [...byDay.entries()]
    .map(([date, { snapshot }]) => ({
      date,
      marketValueBase: snapshot.marketValueBase,
      costBasisBase: snapshot.costBasisBase,
      unrealizedPnlBase: snapshot.unrealizedPnlBase,
      baseCurrency: snapshot.baseCurrency,
      calculationVersion: snapshot.calculationVersion,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Bornes d'un historique, pour tracer une courbe sans écraser les écarts.
 *
 * `null` quand l'historique est vide. Quand tous les points sont égaux,
 * `min === max` : le tracé doit alors rendre une ligne plate, pas une division
 * par zéro.
 */
export type HistoryBounds = {
  readonly min: DecimalString;
  readonly max: DecimalString;
  readonly flat: boolean;
};

export function historyBounds(points: readonly WealthPoint[]): HistoryBounds | null {
  const first = points[0];
  if (first === undefined) {
    return null;
  }

  let min = decimal(first.marketValueBase);
  let max = min;
  for (const point of points.slice(1)) {
    const value = decimal(point.marketValueBase);
    if (value.lessThan(min)) {
      min = value;
    }
    if (value.greaterThan(max)) {
      max = value;
    }
  }

  return { min: fromDecimal(min), max: fromDecimal(max), flat: min.equals(max) };
}

/**
 * `true` quand tous les points viennent de la même version du moteur **et** de
 * la même devise de consolidation.
 *
 * Une série mêlant CHF et EUR tracerait une marche qui ne correspond à aucun
 * mouvement de patrimoine.
 */
export function isComparableSeries(points: readonly WealthPoint[]): boolean {
  const first = points[0];
  if (first === undefined) {
    return true;
  }
  return points.every(
    (point) =>
      point.calculationVersion === first.calculationVersion &&
      point.baseCurrency === first.baseCurrency,
  );
}

export function wealthChange(points: readonly WealthPoint[]): WealthChange | null {
  if (points.length < 2) {
    return null;
  }

  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const from = sorted[0] as WealthPoint;
  const to = sorted[sorted.length - 1] as WealthPoint;

  /*
   * Les points produits par des versions différentes du moteur ne sont pas
   * comparables : une évolution de la formule déplacerait le résultat sans que
   * le patrimoine ait bougé. On refuse la comparaison plutôt que de produire
   * une variation trompeuse.
   *
   * La vérification porte sur **toute** la série, pas seulement sur ses bornes :
   * une courbe dont un point du milieu vient d'une autre version n'est pas une
   * mesure continue, même si ses extrémités concordent.
   */
  if (!isComparableSeries(sorted)) {
    return null;
  }

  const start = decimal(from.marketValueBase);
  const end = decimal(to.marketValueBase);
  const absolute = end.minus(start);

  return {
    absolute: fromDecimal(absolute),
    relative: start.isZero() ? null : fromDecimal(absolute.div(start.abs())),
    from,
    to,
  };
}

/**
 * Vérifie qu'une valorisation est comptablement cohérente.
 *
 * Utilisée en test et exposée à l'écran de santé des données : un écart entre
 * la somme des positions et le total affiché signale un défaut du moteur, et
 * doit être visible plutôt que noyé.
 */
export type ReconciliationResult = {
  readonly consistent: boolean;
  readonly marketValueDelta: DecimalString;
  readonly costBasisDelta: DecimalString;
  readonly pnlDelta: DecimalString;
};

export function reconcile(valuation: PortfolioValuation): ReconciliationResult {
  const sum = (pick: (position: PositionValuation) => DecimalString): Decimal =>
    valuation.positions.reduce(
      (total, position) => total.plus(decimal(pick(position))),
      new Decimal(0),
    );

  const marketValueDelta = sum((p) => p.marketValueBase).minus(
    decimal(valuation.totalMarketValueBase),
  );
  const costBasisDelta = sum((p) => p.costBasisBase).minus(decimal(valuation.totalCostBasisBase));
  const pnlDelta = decimal(valuation.totalMarketValueBase)
    .minus(decimal(valuation.totalCostBasisBase))
    .minus(decimal(valuation.totalUnrealizedPnlBase));

  return {
    // Égalité stricte : les décimales sont exactes, un écart même minime
    // signale un défaut réel et non une erreur d'arrondi.
    consistent: marketValueDelta.isZero() && costBasisDelta.isZero() && pnlDelta.isZero(),
    marketValueDelta: fromDecimal(marketValueDelta),
    costBasisDelta: fromDecimal(costBasisDelta),
    pnlDelta: fromDecimal(pnlDelta),
  };
}

/**
 * Empreinte des composants d'une valorisation.
 *
 * `DATA_MODEL.md` exige qu'un snapshot soit « recalculable de façon
 * reproductible à partir de ses composants ». L'empreinte répond à la question
 * qui rend cette exigence vérifiable : *les composants ayant produit ce
 * snapshot sont-ils encore ceux d'aujourd'hui ?*
 *
 * Ce n'est **pas** une empreinte cryptographique et elle ne prétend pas
 * l'être : elle sert à détecter un changement, pas à résister à un adversaire
 * qui chercherait une collision. Le choix de FNV-1a est délibéré — pas de
 * dépendance, disponible aussi bien côté serveur que dans le navigateur, et
 * strictement déterministe entre exécutions, ce que `crypto.subtle` ne permet
 * pas de façon synchrone.
 */
function fnv1a(input: string, offsetBasis: number): number {
  let hash = offsetBasis;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    // Multiplication par le premier FNV 16777619, en arithmétique 32 bits.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function hex32(value: number): string {
  return value.toString(16).padStart(8, "0");
}

/**
 * Chaîne canonique décrivant les composants d'une valorisation.
 *
 * Les positions sont **triées par identifiant** avant sérialisation : l'ordre
 * de lecture en base peut varier — un `order by` sur un nom de compte, par
 * exemple — et une empreinte qui changerait pour cette seule raison signalerait
 * en permanence de faux écarts.
 *
 * Chaque composant utilisé par le calcul y figure : quantité et coût sont déjà
 * intégrés dans les valeurs, mais le **taux de change** et l'**horodatage du
 * prix** en sont des entrées à part entière. Deux valorisations identiques au
 * centime obtenues avec des taux différents ne sont pas le même fait.
 */
export function canonicalComponents(valuation: PortfolioValuation): string {
  const lines = valuation.positions
    .map((position) =>
      [
        position.positionId,
        position.instrumentId,
        position.marketValueNative,
        position.nativeCurrency,
        position.costBasisNative,
        position.fxRate,
        position.fxAsOf ?? "",
        position.priceType,
        position.freshness,
        position.asOf,
        position.provider,
      ].join("|"),
    )
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  /*
   * Les positions non valorisées entrent dans l'empreinte : passer de « prix
   * indisponible » à « prix disponible » change le total sans qu'aucune ligne
   * valorisée n'ait bougé. Une empreinte aveugle à ce cas déclarerait le
   * snapshot inchangé alors qu'il ne l'est plus.
   */
  const gaps = valuation.unvalued
    .map((gap) => `!${gap.positionId}|${gap.reason.kind}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return [
    `v=${valuation.calculationVersion}`,
    `base=${valuation.baseCurrency}`,
    ...lines,
    ...gaps,
  ].join("\n");
}

/** Empreinte hexadécimale sur 64 bits des composants d'une valorisation. */
export function componentsFingerprint(valuation: PortfolioValuation): string {
  const canonical = canonicalComponents(valuation);
  /*
   * Deux passes FNV-1a avec des bases différentes, concaténées : 32 bits
   * suffiraient à repérer une modification franche, mais une collision sur
   * quelques dizaines de snapshots n'est pas si improbable — ~1 chance sur
   * 100 000 dès 30 points. 64 bits rendent le risque négligeable pour un usage
   * de détection.
   */
  return `${hex32(fnv1a(canonical, 0x811c9dc5))}${hex32(fnv1a(canonical, 0x01000193))}`;
}

/**
 * Point de vue « source de vérité » d'un snapshot stocké.
 *
 * Comparer l'empreinte enregistrée à celle recalculée aujourd'hui répond
 * exactement au critère d'acceptation du lot : *les agrégats se réconcilient
 * avec les positions et les taux stockés*.
 */
export type SnapshotVerification =
  /** Le snapshot n'a pas d'empreinte : les anciens points n'en portaient pas. */
  | { readonly status: "UNFINGERPRINTED" }
  | { readonly status: "MATCHES" }
  | { readonly status: "DIVERGED"; readonly stored: string; readonly recomputed: string };

export function verifySnapshot(
  storedFingerprint: string | null,
  valuation: PortfolioValuation,
): SnapshotVerification {
  if (storedFingerprint === null || storedFingerprint === "") {
    return { status: "UNFINGERPRINTED" };
  }
  const recomputed = componentsFingerprint(valuation);
  return storedFingerprint === recomputed
    ? { status: "MATCHES" }
    : { status: "DIVERGED", stored: storedFingerprint, recomputed };
}
