import { describe, expect, it } from "vitest";

import { ProviderError } from "./contract.js";
import { inspectContract } from "./option-chain.js";
import {
  isSameFuturesContract,
  massiveChainContract,
  massiveOptionChain,
  massiveOptionContract,
  parseFuturesSymbol,
} from "./massive-normalisation.js";

const validContract = {
  ticker: "O:AAPL260116C00150000",
  underlying_ticker: "AAPL",
  contract_type: "call",
  expiration_date: "2026-01-16",
  strike_price: 150,
  shares_per_contract: 100,
  exercise_style: "american",
};

describe("multiplicateur — jamais supposé", () => {
  it("refuse un contrat sans multiplicateur au lieu de supposer 100", () => {
    /*
     * L'erreur la plus coûteuse du domaine : un contrat ajusté après un split
     * ne vaut pas 100 parts. Supposer 100 fausse la valorisation d'un facteur
     * entier sans rien casser visiblement.
     */
    const { shares_per_contract, ...withoutMultiplier } = validContract;
    void shares_per_contract;
    expect(() => massiveOptionContract(withoutMultiplier)).toThrow(/Multiplicateur absent/);
  });

  it("refuse un multiplicateur nul ou négatif", () => {
    for (const value of [0, -100, "0"]) {
      expect(() => massiveOptionContract({ ...validContract, shares_per_contract: value })).toThrow(
        ProviderError,
      );
    }
  });

  it("conserve un multiplicateur non standard tel quel", () => {
    // Un contrat ajusté vaut par exemple 116 parts. Le normaliser à 100
    // détruirait l'information.
    const contract = massiveOptionContract({ ...validContract, shares_per_contract: 116 });
    expect(contract.multiplier).toBe("116");
  });

  it("fait remonter le multiplicateur inhabituel jusqu'à l'avertissement", () => {
    // Vérifie la chaîne complète : lecture, transport, signalement.
    const chainContract = massiveChainContract(
      { ...validContract, shares_per_contract: 116 },
      { bid: "1.00", ask: "1.10" },
    );
    const warnings = inspectContract(chainContract, 120);
    expect(warnings.map((warning) => warning.kind)).toContain("UNUSUAL_MULTIPLIER");
  });
});

describe("symbole OSI — deux sources d'une même vérité", () => {
  it("rend la forme canonique, pas celle qui est arrivée", () => {
    /*
     * OSI cadre la racine sur six caractères ; les fournisseurs publient
     * couramment la forme compacte. Renvoyer celle qui est arrivée donnerait
     * deux représentations du même contrat selon la source, et tout
     * rapprochement entre fournisseurs échouerait sur une différence d'espaces.
     */
    expect(massiveOptionContract(validContract).osiSymbol).toBe("AAPL  260116C00150000");
  });

  it("produit la même forme avec ou sans symbole publié", () => {
    const { ticker, ...withoutTicker } = validContract;
    void ticker;
    expect(massiveOptionContract(withoutTicker).osiSymbol).toBe(
      massiveOptionContract(validContract).osiSymbol,
    );
  });

  it("refuse un symbole qui contredit le strike annoncé", () => {
    /*
     * Le symbole dit 150, les attributs disent 160. L'un des deux est faux ;
     * choisir en silence reviendrait à parier sur celui qui a raison, et à
     * valoriser un contrat que l'utilisateur ne détient pas.
     */
    expect(() => massiveOptionContract({ ...validContract, strike_price: 160 })).toThrow(
      /contredit les attributs/,
    );
  });

  it("refuse un symbole qui contredit le type", () => {
    expect(() => massiveOptionContract({ ...validContract, contract_type: "put" })).toThrow(
      /contredit les attributs/,
    );
  });

  it("refuse un symbole qui contredit l'échéance", () => {
    expect(() =>
      massiveOptionContract({ ...validContract, expiration_date: "2026-02-20" }),
    ).toThrow(/contredit les attributs/);
  });

  it("refuse un symbole illisible plutôt que de l'ignorer", () => {
    expect(() => massiveOptionContract({ ...validContract, ticker: "O:PAS_UN_OSI" })).toThrow(
      ProviderError,
    );
  });
});

describe("contrat d'option — validations d'identité", () => {
  it("refuse un type ni call ni put", () => {
    expect(() => massiveOptionContract({ ...validContract, contract_type: "warrant" })).toThrow(
      /ni call ni put/,
    );
  });

  it("refuse une échéance partielle", () => {
    // Une échéance sans jour rendrait deux maturités indiscernables.
    for (const value of ["2026-01", "16/01/2026", "", null]) {
      expect(
        () => massiveOptionContract({ ...validContract, expiration_date: value }),
        String(value),
      ).toThrow(/Échéance illisible/);
    }
  });

  it("refuse un contrat sans sous-jacent", () => {
    const { underlying_ticker, ...orphan } = validContract;
    void underlying_ticker;
    expect(() => massiveOptionContract(orphan)).toThrow(/Sous-jacent absent/);
  });

  it("accepte call et put écrits en une lettre", () => {
    expect(massiveOptionContract({ ...validContract, contract_type: "C" }).optionType).toBe("CALL");
    expect(
      massiveOptionContract({
        ...validContract,
        ticker: "O:AAPL260116P00150000",
        contract_type: "P",
      }).optionType,
    ).toBe("PUT");
  });
});

