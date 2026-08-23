import { describe, expect, it } from "vitest";

import { toDecimalString, type DecimalString } from "@portfolio-lab/domain";

import { DEMO_OPTION_CHAIN, DEMO_UNDERLYING } from "./demo-chain.js";
import { GREEK_LABEL, parseGreeks, presentGreeks } from "./greeks.js";
import {
  CONTRACT_WARNING_LABEL,
  expirationsOf,
  findContract,
  inspectContract,
  moneyness,
  STANDARD_MULTIPLIER,
} from "./option-chain.js";
import { parseOsiSymbol } from "./osi.js";

const d = (value: string): DecimalString => toDecimalString(value);

describe("chaîne de démonstration", () => {
  it("porte le sous-jacent du seed", () => {
    expect(DEMO_OPTION_CHAIN.underlyingSymbol).toBe(DEMO_UNDERLYING);
  });

  it("couvre les trois situations que la valorisation doit distinguer", () => {
    // Une chaîne où tout serait liquide ne prouverait rien de la logique de
    // repli.
    const contracts = DEMO_OPTION_CHAIN.contracts;
    expect(contracts.some((c) => c.bid !== undefined && c.ask !== undefined)).toBe(true);
    expect(contracts.some((c) => c.bid === undefined && c.last === undefined)).toBe(true);
    expect(contracts.some((c) => c.expiration < "2026-08-21")).toBe(true);
  });

  it("donne à chaque contrat un symbole OSI relisible", () => {
    for (const contract of DEMO_OPTION_CHAIN.contracts) {
      const parsed = parseOsiSymbol(contract.osiSymbol ?? "");
      expect(parsed, contract.providerSymbol).not.toBeNull();
      expect(parsed?.expiration).toBe(contract.expiration);
      expect(parsed?.optionType).toBe(contract.optionType);
    }
  });

  it("contient un contrat au multiplicateur non standard", () => {
    // C'est l'erreur la plus coûteuse du domaine : elle fausse la valeur d'un
    // facteur entier sans rien casser.
    expect(DEMO_OPTION_CHAIN.contracts.some((c) => c.multiplier !== STANDARD_MULTIPLIER)).toBe(
      true,
    );
  });
});

describe("expirationsOf", () => {
  it("liste les échéances sans doublon, par ordre chronologique", () => {
    const expirations = expirationsOf(DEMO_OPTION_CHAIN);
    expect(expirations).toEqual([...expirations].sort());
    expect(new Set(expirations).size).toBe(expirations.length);
  });
});

describe("strikesOf", () => {
  it("trie numériquement et non lexicographiquement", async () => {
    const { strikesOf } = await import("./option-chain.js");
    const strikes = strikesOf(DEMO_OPTION_CHAIN, "2027-01-15", "CALL");
    // Un tri de chaînes placerait « 100 » avant « 90 », rendant la liste
    // illisible.
    expect(strikes).toEqual(["90", "100", "110", "200"]);
  });

  it("distingue call et put", async () => {
    const { strikesOf } = await import("./option-chain.js");
    const calls = strikesOf(DEMO_OPTION_CHAIN, "2027-01-15", "CALL");
    const puts = strikesOf(DEMO_OPTION_CHAIN, "2027-01-15", "PUT");
    expect(calls).not.toEqual(puts);
  });

  it("renvoie une liste vide pour une échéance inconnue", async () => {
    const { strikesOf } = await import("./option-chain.js");
    expect(strikesOf(DEMO_OPTION_CHAIN, "2030-01-01", "CALL")).toEqual([]);
  });
});

describe("findContract", () => {
  it("retrouve un contrat exact", () => {
    const contract = findContract(DEMO_OPTION_CHAIN, {
      optionType: "CALL",
      expiration: "2027-01-15",
      strike: d("100"),
    });
    expect(contract?.optionType).toBe("CALL");
    expect(contract?.strike).toBe("100");
  });

  it("compare les strikes en décimal et non en chaîne", () => {
    // « 200 » et « 200.000 » désignent le même contrat.
    const contract = findContract(DEMO_OPTION_CHAIN, {
      optionType: "CALL",
      expiration: "2027-01-15",
      strike: d("100.000"),
    });
    expect(contract).not.toBeNull();
  });

  it("ne retrouve rien si un attribut diffère", () => {
    expect(
      findContract(DEMO_OPTION_CHAIN, {
        optionType: "PUT",
        expiration: "2027-01-15",
        strike: d("110"),
      }),
    ).toBeNull();
  });
});

