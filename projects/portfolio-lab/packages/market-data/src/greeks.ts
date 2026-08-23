import type { DecimalString } from "@portfolio-lab/domain";

/**
 * Sensibilités d'une option — les « Greeks ».
 *
 * **Elles ne sont jamais calculées par PortfolioLab.**
 *
 * `ROADMAP.md` est explicite : « Greeks seulement si sourcés ». La raison est
 * de fond. Calculer un delta ou une volatilité implicite exige un modèle
 * (Black-Scholes, binomial), un taux sans risque, une hypothèse de dividende et
 * une convention de temps. Chacun de ces choix déplace le résultat, et deux
 * implémentations raisonnables divergent sensiblement.
 *
 * Afficher un chiffre issu de nos propres hypothèses à côté de cours réels
 * laisserait croire à une donnée de marché. Le produit se contente donc de
 * relayer ce que le fournisseur publie, en citant la source — ou de ne rien
 * afficher.
 */

export type OptionGreeks = {
  readonly delta: DecimalString | null;
  readonly gamma: DecimalString | null;
  readonly theta: DecimalString | null;
  readonly vega: DecimalString | null;
  readonly rho: DecimalString | null;
  /** Volatilité implicite, en fraction : `0.32` pour 32 %. */
  readonly impliedVolatility: DecimalString | null;
  /** Fournisseur ayant publié ces valeurs. Obligatoire. */
  readonly provider: string;
  /** Horodatage du calcul chez le fournisseur. Obligatoire. */
  readonly asOf: string;
};

/**
 * Sensibilités telles qu'elles doivent être présentées.
 *
 * `null` signifie « non publiées par le fournisseur », et l'interface doit le
 * dire ainsi — surtout pas afficher un tiret ambigu que l'utilisateur pourrait
 * lire comme une valeur nulle.
 */
export type GreeksPresentation =
  | { readonly available: false; readonly reason: string }
  | { readonly available: true; readonly greeks: OptionGreeks };

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

function optionalDecimal(value: unknown): DecimalString | null {
  return typeof value === "string" && DECIMAL_PATTERN.test(value) ? (value as DecimalString) : null;
}

/**
 * Convertit des sensibilités brutes d'un fournisseur.
 *
 * Exige `provider` et `asOf` : sans source ni horodatage, une sensibilité n'est
 * pas attribuable, et ne doit donc pas être affichée.
 */
export function parseGreeks(raw: unknown, provider: string, asOf: string): OptionGreeks | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  if (provider === "" || asOf === "" || Number.isNaN(Date.parse(asOf))) {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const greeks: OptionGreeks = {
    delta: optionalDecimal(source["delta"]),
    gamma: optionalDecimal(source["gamma"]),
    theta: optionalDecimal(source["theta"]),
    vega: optionalDecimal(source["vega"]),
    rho: optionalDecimal(source["rho"]),
    impliedVolatility: optionalDecimal(source["impliedVolatility"]),
    provider,
    asOf,
  };

  // Un objet dont aucune sensibilité n'est exploitable ne vaut pas mieux que
  // rien : le renvoyer ferait afficher une section vide et trompeuse.
  const hasAny =
    greeks.delta !== null ||
    greeks.gamma !== null ||
    greeks.theta !== null ||
    greeks.vega !== null ||
    greeks.rho !== null ||
    greeks.impliedVolatility !== null;

  return hasAny ? greeks : null;
}

export function presentGreeks(greeks: OptionGreeks | null): GreeksPresentation {
  if (greeks === null) {
    return {
      available: false,
      reason:
        "Aucune sensibilité n'est publiée par le fournisseur pour ce contrat. " +
        "PortfolioLab n'en calcule aucune : un delta issu de nos propres hypothèses " +
        "ne serait pas une donnée de marché.",
    };
  }
  return { available: true, greeks };
}

export const GREEK_LABEL = {
  delta: "Delta",
  gamma: "Gamma",
  theta: "Thêta",
  vega: "Véga",
  rho: "Rhô",
  impliedVolatility: "Volatilité implicite",
} as const;
