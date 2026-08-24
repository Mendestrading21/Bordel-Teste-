import { describe, expect, it } from "vitest";

import type { ResolvedInstrument } from "./contract.js";
import { createEodhdProvider } from "./eodhd-provider.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("EODHD provider", () => {
  it("normalise une recherche réelle sans confondre l'exchange avec un MIC", async () => {
    const provider = createEodhdProvider({
      apiToken: "test",
      mode: "live",
      fetchImpl: async () =>
        response([
          {
            Code: "AAPL",
            Exchange: "US",
            Name: "Apple Inc",
            Type: "Common Stock",
            Country: "USA",
            Currency: "USD",
            ISIN: "US0378331005",
            isPrimary: true,
          },
        ]),
    });

    const result = await provider.search({ text: "AAPL" });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      provider: "eodhd",
      providerSymbol: "AAPL.US",
      assetType: "STOCK",
      currency: "USD",
      exchangeMic: null,
      isin: "US0378331005",
    });
  });

  it("utilise la clé demo uniquement pour les symboles officiellement supportés", async () => {
    const provider = createEodhdProvider({ apiToken: "demo", mode: "demo" });
    const apple = await provider.resolve({ kind: "TICKER", ticker: "AAPL" });
    const unknown = await provider.resolve({ kind: "TICKER", ticker: "NESN" });

    expect(apple?.providerSymbol).toBe("AAPL.US");
    expect(unknown).toBeNull();
    expect(provider.capabilities().searchByText).toBe(false);
  });

  it("normalise le snapshot delayed et conserve le timestamp fournisseur", async () => {
    const provider = createEodhdProvider({
      apiToken: "demo",
      mode: "demo",
      now: () => new Date("2026-08-24T08:00:00.000Z"),
      fetchImpl: async () =>
        response({
          code: "AAPL.US",
          timestamp: 1787550000,
          close: 227.31,
          previousClose: 225.5,
        }),
    });
    const instrument = await provider.resolve({ kind: "TICKER", ticker: "AAPL" });
    if (instrument === null) throw new Error("Fixture AAPL absente");

    const quote = await provider.getSnapshot(instrument);
    expect(quote.price).toBe("227.31");
    expect(quote.previousClose).toBe("225.5");
    expect(quote.freshness).toBe("DELAYED");
    expect(quote.priceType).toBe("LAST_TRADE");
    expect(quote.receivedAt).toBe("2026-08-24T08:00:00.000Z");
  });

  it("valorise un fonds avec EOD/NAV et non avec un faux flux intraday", async () => {
    const provider = createEodhdProvider({
      apiToken: "test",
      mode: "live",
      fetchImpl: async (url) => {
        if (url.includes("/search/")) {
          return response([
            {
              Code: "FUND",
              Exchange: "EUFUND",
              Name: "Example Fund",
              Type: "Fund",
              Country: "LU",
              Currency: "EUR",
              ISIN: "LU0000000001",
              isPrimary: true,
            },
          ]);
        }
        return response([{ date: "2026-08-21", open: 101, high: 101, low: 101, close: 101.42 }]);
      },
    });
    const instrument = await provider.resolve({ kind: "ISIN", isin: "LU0000000001" });
    if (instrument === null) throw new Error("Fonds non résolu");

    const quote = await provider.getSnapshot(instrument);
    expect(quote.freshness).toBe("NAV");
    expect(quote.priceType).toBe("NAV");
    expect(quote.price).toBe("101.42");
    expect(quote.asOf).toContain("2026-08-21");
  });

  it("propage une erreur d'authentification comme UNAUTHORIZED", async () => {
    const provider = createEodhdProvider({
      apiToken: "bad",
      mode: "live",
      fetchImpl: async () => response({ error: "forbidden" }, 403),
    });

    await expect(provider.search({ text: "AAPL" })).rejects.toMatchObject({
      kind: "UNAUTHORIZED",
      provider: "eodhd",
    });
  });
});

const appleInstrument: ResolvedInstrument = {
  provider: "eodhd",
  providerSymbol: "AAPL.US",
  name: "Apple Inc",
  assetType: "STOCK",
  currency: "USD",
  exchangeMic: "XNAS",
  isin: "US0378331005",
  optionContract: null,
};

