import {
  createCoinGeckoProvider,
  createEodhdProvider,
  createTwelveDataProvider,
  type MarketDataProvider,
  type ResolvedInstrument,
} from "../packages/market-data/src/index.ts";

const results: Array<{ provider: string; test: string; ok: boolean; detail: string }> = [];

async function record(provider: string, test: string, action: () => Promise<string>): Promise<void> {
  try {
    results.push({ provider, test, ok: true, detail: await action() });
  } catch (error) {
    results.push({
      provider,
      test,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function snapshot(provider: MarketDataProvider, instrument: ResolvedInstrument): Promise<string> {
  const quote = await provider.getSnapshot(instrument);
  return `${instrument.providerSymbol}=${quote.price} ${quote.currency} [${quote.freshness}] @ ${quote.asOf}`;
}

const eodhd = createEodhdProvider({
  apiToken: process.env.EODHD_API_KEY ?? "demo",
  mode: process.env.EODHD_API_KEY ? "live" : "demo",
});

await record("EODHD", "AAPL snapshot", async () => {
  const instrument = await eodhd.resolve({ kind: "TICKER", ticker: "AAPL" });
  if (instrument === null) throw new Error("AAPL non résolu");
  return snapshot(eodhd, instrument);
});

await record("EODHD", "EUR/USD FX", async () => {
  const quote = await eodhd.getFxRate?.("EUR", "USD");
  if (quote === undefined) throw new Error("FX non supporté");
  return `EUR/USD=${quote.rate} [${quote.freshness}] @ ${quote.asOf}`;
});

const twelve = createTwelveDataProvider({
  apiKey: process.env.TWELVE_DATA_API_KEY ?? "demo",
  mode: process.env.TWELVE_DATA_API_KEY ? "live" : "demo",
  freshness: process.env.TWELVE_DATA_FRESHNESS === "LIVE" ? "LIVE" : "DELAYED",
});

await record("Twelve Data", "AAPL search + snapshot", async () => {
  const candidates = await twelve.search({ text: "AAPL", limit: 10 });
  const hit = candidates.find((candidate) => candidate.providerSymbol === "AAPL");
  if (hit === undefined) throw new Error("AAPL non trouvé");
  return snapshot(twelve, {
    provider: hit.provider,
    providerSymbol: hit.providerSymbol,
    name: hit.name,
    assetType: hit.assetType,
    currency: hit.currency,
    exchangeMic: hit.exchangeMic,
    isin: hit.isin,
    optionContract: null,
  });
});

const coinGecko = createCoinGeckoProvider({
  mode: process.env.COINGECKO_API_KEY ? "demo" : "keyless",
  apiKey: process.env.COINGECKO_API_KEY,
});

await record("CoinGecko", "Bitcoin USD", async () => snapshot(coinGecko, {
  provider: "coingecko",
  providerSymbol: "bitcoin",
  name: "Bitcoin",
  assetType: "CRYPTO",
  currency: "USD",
  exchangeMic: null,
  isin: null,
  optionContract: null,
}));

console.table(results);

const failures = results.filter((result) => !result.ok);
if (failures.length > 0) {
  console.error(`\n${failures.length}/${results.length} smoke tests ont échoué.`);
  process.exitCode = 1;
} else {
  console.log(`\n${results.length}/${results.length} smoke tests externes réussis.`);
}