describe("moneyness", () => {
  it("calcule l'écart relatif au cours du sous-jacent", () => {
    expect(moneyness(d("110"), d("100"))).toBe("0.100000");
    expect(moneyness(d("90"), d("100"))).toBe("-0.100000");
  });

  it("renvoie null sur un cours nul", () => {
    expect(moneyness(d("100"), d("0"))).toBeNull();
  });
});

describe("inspectContract", () => {
  const liquide = DEMO_OPTION_CHAIN.contracts[1];
  const illiquide = DEMO_OPTION_CHAIN.contracts.find((c) => c.strike === "200");
  const ajuste = DEMO_OPTION_CHAIN.contracts.find((c) => c.multiplier === "112");
  const sansCotation = DEMO_OPTION_CHAIN.contracts.find((c) => c.strike === "40");

  it("ne signale rien sur un contrat liquide standard", () => {
    expect(inspectContract(liquide!, 147)).toEqual([]);
  });

  it("signale un multiplicateur non standard", () => {
    const warnings = inspectContract(ajuste!, 500);
    expect(warnings.map((w) => w.kind)).toContain("UNUSUAL_MULTIPLIER");
  });

  it("signale un contrat expiré", () => {
    expect(inspectContract(liquide!, -1).map((w) => w.kind)).toContain("EXPIRED");
  });

  it("signale une échéance imminente", () => {
    expect(inspectContract(liquide!, 3).map((w) => w.kind)).toContain("EXPIRING_SOON");
  });

  it("signale l'absence totale de cotation", () => {
    expect(inspectContract(sansCotation!, 147).map((w) => w.kind)).toContain("NO_QUOTES");
  });

  it("signale une fourchette aberrante", () => {
    expect(inspectContract(illiquide!, 147).map((w) => w.kind)).toContain("WIDE_SPREAD");
  });

  it("signale l'absence de symbole canonique", () => {
    const sansOsi = { ...liquide!, osiSymbol: null };
    expect(inspectContract(sansOsi, 147).map((w) => w.kind)).toContain("MISSING_OSI");
  });

  it("explique chaque avertissement en français", () => {
    for (const kind of Object.keys(
      CONTRACT_WARNING_LABEL,
    ) as (keyof typeof CONTRACT_WARNING_LABEL)[]) {
      expect(CONTRACT_WARNING_LABEL[kind].length).toBeGreaterThan(10);
    }
  });

  it("mentionne le split dans l'avertissement de multiplicateur", () => {
    // L'utilisateur doit comprendre pourquoi un multiplicateur peut légitimement
    // différer de 100.
    expect(CONTRACT_WARNING_LABEL.UNUSUAL_MULTIPLIER).toContain("split");
  });
});

describe("greeks", () => {
  it("accepte des sensibilités publiées par un fournisseur", () => {
    const greeks = parseGreeks(
      { delta: "0.55", gamma: "0.02", impliedVolatility: "0.32" },
      "massive",
      "2026-08-21T20:00:00.000Z",
    );
    expect(greeks?.delta).toBe("0.55");
    expect(greeks?.provider).toBe("massive");
  });

  it("refuse des sensibilités sans source", () => {
    // Sans fournisseur ni horodatage, une sensibilité n'est pas attribuable.
    expect(parseGreeks({ delta: "0.55" }, "", "2026-08-21T20:00:00.000Z")).toBeNull();
    expect(parseGreeks({ delta: "0.55" }, "massive", "")).toBeNull();
    expect(parseGreeks({ delta: "0.55" }, "massive", "pas-une-date")).toBeNull();
  });

  it("refuse un objet dont aucune sensibilité n'est exploitable", () => {
    expect(parseGreeks({ delta: "abc" }, "massive", "2026-08-21T20:00:00.000Z")).toBeNull();
    expect(parseGreeks({}, "massive", "2026-08-21T20:00:00.000Z")).toBeNull();
  });

  it("refuse une valeur transmise en nombre", () => {
    expect(parseGreeks({ delta: 0.55 }, "massive", "2026-08-21T20:00:00.000Z")).toBeNull();
  });

  it("explique clairement qu'aucune sensibilité n'est calculée", () => {
    // ROADMAP.md : « Greeks seulement si sourcés ». Un delta issu de nos
    // propres hypothèses ne serait pas une donnée de marché.
    const presentation = presentGreeks(null);
    expect(presentation.available).toBe(false);
    if (!presentation.available) {
      expect(presentation.reason).toContain("n'en calcule aucune");
    }
  });

  it("libelle chaque sensibilité en français", () => {
    for (const label of Object.values(GREEK_LABEL)) {
      expect(label).toBeTruthy();
    }
    expect(GREEK_LABEL.theta).toBe("Thêta");
  });
});