describe("EODHD — couverture et ambiguïté", () => {
  const options = {
    apiToken: "test",
    mode: "live" as const,
    now: () => new Date("2026-08-24T10:00:00.000Z"),
  };

  function withSearch(rows: readonly unknown[]) {
    return createEodhdProvider({
      ...options,
      fetchImpl: async () =>
        new Response(JSON.stringify(rows), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
  }

  it("déclare les classes qu'il sait réellement servir", () => {
    /*
     * Cette liste est porteuse depuis LIVE-01 : le routeur n'appelle plus un
     * fournisseur pour une classe absente. Elle omettait `FX` alors que
     * `getFxRate` existe — les devises auraient cessé d'être servies sans
     * qu'aucune erreur ne le dise.
     */
    const capabilities = createEodhdProvider(options).capabilities();
    expect(capabilities.assetTypes).toContain("FX");
    expect(capabilities.assetTypes).toContain("INDEX");
    expect(capabilities.assetTypes).toContain("CRYPTO");
    // EODHD ne publie pas de chaîne d'options : l'annoncer ferait router vers
    // lui des requêtes qu'il ne peut pas honorer.
    expect(capabilities.assetTypes).not.toContain("OPTION");
    expect(capabilities.optionChains).toBe(false);
  });

  it("ne jette plus silencieusement les indices et devises trouvés", async () => {
    // Auparavant tout type hors action/ETF/fonds renvoyait `null` et la ligne
    // était ignorée : chercher « S&P 500 » ne donnait rien, sans erreur.
    const provider = withSearch([
      { Code: "GSPC", Exchange: "INDX", Name: "S&P 500", Type: "Index", Currency: "USD" },
      { Code: "EURUSD", Exchange: "FOREX", Name: "EUR/USD", Type: "Currency", Currency: "USD" },
      { Code: "BTC-USD", Exchange: "CC", Name: "Bitcoin", Type: "Crypto", Currency: "USD" },
    ]);

    const candidates = await provider.search({ text: "test", limit: 10 });
    expect(candidates.map((candidate) => candidate.assetType)).toEqual(["INDEX", "FX", "CRYPTO"]);
  });

  it("traduit le code de place EODHD en MIC, et n'invente rien sinon", async () => {
    const provider = withSearch([
      { Code: "NESN", Exchange: "SW", Name: "Nestlé", Type: "Common Stock", Currency: "CHF" },
      { Code: "XYZ", Exchange: "ZZZ", Name: "Inconnu", Type: "Common Stock", Currency: "USD" },
    ]);

    const candidates = await provider.search({ text: "test", limit: 10 });
    expect(candidates[0]?.exchangeMic).toBe("XSWX");
    // Ne rien affirmer vaut mieux qu'affirmer approximativement : un `null` se
    // corrige, une valeur fausse se propage.
    expect(candidates[1]?.exchangeMic).toBeNull();
  });

  it("signale l'ambiguïté au lieu de laisser un autre fournisseur trancher", async () => {
    /*
     * L'ancienne version renvoyait `null`, que le routeur lisait comme « ce
     * fournisseur ne connaît pas » avant de passer au suivant — lequel pouvait
     * choisir tout seul une place et une devise que l'utilisateur n'avait pas
     * demandées.
     */
    const provider = withSearch([
      { Code: "NESN", Exchange: "SW", Name: "Nestlé SA", Type: "Common Stock", Currency: "CHF" },
      { Code: "NESN", Exchange: "F", Name: "Nestlé SA", Type: "Common Stock", Currency: "EUR" },
    ]);

    await expect(provider.resolve({ kind: "TICKER", ticker: "NESN" })).rejects.toMatchObject({
      kind: "AMBIGUOUS",
    });
  });

  it("ne revendique pas LIVE pour un taux d'une devise vers elle-même", async () => {
    // 1 est exact, mais aucun fournisseur ne l'a coté : ce n'est pas une
    // observation de marché.
    const rate = await createEodhdProvider(options).getFxRate?.("CHF", "CHF");
    expect(rate?.rate).toBe("1");
    expect(rate?.freshness).toBe("MANUAL");
  });

  it("n'annonce pas de flux sans implémentation de socket", () => {
    expect(createEodhdProvider(options).capabilities().streaming).toBe(false);
    expect(createEodhdProvider(options).subscribe).toBeUndefined();
  });
});

describe("EODHD — flux temps réel", () => {
  function fakeSocket() {
    const listeners = new Map<string, ((event?: unknown) => void)[]>();
    const sent: string[] = [];
    let closed = false;
    return {
      url: "",
      sent,
      get closed() {
        return closed;
      },
      socket: {
        send: (data: string) => sent.push(data),
        close: () => {
          closed = true;
        },
        addEventListener: (type: string, listener: (event?: unknown) => void) => {
          listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        },
      },
      fire(type: string, event?: unknown) {
        for (const listener of listeners.get(type) ?? []) listener(event);
      },
    };
  }

  it("ouvre un socket par canal et non par instrument", async () => {
    // Vingt positions sur trois classes doivent tenir en trois connexions.
    const created: ReturnType<typeof fakeSocket>[] = [];
    const provider = createEodhdProvider({
      apiToken: "test",
      mode: "live",
      socketFactory: (url) => {
        const entry = fakeSocket();
        entry.url = url;
        created.push(entry);
        return entry.socket as never;
      },
    });

    await provider.subscribe?.(
      [
        { ...appleInstrument },
        { ...appleInstrument, providerSymbol: "MSFT.US", name: "Microsoft" },
        { ...appleInstrument, providerSymbol: "EURUSD.FOREX", assetType: "FX", name: "EUR/USD" },
      ],
      () => undefined,
    );

    expect(created).toHaveLength(2);
    expect(created.map((entry) => new URL(entry.url).pathname)).toEqual(["/ws/us", "/ws/forex"]);
  });

  it("s'abonne avec les symboles de flux et non les symboles REST", async () => {
    const created: ReturnType<typeof fakeSocket>[] = [];
    const provider = createEodhdProvider({
      apiToken: "test",
      mode: "live",
      socketFactory: (url) => {
        const entry = fakeSocket();
        entry.url = url;
        created.push(entry);
        return entry.socket as never;
      },
    });

    await provider.subscribe?.([appleInstrument], () => undefined);
    created[0]?.fire("open");

    // `AAPL.US` donnerait un abonnement accepté et définitivement muet.
    expect(created[0]?.sent).toEqual([JSON.stringify({ action: "subscribe", symbols: "AAPL" })]);
  });

  it("transmet un tick normalisé et ignore le bruit", async () => {
    const created: ReturnType<typeof fakeSocket>[] = [];
    const received: string[] = [];
    const provider = createEodhdProvider({
      apiToken: "test",
      mode: "live",
      now: () => new Date("2026-08-24T10:00:00.000Z"),
      socketFactory: (url) => {
        const entry = fakeSocket();
        entry.url = url;
        created.push(entry);
        return entry.socket as never;
      },
    });

    await provider.subscribe?.([appleInstrument], (quote) => received.push(quote.price));
    const socket = created[0];
    socket?.fire("open");

    socket?.fire("message", { data: JSON.stringify({ status_code: 200, message: "Authorized" }) });
    socket?.fire("message", { data: "pas du JSON" });
    socket?.fire("message", {
      data: JSON.stringify({ s: "INCONNU", p: "1", t: 1_787_500_800_000 }),
    });
    socket?.fire("message", {
      data: JSON.stringify({ s: "AAPL", p: "227.31000", t: 1_787_500_800_000 }),
    });

    expect(received).toEqual(["227.31"]);
  });

  it("ferme tous les sockets au désabonnement", async () => {
    const created: ReturnType<typeof fakeSocket>[] = [];
    const provider = createEodhdProvider({
      apiToken: "test",
      mode: "live",
      socketFactory: (url) => {
        const entry = fakeSocket();
        entry.url = url;
        created.push(entry);
        return entry.socket as never;
      },
    });

    const handle = await provider.subscribe?.(
      [appleInstrument, { ...appleInstrument, providerSymbol: "EURUSD.FOREX", assetType: "FX" }],
      () => undefined,
    );
    await handle?.unsubscribe();

    expect(created.every((entry) => entry.closed)).toBe(true);
  });
});
