/**
 * Vérification externe des fournisseurs de données de marché.
 *
 * Ce script sort du réseau. Il n'est donc **pas** exécuté en CI : son rôle est
 * de dire ce qu'un fournisseur répond réellement, aujourd'hui, avec les accès
 * dont dispose la machine qui l'exécute.
 *
 * Il distingue trois situations que l'on confond facilement, et cette
 * distinction est tout l'intérêt du script :
 *
 * - `BLOQUÉ` — la requête n'a jamais atteint le fournisseur. Un environnement
 *   d'exécution avec liste blanche de sortie répond lui-même `403` avec son
 *   propre corps. Sans ce cas, le rapport dirait « EODHD HTTP 403 », ce qu'un
 *   lecteur comprendrait comme « EODHD a refusé notre clé » — un diagnostic
 *   faux, et le genre d'erreur qui fait chercher au mauvais endroit pendant
 *   une heure.
 * - `ÉCHEC` — le fournisseur a répondu, et sa réponse est une erreur. C'est un
 *   vrai résultat : clé absente, plan insuffisant, symbole inconnu.
 * - `OK` — le fournisseur a répondu des données exploitables.
 *
 * Aucun résultat n'est inventé : un test qui n'a pas obtenu de réponse est
 * marqué `BLOQUÉ`, jamais `OK` et jamais `ÉCHEC`.
 */
import {
  createCoinGeckoProvider,
  createEodhdProvider,
  createTwelveDataProvider,
  type MarketDataProvider,
  type ResolvedInstrument,
} from "../packages/market-data/src/index.ts";

type Status = "OK" | "ÉCHEC" | "BLOQUÉ";

type Result = {
  readonly provider: string;
  readonly test: string;
  readonly statut: Status;
  readonly detail: string;
};

const results: Result[] = [];

/* ------------------------------------------------------- joignabilité hôte */

type Reach = { readonly kind: "REACHABLE" } | { readonly kind: "BLOCKED"; readonly reason: string };

/**
 * Signatures d'une passerelle de sortie qui intercepte la requête.
 *
 * On cherche le corps de la réponse, pas seulement le code : un `403` seul est
 * ambigu — le fournisseur en renvoie aussi. Le corps, lui, tranche.
 */
const GATEWAY_SIGNATURES = [
  /not in allowlist/i,
  /egress/i,
  /blocked by (?:proxy|policy)/i,
  /forbidden by proxy/i,
];

const reachability = new Map<string, Reach>();

