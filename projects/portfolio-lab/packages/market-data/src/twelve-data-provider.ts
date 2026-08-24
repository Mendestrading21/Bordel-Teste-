import {
  isCurrencyCode,
  toDecimalString,
  type AssetType,
  type CurrencyCode,
  type DecimalString,
} from "@portfolio-lab/domain";

import { providerDecimal } from "./provider-decimal.js";
import {
  ProviderError,
  type FxQuote,
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

export const TWELVE_DATA_PROVIDER_ID = "twelvedata";
export type TwelveDataMode = "demo" | "live";
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type TwelveDataProviderOptions = {
  readonly apiKey: string;
  readonly mode: TwelveDataMode;
  readonly fetchImpl?: FetchLike;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
  /** Niveau réellement souscrit. Ne jamais annoncer LIVE juste parce qu'une clé existe. */
  readonly freshness?: "LIVE" | "DELAYED";
  readonly delayMinutes?: number | null;
};

type SymbolSearchRow = {
  symbol?: unknown;
  instrument_name?: unknown;
  exchange?: unknown;
  mic_code?: unknown;
  instrument_type?: unknown;
  country?: unknown;
  currency?: unknown;
};

type SymbolSearchResponse = { data?: unknown; status?: unknown; code?: unknown; message?: unknown };
type QuoteResponse = {
  symbol?: unknown;
  name?: unknown;
  exchange?: unknown;
  mic_code?: unknown;
  currency?: unknown;
  timestamp?: unknown;
  last_quote_at?: unknown;
  close?: unknown;
  previous_close?: unknown;
  is_market_open?: unknown;
  code?: unknown;
  message?: unknown;
  status?: unknown;
};
type TimeSeriesResponse = {
  meta?: { symbol?: unknown; currency?: unknown; mic_code?: unknown; type?: unknown };
  values?: unknown;
  status?: unknown;
  code?: unknown;
  message?: unknown;
};
type TimeSeriesRow = {
  datetime?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
};
type EodResponse = {
  datetime?: unknown;
  close?: unknown;
  currency?: unknown;
  code?: unknown;
  message?: unknown;
  status?: unknown;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Normalisation décimale du fournisseur — voir `provider-decimal.ts`. */
function decimal(value: unknown, field: string): DecimalString {
  return providerDecimal(value, TWELVE_DATA_PROVIDER_ID, field);
}

function currency(value: unknown): CurrencyCode | null {
  return isCurrencyCode(value) ? value : null;
}

function assetType(value: string): AssetType | null {
  const normalized = value.toLowerCase();
  if (normalized === "etf" || normalized.includes("exchange-traded")) return "ETF";
  if (normalized.includes("mutual fund") || normalized.includes("bond fund")) return "MUTUAL_FUND";
  if (
    normalized.includes("common stock") ||
    normalized.includes("preferred stock") ||
    normalized.includes("depositary receipt") ||
    normalized === "reit"
  )
    return "STOCK";
  return null;
}

function marketState(open: unknown): NormalizedQuote["marketState"] {
  return open === true ? "OPEN" : open === false ? "CLOSED" : "UNKNOWN";
}

export function createTwelveDataProvider(options: TwelveDataProviderOptions): MarketDataProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? "https://api.twelvedata.com").replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? 8_000;
  const now = options.now ?? (() => new Date());
  const configuredFreshness =
    options.freshness ?? (options.mode === "demo" ? "DELAYED" : "DELAYED");

  async function requestJson(
    path: string,
    params: Readonly<Record<string, string>>,
  ): Promise<unknown> {
    const url = new URL(`${baseUrl}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("apikey", options.apiKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url.toString(), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (response.status === 401 || response.status === 403) {
        throw new ProviderError(
          "UNAUTHORIZED",
          TWELVE_DATA_PROVIDER_ID,
          `Twelve Data HTTP ${response.status}`,
        );
      }
      if (response.status === 429) {
        const retry = response.headers.get("retry-after");
        throw new ProviderError(
          "RATE_LIMITED",
          TWELVE_DATA_PROVIDER_ID,
          "Twelve Data rate limit atteint",
          retry === null ? null : Number.parseInt(retry, 10),
        );
      }
      if (!response.ok) {
        throw new ProviderError(
          "NETWORK",
          TWELVE_DATA_PROVIDER_ID,
          `Twelve Data HTTP ${response.status}`,
        );
      }
      const payload = await response.json();
      if (
        typeof payload === "object" &&
        payload !== null &&
        "status" in payload &&
        (payload as { status?: unknown }).status === "error"
      ) {
        const code = String((payload as { code?: unknown }).code ?? "");
        const message = String((payload as { message?: unknown }).message ?? "Erreur Twelve Data");
        if (code === "401" || code === "403")
          throw new ProviderError("UNAUTHORIZED", TWELVE_DATA_PROVIDER_ID, message);
        if (code === "429")
          throw new ProviderError("RATE_LIMITED", TWELVE_DATA_PROVIDER_ID, message);
        throw new ProviderError("NOT_FOUND", TWELVE_DATA_PROVIDER_ID, message);
      }
      return payload;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ProviderError(
        "NETWORK",
        TWELVE_DATA_PROVIDER_ID,
        `Twelve Data indisponible : ${message}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function search(query: InstrumentSearchQuery): Promise<readonly InstrumentCandidate[]> {
    const text = query.text.trim();
    if (text === "") return [];
    const payload = (await requestJson("symbol_search", {
      symbol: text,
      outputsize: String(query.limit ?? 20),
      show_plan: "true",
    })) as SymbolSearchResponse;
    if (!Array.isArray(payload.data)) {
      throw new ProviderError(
        "MALFORMED_RESPONSE",
        TWELVE_DATA_PROVIDER_ID,
        "symbol_search Twelve Data invalide",
      );
    }
    const needle = text.toLowerCase();
    return (payload.data as SymbolSearchRow[]).flatMap((row): InstrumentCandidate[] => {
      const symbol = str(row.symbol);
      const name = str(row.instrument_name);
      const type = str(row.instrument_type);
      const ccy = currency(row.currency);
      if (symbol === null || name === null || type === null || ccy === null) return [];
      const mapped = assetType(type);
      if (mapped === null || (query.assetTypes !== undefined && !query.assetTypes.includes(mapped)))
        return [];
      const mic = str(row.mic_code);
      if (query.exchangeMic !== undefined && mic !== query.exchangeMic) return [];
      return [
        {
          provider: TWELVE_DATA_PROVIDER_ID,
          providerSymbol: symbol,
          name,
          assetType: mapped,
          currency: ccy,
          exchangeMic: mic,
          isin: null,
          figi: null,
          countryCode: str(row.country),
          confidence:
            symbol.toLowerCase() === needle ? 0.95 : name.toLowerCase() === needle ? 0.9 : 0.6,
        },
      ];
    });
  }

  async function resolve(ref: InstrumentReference): Promise<ResolvedInstrument | null> {
    if (ref.kind === "OPTION" || ref.kind === "FIGI" || ref.kind === "ISIN") return null;
    const symbol =
      ref.kind === "PROVIDER_SYMBOL"
        ? ref.provider === TWELVE_DATA_PROVIDER_ID
          ? ref.symbol
          : null
        : ref.ticker;
    if (symbol === null) return null;
    const candidates = await search({ text: symbol, limit: 50 });
    const exact = candidates.filter(
      (candidate) =>
        candidate.providerSymbol === symbol &&
        (ref.kind !== "TICKER" ||
          ref.exchangeMic === undefined ||
          candidate.exchangeMic === ref.exchangeMic),
    );
    if (exact.length !== 1) return null;
    const hit = exact[0]!;
    return {
      provider: TWELVE_DATA_PROVIDER_ID,
      providerSymbol: hit.providerSymbol,
      name: hit.name,
      assetType: hit.assetType,
      currency: hit.currency,
      exchangeMic: hit.exchangeMic,
      isin: hit.isin,
      optionContract: null,
    };
  }

  async function fundNav(instrument: ResolvedInstrument): Promise<NormalizedQuote> {
    const payload = (await requestJson("eod", {
      symbol: instrument.providerSymbol,
    })) as EodResponse;
    const date = str(payload.datetime);
    if (date === null)
      throw new ProviderError(
        "MALFORMED_RESPONSE",
        TWELVE_DATA_PROVIDER_ID,
        "Date NAV Twelve Data absente",
      );
    return {
      instrumentId: instrument.providerSymbol,
      provider: TWELVE_DATA_PROVIDER_ID,
      providerSymbol: instrument.providerSymbol,
      currency: instrument.currency,
      price: decimal(payload.close, "close"),
      priceType: "NAV",
      freshness: "NAV",
      asOf: `${date.slice(0, 10)}T23:59:59.000Z`,
      receivedAt: now().toISOString(),
    };
  }

  return {
    id: TWELVE_DATA_PROVIDER_ID,
    capabilities(): ProviderCapabilities {
      return {
        assetTypes: ["STOCK", "ETF", "MUTUAL_FUND"],
        searchByText: true,
        // ISIN existe sur certains endpoints/add-ons mais n'est pas supposé actif sans preuve du plan.
        searchByIsin: false,
        optionChains: false,
        fx: true,
        history: true,
        streaming: true,
        bestFreshness: configuredFreshness,
        delayMinutes: configuredFreshness === "DELAYED" ? (options.delayMinutes ?? null) : null,
      };
    },
    search,
    resolve,
    async getSnapshot(instrument: ResolvedInstrument): Promise<NormalizedQuote> {
      if (instrument.assetType === "MUTUAL_FUND") return fundNav(instrument);
      const payload = (await requestJson("quote", {
        symbol: instrument.providerSymbol,
      })) as QuoteResponse;
      const timestamp =
        typeof payload.last_quote_at === "number"
          ? payload.last_quote_at
          : typeof payload.timestamp === "number"
            ? payload.timestamp
            : null;
      if (timestamp === null)
        throw new ProviderError(
          "MALFORMED_RESPONSE",
          TWELVE_DATA_PROVIDER_ID,
          "Timestamp quote Twelve Data absent",
        );
      const state = marketState(payload.is_market_open);
      return {
        instrumentId: instrument.providerSymbol,
        provider: TWELVE_DATA_PROVIDER_ID,
        providerSymbol: instrument.providerSymbol,
        currency: instrument.currency,
        price: decimal(payload.close, "close"),
        priceType: "LAST_TRADE",
        freshness: configuredFreshness,
        asOf: new Date(timestamp * 1000).toISOString(),
        receivedAt: now().toISOString(),
        // Clé omise plutôt que posée à `undefined` : voir la note du même
        // endroit dans `eodhd-provider.ts`.
        ...(payload.previous_close == null
          ? {}
          : { previousClose: decimal(payload.previous_close, "previous_close") }),
        ...(state === undefined ? {} : { marketState: state }),
      };
    },
    async getHistory(request: HistoryRequest): Promise<readonly PriceBar[]> {
      const payload = (await requestJson("time_series", {
        symbol: request.instrument.providerSymbol,
        interval: "1day",
        start_date: request.from.slice(0, 10),
        end_date: request.to.slice(0, 10),
        order: "ASC",
        outputsize: "5000",
      })) as TimeSeriesResponse;
      if (!Array.isArray(payload.values)) {
        throw new ProviderError(
          "MALFORMED_RESPONSE",
          TWELVE_DATA_PROVIDER_ID,
          "time_series Twelve Data invalide",
        );
      }
      return (payload.values as TimeSeriesRow[]).map((row) => {
        const date = str(row.datetime);
        if (date === null)
          throw new ProviderError(
            "MALFORMED_RESPONSE",
            TWELVE_DATA_PROVIDER_ID,
            "Date time_series absente",
          );
        return {
          date: date.slice(0, 10),
          open: row.open == null ? null : decimal(row.open, "open"),
          high: row.high == null ? null : decimal(row.high, "high"),
          low: row.low == null ? null : decimal(row.low, "low"),
          close: decimal(row.close, "close"),
          currency: request.instrument.currency,
        };
      });
    },
    async getFxRate(base: CurrencyCode, quote: CurrencyCode): Promise<FxQuote> {
      if (base === quote)
        return {
          base,
          quote,
          rate: toDecimalString("1"),
          provider: TWELVE_DATA_PROVIDER_ID,
          asOf: now().toISOString(),
          freshness: "LIVE",
        };
      const payload = (await requestJson("quote", { symbol: `${base}/${quote}` })) as QuoteResponse;
      const timestamp =
        typeof payload.last_quote_at === "number"
          ? payload.last_quote_at
          : typeof payload.timestamp === "number"
            ? payload.timestamp
            : null;
      if (timestamp === null)
        throw new ProviderError(
          "MALFORMED_RESPONSE",
          TWELVE_DATA_PROVIDER_ID,
          "Timestamp FX Twelve Data absent",
        );
      return {
        base,
        quote,
        rate: decimal(payload.close, "close"),
        provider: TWELVE_DATA_PROVIDER_ID,
        asOf: new Date(timestamp * 1000).toISOString(),
        freshness: configuredFreshness,
      };
    },
  };
}
