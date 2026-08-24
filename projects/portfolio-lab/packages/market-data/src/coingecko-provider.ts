import type { CurrencyCode, DecimalString } from "@portfolio-lab/domain";

import { providerDecimal } from "./provider-decimal.js";
import {
  ProviderError,
  type HistoryRequest,
  type InstrumentCandidate,
  type InstrumentReference,
  type InstrumentSearchQuery,
  type MarketDataProvider,
  type NormalizedQuote,
  type PriceBar,
  type ProviderCapabilities,
  type ResolvedInstrument,
} from "./contract.js";

export const COINGECKO_PROVIDER_ID = "coingecko";
export type CoinGeckoMode = "keyless" | "demo" | "live";
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type CoinGeckoProviderOptions = {
  readonly mode: CoinGeckoMode;
  readonly apiKey?: string;
  readonly fetchImpl?: FetchLike;
  readonly timeoutMs?: number;
  readonly quoteCurrency?: CurrencyCode;
  readonly now?: () => Date;
};

type MarketRow = {
  id?: unknown;
  symbol?: unknown;
  name?: unknown;
  current_price?: unknown;
  last_updated?: unknown;
  market_cap_rank?: unknown;
};

type SimplePricePayload = Record<string, Record<string, unknown>>;
type MarketChartPayload = { prices?: unknown };

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Normalisation décimale du fournisseur — voir `provider-decimal.ts`. */
function decimal(value: unknown, field: string): DecimalString {
  return providerDecimal(value, COINGECKO_PROVIDER_ID, field);
}

/**
 * Extrait un extrait du corps d'une réponse en erreur.
 *
 * Sans lui, un `403` ne laisse que son code — et un `403` d'une passerelle
 * réseau à liste blanche devient indiscernable d'un `403` du fournisseur. Le
 * rapport de couverture conclut alors « clé refusée » alors que la requête
 * n'a jamais quitté la machine, et on cherche une clé pour un problème qui est
 * ailleurs.
 *
 * Le corps est tronqué : il sert à diagnostiquer, pas à être journalisé en
 * entier. Une lecture qui échoue rend une chaîne vide plutôt que de masquer
 * l'erreur d'origine.
 */
async function errorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.trim().slice(0, 300);
  } catch {
    return "";
  }
}

/** Message d'erreur HTTP incluant l'extrait de corps quand il existe. */
function httpMessage(prefix: string, status: number, body: string): string {
  return body === "" ? `${prefix} HTTP ${status}` : `${prefix} HTTP ${status} — ${body}`;
}

