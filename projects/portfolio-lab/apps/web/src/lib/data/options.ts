import "server-only";

import {
  DEMO_OPTION_CHAIN,
  daysToExpiration,
  expirationsOf,
  findContract,
  inspectContract,
  strikesOf,
  type ChainContract,
  type ContractWarning,
  type OptionChain,
  type OptionType,
} from "@portfolio-lab/market-data";
import type { DecimalString } from "@portfolio-lab/domain";

/**
 * Accès à la chaîne d'options.
 *
 * Une seule chaîne, fictive, tant qu'aucun fournisseur réel n'est joignable.
 * Elle est servie par cette fonction plutôt qu'importée directement par les
 * pages : le jour où un adaptateur existe, seul ce module change.
 */
export async function loadOptionChain(underlying: string): Promise<OptionChain | null> {
  return underlying.toUpperCase() === DEMO_OPTION_CHAIN.underlyingSymbol ? DEMO_OPTION_CHAIN : null;
}

/** Sous-jacents pour lesquels une chaîne est disponible. */
export async function listOptionUnderlyings(): Promise<readonly string[]> {
  return [DEMO_OPTION_CHAIN.underlyingSymbol];
}

export type ContractSelection = {
  readonly contract: ChainContract;
  readonly daysRemaining: number;
  readonly warnings: readonly ContractWarning[];
};

/**
 * Résout la sélection d'un contrat à partir des quatre attributs.
 *
 * Renvoie `null` si un seul attribut ne correspond pas : `UX_UI.md` impose une
 * sélection guidée précisément pour qu'un contrat approchant ne soit jamais
 * substitué. Un symbole OSI mal tapé désigne un **autre** contrat existant, pas
 * une erreur.
 */
export async function selectContract(
  underlying: string,
  criteria: {
    readonly optionType: OptionType;
    readonly expiration: string;
    readonly strike: DecimalString;
  },
  now: Date = new Date(),
): Promise<ContractSelection | null> {
  const chain = await loadOptionChain(underlying);
  if (chain === null) {
    return null;
  }

  const contract = findContract(chain, criteria);
  if (contract === null) {
    return null;
  }

  const daysRemaining = daysToExpiration(contract.expiration, now);
  return { contract, daysRemaining, warnings: inspectContract(contract, daysRemaining) };
}

/** Étapes du parcours guidé, dans l'ordre imposé par la spécification. */
export type ChainNavigation = {
  readonly underlyings: readonly string[];
  readonly expirations: readonly string[];
  readonly strikes: readonly DecimalString[];
};

export async function chainNavigation(
  underlying: string | null,
  optionType: OptionType | null,
  expiration: string | null,
): Promise<ChainNavigation> {
  const underlyings = await listOptionUnderlyings();

  if (underlying === null) {
    return { underlyings, expirations: [], strikes: [] };
  }

  const chain = await loadOptionChain(underlying);
  if (chain === null) {
    return { underlyings, expirations: [], strikes: [] };
  }

  const expirations = expirationsOf(chain);
  if (optionType === null || expiration === null) {
    return { underlyings, expirations, strikes: [] };
  }

  return { underlyings, expirations, strikes: strikesOf(chain, expiration, optionType) };
}