async function probe(url: string): Promise<Reach> {
  const host = new URL(url).host;
  const cached = reachability.get(host);
  if (cached !== undefined) return cached;

  let verdict: Reach;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const body = (await response.text()).slice(0, 400);
    const signature = GATEWAY_SIGNATURES.find((pattern) => pattern.test(body));
    verdict =
      signature === undefined
        ? { kind: "REACHABLE" }
        : { kind: "BLOCKED", reason: `HTTP ${response.status} — ${body.trim()}` };
  } catch (error) {
    // Une connexion impossible n'est pas un refus du fournisseur.
    verdict = {
      kind: "BLOCKED",
      reason: `connexion impossible : ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  reachability.set(host, verdict);
  return verdict;
}

async function record(
  provider: string,
  test: string,
  probeUrl: string,
  action: () => Promise<string>,
): Promise<void> {
  const reach = await probe(probeUrl);
  if (reach.kind === "BLOCKED") {
    results.push({ provider, test, statut: "BLOQUÉ", detail: reach.reason });
    return;
  }
  try {
    results.push({ provider, test, statut: "OK", detail: await action() });
  } catch (error) {
    results.push({
      provider,
      test,
      statut: "ÉCHEC",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function snapshot(
  provider: MarketDataProvider,
  instrument: ResolvedInstrument,
): Promise<string> {
  const quote = await provider.getSnapshot(instrument);
  return `${instrument.providerSymbol}=${quote.price} ${quote.currency} [${quote.freshness}] @ ${quote.asOf}`;
}

/* ------------------------------------------------------------------ EODHD */

const eodhd = createEodhdProvider({
  apiToken: process.env["EODHD_API_KEY"] ?? "demo",
  mode: process.env["EODHD_API_KEY"] === undefined ? "demo" : "live",
});

const EODHD_PROBE = "https://eodhd.com/api/real-time/AAPL.US?api_token=demo&fmt=json";

await record("EODHD", "AAPL snapshot", EODHD_PROBE, async () => {
  const instrument = await eodhd.resolve({ kind: "TICKER", ticker: "AAPL" });
  if (instrument === null) throw new Error("AAPL non résolu");
  return snapshot(eodhd, instrument);
});

await record("EODHD", "EUR/USD FX", EODHD_PROBE, async () => {
  const quote = await eodhd.getFxRate?.("EUR", "USD");
  if (quote === undefined) throw new Error("FX non supporté");
  return `EUR/USD=${quote.rate} [${quote.freshness}] @ ${quote.asOf}`;
});

/* ------------------------------------------------------------ Twelve Data */

const twelve = createTwelveDataProvider({
  apiKey: process.env["TWELVE_DATA_API_KEY"] ?? "demo",
  mode: process.env["TWELVE_DATA_API_KEY"] === undefined ? "demo" : "live",
  freshness: process.env["TWELVE_DATA_FRESHNESS"] === "LIVE" ? "LIVE" : "DELAYED",
});

const TWELVE_PROBE = "https://api.twelvedata.com/quote?symbol=AAPL&apikey=demo";

await record("Twelve Data", "AAPL search + snapshot", TWELVE_PROBE, async () => {
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

/* -------------------------------------------------------------- CoinGecko */

const coinGeckoKey = process.env["COINGECKO_API_KEY"];
const coinGecko = createCoinGeckoProvider({
  mode: coinGeckoKey === undefined ? "keyless" : "demo",
  ...(coinGeckoKey === undefined ? {} : { apiKey: coinGeckoKey }),
});

const COINGECKO_PROBE = "https://api.coingecko.com/api/v3/ping";

await record("CoinGecko", "Bitcoin USD", COINGECKO_PROBE, async () =>
  snapshot(coinGecko, {
    provider: "coingecko",
    providerSymbol: "bitcoin",
    name: "Bitcoin",
    assetType: "CRYPTO",
    currency: "USD",
    exchangeMic: null,
    isin: null,
    optionContract: null,
  }),
);

/* ----------------------------------------------------------------- verdict */

console.table(results);

const blocked = results.filter((result) => result.statut === "BLOQUÉ");
const failed = results.filter((result) => result.statut === "ÉCHEC");
const passed = results.filter((result) => result.statut === "OK");

console.log("");
console.log(`OK      : ${passed.length}/${results.length}`);
console.log(`ÉCHEC   : ${failed.length}/${results.length}`);
console.log(`BLOQUÉ  : ${blocked.length}/${results.length}`);

if (blocked.length === results.length && results.length > 0) {
  console.log("");
  console.log("VERDICT : NON CONCLUANT — aucune requête n'a atteint un fournisseur.");
  console.log(
    "Les hôtes ci-dessus sont refusés par la politique de sortie réseau de cet environnement.",
  );
  console.log("Ce résultat ne dit rien de l'état des fournisseurs ni de la validité des clés.");
  // Code distinct de 1 : rien n'a été testé, ce n'est pas un échec de test.
  process.exitCode = 2;
} else if (failed.length > 0) {
  console.log("");
  console.log(
    `VERDICT : ÉCHEC — ${failed.length} test(s) ont reçu une réponse fournisseur en erreur.`,
  );
  process.exitCode = 1;
} else {
  console.log("");
  console.log(`VERDICT : SUCCÈS — ${passed.length} test(s) ont reçu de vraies données.`);
}
