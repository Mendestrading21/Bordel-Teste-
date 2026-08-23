import { toDecimalString, type DecimalString } from "@portfolio-lab/domain";

import { buildOsiSymbol } from "./osi.js";
import type { ChainContract, OptionChain } from "./option-chain.js";

/**
 * Chaîne d'options de démonstration.
 *
 * **Entièrement fictive.** Le sous-jacent est `DEMOT`, l'instrument de
 * démonstration du seed. Les fourchettes sont construites pour couvrir les trois
 * situations que la valorisation doit savoir distinguer :
 *
 * - un contrat liquide, fourchette serrée → midpoint ;
 * - un contrat illiquide, fourchette aberrante → dernier échange ;
 * - un contrat expiré → signalé, jamais valorisé comme les autres.
 *
 * Une chaîne où tout serait liquide ne prouverait rien de la logique de repli.
 */
export const DEMO_UNDERLYING = "DEMOT";

/** Date de référence de la chaîne fictive. */
export const DEMO_CHAIN_AS_OF = "2026-08-21T20:00:00.000Z";

const d = (value: string): DecimalString => toDecimalString(value);

function contract(
  optionType: "CALL" | "PUT",
  expiration: string,
  strike: string,
  quotes: { bid?: string; ask?: string; last?: string; openInterest?: number },
  multiplier = "100",
): ChainContract {
  const osiSymbol = buildOsiSymbol({
    underlying: DEMO_UNDERLYING,
    expiration,
    optionType,
    strike: d(strike),
  });

  return {
    providerSymbol: osiSymbol,
    osiSymbol,
    optionType,
    expiration,
    strike: d(strike),
    multiplier: d(multiplier),
    currency: "USD",
    ...(quotes.bid === undefined ? {} : { bid: d(quotes.bid) }),
    ...(quotes.ask === undefined ? {} : { ask: d(quotes.ask) }),
    ...(quotes.last === undefined ? {} : { last: d(quotes.last) }),
    ...(quotes.openInterest === undefined ? {} : { openInterest: quotes.openInterest }),
  };
}

export const DEMO_OPTION_CHAIN: OptionChain = {
  underlyingSymbol: DEMO_UNDERLYING,
  asOf: DEMO_CHAIN_AS_OF,
  contracts: [
    // --- Échéance proche, contrats liquides : fourchette serrée. -------------
    contract("CALL", "2027-01-15", "90", {
      bid: "12.10",
      ask: "12.40",
      last: "12.25",
      openInterest: 4210,
    }),
    contract("CALL", "2027-01-15", "100", {
      bid: "6.10",
      ask: "6.30",
      last: "6.20",
      openInterest: 8740,
    }),
    contract("CALL", "2027-01-15", "110", {
      bid: "2.85",
      ask: "3.05",
      last: "2.95",
      openInterest: 3120,
    }),
    contract("PUT", "2027-01-15", "90", {
      bid: "3.40",
      ask: "3.60",
      last: "3.50",
      openInterest: 2980,
    }),
    contract("PUT", "2027-01-15", "100", {
      bid: "7.20",
      ask: "7.45",
      last: "7.30",
      openInterest: 5110,
    }),

    // --- Contrat illiquide : fourchette si large que le midpoint n'a pas de
    //     sens. La valorisation doit retomber sur le dernier échange. --------
    contract("CALL", "2027-01-15", "200", {
      bid: "0.05",
      ask: "1.90",
      last: "0.15",
      openInterest: 12,
    }),

    // --- Contrat sans aucune cotation : ni fourchette, ni dernier échange. --
    contract("PUT", "2027-01-15", "40", { openInterest: 0 }),

    // --- Échéance lointaine, multiplicateur ajusté après un split fictif.
    //     Doit déclencher un avertissement, jamais être supposé à 100. -------
    contract("CALL", "2028-01-21", "100", { bid: "9.80", ask: "10.20", last: "10.00" }, "112"),

    // --- Contrat déjà expiré : signalé comme tel. --------------------------
    contract("CALL", "2026-06-19", "100", {
      bid: "0.01",
      ask: "0.05",
      last: "0.02",
      openInterest: 3,
    }),
  ],
};