describe("ligne de chaîne", () => {
  it("n'invente pas de point milieu quand un seul côté existe", () => {
    /*
     * Une fourchette à un seul côté n'a pas de milieu. En calculer un donnerait
     * un prix qui n'a jamais existé sur le marché.
     */
    const contract = massiveChainContract(validContract, { bid: "1.00" });
    expect(contract.bid).toBe("1");
    expect(contract.ask).toBeUndefined();
    expect(contract).not.toHaveProperty("mid");
  });

  it("laisse les champs absents absents plutôt que nuls", () => {
    const contract = massiveChainContract(validContract, {});
    expect(contract).not.toHaveProperty("bid");
    expect(contract).not.toHaveProperty("ask");
    expect(contract).not.toHaveProperty("last");
    expect(contract).not.toHaveProperty("openInterest");
  });

  it("conserve l'intérêt ouvert quand il est publié", () => {
    const contract = massiveChainContract(validContract, { open_interest: 4212 });
    expect(contract.openInterest).toBe(4212);
  });

  it("normalise les prix décimaux du fournisseur", () => {
    const contract = massiveChainContract(validContract, { bid: "1.10000", ask: 1.2 });
    expect(contract.bid).toBe("1.1");
    expect(contract.ask).toBe("1.2");
  });
});

describe("chaîne complète", () => {
  it("écarte les contrats illisibles avec leur raison au lieu de les taire", () => {
    /*
     * Une chaîne à laquelle il manque trois strikes sans que rien ne le dise
     * mène à conclure que le marché ne les cote pas.
     */
    const { chain, rejected } = massiveOptionChain(
      "AAPL",
      [
        { contract: validContract, quote: { bid: "1.00", ask: "1.10" } },
        { contract: { ...validContract, shares_per_contract: undefined } },
        { contract: { ...validContract, contract_type: "warrant" } },
      ],
      "2026-08-24T10:00:00.000Z",
    );

    expect(chain.contracts).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    expect(rejected[0]?.reason).toMatch(/Multiplicateur absent/);
    expect(rejected[1]?.reason).toMatch(/ni call ni put/);
  });

  it("conserve le sous-jacent et l'horodatage", () => {
    const { chain } = massiveOptionChain("AAPL", [], "2026-08-24T10:00:00.000Z");
    expect(chain.underlyingSymbol).toBe("AAPL");
    expect(chain.asOf).toBe("2026-08-24T10:00:00.000Z");
  });
});

describe("futures — échéances jamais fusionnées", () => {
  it("décompose racine et échéance", () => {
    expect(parseFuturesSymbol("ESZ26", 2026)).toMatchObject({
      root: "ES",
      maturity: "2026-12",
      providerSymbol: "ESZ26",
    });
    expect(parseFuturesSymbol("NQH27", 2026)?.maturity).toBe("2027-03");
    expect(parseFuturesSymbol("CLM26", 2026)?.maturity).toBe("2026-06");
  });

  it("ne confond pas deux échéances de la même racine", () => {
    /*
     * Le rapprochement par racine seule fusionnerait deux contrats aux prix et
     * aux échéances différents — la valorisation porterait alors sur un
     * instrument que personne ne détient.
     */
    expect(isSameFuturesContract("ESZ26", "ESH27", 2026)).toBe(false);
    expect(isSameFuturesContract("ESZ26", "ESZ26", 2026)).toBe(true);
    expect(isSameFuturesContract("ESZ26", "NQZ26", 2026)).toBe(false);
  });

  it("résout une année à deux chiffres vers le futur proche", () => {
    // Un contrat coté aujourd'hui n'expire pas un siècle plus tôt.
    expect(parseFuturesSymbol("ESZ05", 2098)?.maturity).toBe("2105-12");
  });

  it("refuse un symbole qui n'est pas un future plutôt que d'en deviner un", () => {
    for (const symbol of ["AAPL", "ES", "ESA26", "ES26", ""]) {
      expect(parseFuturesSymbol(symbol, 2026), symbol).toBeNull();
    }
  });

  it("ne laisse pas le multiplicateur être supposé", () => {
    // Comme pour les options : il doit venir du fournisseur.
    expect(parseFuturesSymbol("ESZ26", 2026)?.multiplier).toBeNull();
  });
});