export function createCoinGeckoProvider(options: CoinGeckoProviderOptions): MarketDataProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const quoteCurrency = options.quoteCurrency ?? "USD";
  const now = options.now ?? (() => new Date());
  const baseUrl =
    options.mode === "live"
      ? "https://pro-api.coingecko.com/api/v3"
      : "https://api.coingecko.com/api/v3";

  async function requestJson(
    path: string,
    params: Readonly<Record<string, string>>,
  ): Promise<unknown> {
    const url = new URL(`${baseUrl}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.apiKey !== undefined) {
      headers[options.mode === "live" ? "x-cg-pro-api-key" : "x-cg-demo-api-key"] = options.apiKey;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url.toString(), { signal: controller.signal, headers });
      if (response.status === 401 || response.status === 403) {
        throw new ProviderError(
          "UNAUTHORIZED",
          COINGECKO_PROVIDER_ID,
          httpMessage("CoinGecko", response.status, await errorBody(response)),
        );
      }
      if (response.status === 429) {
        const retry = response.headers.get("retry-after");
        throw new ProviderError(
          "RATE_LIMITED",
          COINGECKO_PROVIDER_ID,
          "CoinGecko rate limit atteint",
          retry === null ? null : Number.parseInt(retry, 10),
        );
      }
      if (response.status === 404) {
        throw new ProviderError("NOT_FOUND", COINGECKO_PROVIDER_ID, "Crypto CoinGecko introuvable");
      }
      if (!response.ok)
        throw new ProviderError(
          "NETWORK",
          COINGECKO_PROVIDER_ID,
          `CoinGecko HTTP ${response.status}`,
        );
      return await response.json();
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ProviderError(
        "NETWORK",
        COINGECKO_PROVIDER_ID,
        `CoinGecko indisponible : ${message}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function marketSearch(text: string): Promise<readonly MarketRow[]> {
    const common = {
      vs_currency: quoteCurrency.toLowerCase(),
      per_page: "50",
      page: "1",
      sparkline: "false",
      precision: "full",
    };
    const bySymbol = await requestJson("coins/markets", {
      ...common,
      symbols: text.toLowerCase(),
      include_tokens: "all",
    });
    if (Array.isArray(bySymbol) && bySymbol.length > 0) return bySymbol as MarketRow[];
    const byName = await requestJson("coins/markets", { ...common, names: text });
    return Array.isArray(byName) ? (byName as MarketRow[]) : [];
  }

  async function search(query: InstrumentSearchQuery): Promise<readonly InstrumentCandidate[]> {
    if (query.assetTypes !== undefined && !query.assetTypes.includes("CRYPTO")) return [];
    const text = query.text.trim();
    if (text === "") return [];
    const rows = await marketSearch(text);
    const needle = text.toLowerCase();
    return rows.slice(0, query.limit ?? 20).flatMap((row): InstrumentCandidate[] => {
      const id = str(row.id);
      const symbol = str(row.symbol);
      const name = str(row.name);
      if (id === null || symbol === null || name === null) return [];
      const rank =
        typeof row.market_cap_rank === "number" && row.market_cap_rank > 0
          ? row.market_cap_rank
          : 999999;
      return [
        {
          provider: COINGECKO_PROVIDER_ID,
          providerSymbol: id,
          name,
          assetType: "CRYPTO",
          currency: quoteCurrency,
          exchangeMic: null,
          isin: null,
          figi: null,
          countryCode: null,
          confidence:
            id.toLowerCase() === needle ||
            symbol.toLowerCase() === needle ||
            name.toLowerCase() === needle
              ? Math.max(0.8, 1 - Math.min(rank, 1000) / 10000)
              : 0.5,
        },
      ];
    });
  }

  async function resolve(ref: InstrumentReference): Promise<ResolvedInstrument | null> {
    if (ref.kind === "PROVIDER_SYMBOL") {
      if (ref.provider !== COINGECKO_PROVIDER_ID) return null;
      const payload = await requestJson(`coins/${encodeURIComponent(ref.symbol)}`, {
        localization: "false",
        tickers: "false",
        market_data: "false",
        community_data: "false",
        developer_data: "false",
        sparkline: "false",
      });
      if (typeof payload !== "object" || payload === null) return null;
      const name = str((payload as { name?: unknown }).name);
      if (name === null) return null;
      return {
        provider: COINGECKO_PROVIDER_ID,
        providerSymbol: ref.symbol,
        name,
        assetType: "CRYPTO",
        currency: quoteCurrency,
        exchangeMic: null,
        isin: null,
        optionContract: null,
      };
    }
    if (ref.kind !== "TICKER") return null;

    /*
     * La résolution par ticker travaille sur les lignes brutes et non sur les
     * candidats normalisés, pour une raison précise : `providerSymbol` porte
     * l'**identifiant CoinGecko** (`bitcoin`), pas le ticker (`btc`). L'ancien
     * filtre comparait le ticker demandé à cet identifiant et au nom, si bien
     * que résoudre « BTC » ne pouvait jamais aboutir — la recherche rendait
     * pourtant des résultats. Le ticker n'existe que dans la ligne brute.
     */
    const rows = await marketSearch(ref.ticker);
    const needle = ref.ticker.trim().toLowerCase();

    const matches = rows.flatMap((row) => {
      const id = str(row.id);
      const symbol = str(row.symbol);
      const name = str(row.name);
      if (id === null || symbol === null || name === null) return [];
      const isMatch =
        symbol.toLowerCase() === needle ||
        id.toLowerCase() === needle ||
        name.toLowerCase() === needle;
      if (!isMatch) return [];
      const rank =
        typeof row.market_cap_rank === "number" && row.market_cap_rank > 0
          ? row.market_cap_rank
          : null;
      return [{ id, symbol, name, rank }];
    });

    if (matches.length === 0) return null;

    if (matches.length > 1) {
      /*
       * Plusieurs jetons partagent le même ticker — c'est la règle plutôt que
       * l'exception en crypto, où n'importe qui peut émettre un jeton nommé
       * `UNI` ou `SOL`.
       *
       * Choisir le mieux classé serait le réflexe naturel et serait faux : un
       * utilisateur qui détient le jeton obscur verrait son patrimoine
       * valorisé au cours de l'homonyme capitalisé, sans rien pour le lui
       * signaler. L'identifiant CoinGecko de chaque candidat figure dans le
       * message, puisque c'est lui qui lève l'ambiguïté.
       */
      const ordered = [...matches].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
      throw new ProviderError(
        "AMBIGUOUS",
        COINGECKO_PROVIDER_ID,
        `${matches.length} actifs portent « ${ref.ticker} » : ${ordered
          .map(
            (item) =>
              `${item.name} (id ${item.id}${item.rank === null ? "" : `, rang ${item.rank}`})`,
          )
          .join(", ")}. Précisez l'identifiant CoinGecko.`,
      );
    }

    const hit = matches[0];
    if (hit === undefined) return null;
    return {
      provider: COINGECKO_PROVIDER_ID,
      providerSymbol: hit.id,
      name: hit.name,
      assetType: "CRYPTO",
      currency: quoteCurrency,
      exchangeMic: null,
      isin: null,
      optionContract: null,
    };
  }

  return {
    id: COINGECKO_PROVIDER_ID,
    capabilities(): ProviderCapabilities {
      return {
        assetTypes: ["CRYPTO"],
        searchByText: true,
        searchByIsin: false,
        optionChains: false,
        fx: false,
        history: true,
        streaming: false,
        bestFreshness: "DELAYED",
        delayMinutes: null,
      };
    },
    search,
    resolve,
    async getSnapshot(instrument: ResolvedInstrument): Promise<NormalizedQuote> {
      const key = quoteCurrency.toLowerCase();
      const payload = (await requestJson("simple/price", {
        ids: instrument.providerSymbol,
        vs_currencies: key,
        include_last_updated_at: "true",
        precision: "full",
      })) as SimplePricePayload;
      const row = payload[instrument.providerSymbol];
      if (row === undefined)
        throw new ProviderError(
          "NOT_FOUND",
          COINGECKO_PROVIDER_ID,
          `Prix absent : ${instrument.providerSymbol}`,
        );
      const updated = row["last_updated_at"];
      if (typeof updated !== "number")
        throw new ProviderError(
          "MALFORMED_RESPONSE",
          COINGECKO_PROVIDER_ID,
          "Timestamp CoinGecko absent",
        );
      return {
        instrumentId: instrument.providerSymbol,
        provider: COINGECKO_PROVIDER_ID,
        providerSymbol: instrument.providerSymbol,
        currency: quoteCurrency,
        price: decimal(row[key], key),
        priceType: "LAST_TRADE",
        freshness: "DELAYED",
        asOf: new Date(updated * 1000).toISOString(),
        receivedAt: now().toISOString(),
        marketState: "OPEN",
      };
    },
    async getHistory(request: HistoryRequest): Promise<readonly PriceBar[]> {
      const from = Math.floor(new Date(request.from).getTime() / 1000);
      const to = Math.floor(new Date(request.to).getTime() / 1000);
      const payload = (await requestJson(
        `coins/${encodeURIComponent(request.instrument.providerSymbol)}/market_chart/range`,
        {
          vs_currency: quoteCurrency.toLowerCase(),
          from: String(from),
          to: String(to),
          precision: "full",
        },
      )) as MarketChartPayload;
      if (!Array.isArray(payload.prices))
        throw new ProviderError(
          "MALFORMED_RESPONSE",
          COINGECKO_PROVIDER_ID,
          "Historique CoinGecko invalide",
        );

      const daily = new Map<string, DecimalString>();
      for (const point of payload.prices) {
        if (!Array.isArray(point) || typeof point[0] !== "number") continue;
        const date = new Date(point[0]).toISOString().slice(0, 10);
        daily.set(date, decimal(point[1], "price"));
      }
      return [...daily.entries()].map(([date, close]) => ({
        date,
        open: null,
        high: null,
        low: null,
        close,
        currency: quoteCurrency,
      }));
    },
  };
}
