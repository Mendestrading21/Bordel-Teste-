import {
  isCurrencyCode,
  toDecimalString,
  type AssetType,
  type CurrencyCode,
} from "@portfolio-lab/domain";

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

export const EODHD_PROVIDER_ID = "eodhd";

export type EodhdMode = "demo" | "live";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type EodhdProviderOptions = {
  readonly apiToken: string;
  readonly mode: EodhdMode;
  readonly fetchImpl?: FetchLike;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
};

type EodhdSearchRow = {
  Code?: unknown;
  Exchange?: unknown;
  Name?: unknown;
  Type?: unknown;
  Country?: unknown;
  Currency?: unknown;
  ISIN?: unknown;
  isPrimary?: unknown;
};

type EodhdRealtime = {
  code?: unknown;
  timestamp?: unknown;
  close?: unknown;
  previousClose?: unknown;
};

type EodhdEodRow = {
  date?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
};

const DEMO_INSTRUMENTS: Readonly<Record<string, Omit<ResolvedInstrument, "provider">>> = {
  "AAPL.US": {
    providerSymbol: "AAPL.US",
    name: "Apple Inc",
    assetType: "STOCK",
    currency: "USD",
    exchangeMic: "XNAS",
    isin: "US0378331005",
    optionContract: null,
  },
  "TSLA.US": {
    providerSymbol: "TSLA.US",
    name: "Tesla Inc",
    assetType: "STOCK",
    currency: "USD",
    exchangeMic: "XNAS",
    isin: "US88160R1014",
    optionContract: null,
  },
  "VTI.US": {
    providerSymbol: "VTI.US",
    name: "Vanguard Total Stock Market ETF",
    assetType: "ETF",
    currency: "USD",
    exchangeMic: "ARCX",
    isin: null,
    optionContract: null,
  },
};

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function numericString(value: unknown, field: string): ReturnType<typeof toDecimalString> {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      EODHD_PROVIDER_ID,
      `Champ numérique EODHD invalide : ${field}`,
    );
  }
  return toDecimalString(String(value));
}

function currencyFrom(value: unknown): CurrencyCode | null {
  return isCurrencyCode(value) ? value : null;
}

function assetTypeFromEodhd(type: string): AssetType | null {
  const normalized = type.toLowerCase();
  if (normalized.includes("etf")) return "ETF";
  if (normalized.includes("fund")) return "MUTUAL_FUND";
  if (normalized.includes("stock") || normalized.includes("equity")) return "STOCK";
  return null;
}

function confidence(row: EodhdSearchRow, needle: string): number {
  const isin = stringValue(row.ISIN)?.toLowerCase();
  const code = stringValue(row.Code)?.toLowerCase();
  if (isin === needle) return 1;
  if (code === needle) return 0.95;
  return row.isPrimary === true ? 0.75 : 0.6;
}

export function createEodhdProvider(options: EodhdProviderOptions): MarketDataProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? "https://eodhd.com/api").replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? 8_000;
  const now = options.now ?? (() => new Date());

  async function requestJson(path: string, params: Readonly<Record<string, string>> = {}): Promise<unknown> {
    const url = new URL(`${baseUrl}/${path.replace(/^\//, "")}`);
    url.searchParams.set("api_token", options.apiToken);
    url.searchParams.set("fmt", "json");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url.toString(), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (response.status === 401 || response.status === 403) {
        throw new ProviderError("UNAUTHORIZED", EODHD_PROVIDER_ID, `EODHD HTTP ${response.status}`);
      }
      if (response.status === 429) {
        const retry = response.headers.get("retry-after");
        throw new ProviderError(
          "RATE_LIMITED",
          EODHD_PROVIDER_ID,
          "EODHD rate limit atteint",
          retry === null ? null : Number.parseInt(retry, 10),
        );
      }
      if (response.status === 404) {
        throw new ProviderError("NOT_FOUND", EODHD_PROVIDER_ID, "Ressource EODHD introuvable");
      }
      if (!response.ok) {
        throw new ProviderError("NETWORK", EODHD_PROVIDER_ID, `EODHD HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ProviderError("NETWORK", EODHD_PROVIDER_ID, `EODHD indisponible : ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  function demoResolve(ref: InstrumentReference): ResolvedInstrument | null {
    const symbol = (() => {
      if (ref.kind === "PROVIDER_SYMBOL" && ref.provider === EODHD_PROVIDER_ID) return ref.symbol;
      if (ref.kind === "TICKER") return `${ref.ticker}.US`;
      if (ref.kind === "ISIN") {
        return Object.values(DEMO_INSTRUMENTS).find((item) => item.isin === ref.isin)?.providerSymbol ?? null;
      }
      return null;
    })();
    if (symbol === null) return null;
    const item = DEMO_INSTRUMENTS[symbol];
    return item === undefined ? null : { provider: EODHD_PROVIDER_ID, ...item };
  }

  async function searchLive(query: InstrumentSearchQuery): Promise<readonly InstrumentCandidate[]> {
    const needle = query.text.trim();
    if (needle === "") return [];
    const payload = await requestJson(`search/${encodeURIComponent(needle)}`, {
      limit: String(query.limit ?? 20),
      type: "all",
    });
    if (!Array.isArray(payload)) {
      throw new ProviderError("MALFORMED_RESPONSE", EODHD_PROVIDER_ID, "Réponse search EODHD non-tableau");
    }
    return (payload as EodhdSearchRow[])
      .flatMap((row): InstrumentCandidate[] => {
        const code = stringValue(row.Code);
        const exchange = stringValue(row.Exchange);
        const name = stringValue(row.Name);
        const type = stringValue(row.Type);
        const currency = currencyFrom(row.Currency);
        if (code === null || exchange === null || name === null || type === null || currency === null) return [];
        const assetType = assetTypeFromEodhd(type);
        if (assetType === null) return [];
        if (query.assetTypes !== undefined && !query.assetTypes.includes(assetType)) return [];
        return [{
          provider: EODHD_PROVIDER_ID,
          providerSymbol: `${code}.${exchange}`,
          name,
          assetType,
          currency,
          exchangeMic: null,
          isin: stringValue(row.ISIN),
          figi: null,
          countryCode: stringValue(row.Country),
          confidence: confidence(row, needle.toLowerCase()),
        }];
      });
  }

  async function resolveViaSearch(ref: InstrumentReference): Promise<ResolvedInstrument | null> {
    if (ref.kind === "OPTION" || ref.kind === "FIGI") return null;
    if (ref.kind === "PROVIDER_SYMBOL") {
      if (ref.provider !== EODHD_PROVIDER_ID) return null;
      const [ticker] = ref.symbol.split(".");
      if (ticker === undefined) return null;
      const candidates = await searchLive({ text: ticker, limit: 50 });
      const hit = candidates.find((candidate) => candidate.providerSymbol === ref.symbol);
      return hit === undefined ? null : {
        provider: EODHD_PROVIDER_ID,
        providerSymbol: hit.providerSymbol,
        name: hit.name,
        assetType: hit.assetType,
        currency: hit.currency,
        exchangeMic: hit.exchangeMic,
        isin: hit.isin,
        optionContract: null,
      };
    }
    const text = ref.kind === "ISIN" ? ref.isin : ref.ticker;
    const candidates = await searchLive({ text, limit: 50 });
    const exact = ref.kind === "ISIN"
      ? candidates.filter((item) => item.isin === ref.isin)
      : candidates.filter((item) => item.providerSymbol.split(".")[0] === ref.ticker);
    if (exact.length !== 1) return null;
    const hit = exact[0]!;
    return {
      provider: EODHD_PROVIDER_ID,
      providerSymbol: hit.providerSymbol,
      name: hit.name,
      assetType: hit.assetType,
      currency: hit.currency,
      exchangeMic: hit.exchangeMic,
      isin: hit.isin,
      optionContract: null,
    };
  }

  async function getEodLatest(instrument: ResolvedInstrument): Promise<NormalizedQuote> {
    const payload = await requestJson(`eod/${encodeURIComponent(instrument.providerSymbol)}`, {
      order: "d",
    });
    if (!Array.isArray(payload) || payload.length === 0) {
      throw new ProviderError("NOT_FOUND", EODHD_PROVIDER_ID, `Pas d'EOD pour ${instrument.providerSymbol}`);
    }
    const row = payload[0] as EodhdEodRow;
    const close = numericString(row.close, "close");
    const date = stringValue(row.date);
    if (date === null) throw new ProviderError("MALFORMED_RESPONSE", EODHD_PROVIDER_ID, "Date EOD absente");
    const receivedAt = now().toISOString();
    return {
      instrumentId: instrument.providerSymbol,
      provider: EODHD_PROVIDER_ID,
      providerSymbol: instrument.providerSymbol,
      currency: instrument.currency,
      price: close,
      priceType: instrument.assetType === "MUTUAL_FUND" ? "NAV" : "PREVIOUS_CLOSE",
      freshness: instrument.assetType === "MUTUAL_FUND" ? "NAV" : "EOD",
      asOf: `${date}T23:59:59.000Z`,
      receivedAt,
    };
  }

  return {
    id: EODHD_PROVIDER_ID,

    capabilities(): ProviderCapabilities {
      return {
        assetTypes: ["STOCK", "ETF", "MUTUAL_FUND"],
        searchByText: options.mode === "live",
        searchByIsin: options.mode === "live",
        optionChains: false,
        fx: true,
        history: true,
        streaming: false,
        // L'endpoint /real-time standard est documenté comme live/delayed.
        bestFreshness: "DELAYED",
        delayMinutes: null,
      };
    },

    async search(query: InstrumentSearchQuery): Promise<readonly InstrumentCandidate[]> {
      if (options.mode === "demo") {
        throw new ProviderError(
          "UNSUPPORTED",
          EODHD_PROVIDER_ID,
          "La clé demo EODHD ne supporte pas Search API ; utiliser une clé gratuite/personnelle.",
        );
      }
      return searchLive(query);
    },

    async resolve(ref: InstrumentReference): Promise<ResolvedInstrument | null> {
      return options.mode === "demo" ? demoResolve(ref) : resolveViaSearch(ref);
    },

    async getSnapshot(instrument: ResolvedInstrument): Promise<NormalizedQuote> {
      if (instrument.assetType === "MUTUAL_FUND") return getEodLatest(instrument);
      const payload = (await requestJson(`real-time/${encodeURIComponent(instrument.providerSymbol)}`)) as EodhdRealtime;
      const close = numericString(payload.close, "close");
      const previousClose = payload.previousClose == null ? undefined : numericString(payload.previousClose, "previousClose");
      if (typeof payload.timestamp !== "number") {
        throw new ProviderError("MALFORMED_RESPONSE", EODHD_PROVIDER_ID, "Timestamp EODHD absent");
      }
      const receivedAt = now().toISOString();
      return {
        instrumentId: instrument.providerSymbol,
        provider: EODHD_PROVIDER_ID,
        providerSymbol: instrument.providerSymbol,
        currency: instrument.currency,
        price: close,
        priceType: "LAST_TRADE",
        freshness: "DELAYED",
        asOf: new Date(payload.timestamp * 1000).toISOString(),
        receivedAt,
        previousClose,
        marketState: "UNKNOWN",
      };
    },

    async getHistory(request: HistoryRequest): Promise<readonly PriceBar[]> {
      const payload = await requestJson(`eod/${encodeURIComponent(request.instrument.providerSymbol)}`, {
        from: request.from.slice(0, 10),
        to: request.to.slice(0, 10),
        period: "d",
        order: "a",
      });
      if (!Array.isArray(payload)) {
        throw new ProviderError("MALFORMED_RESPONSE", EODHD_PROVIDER_ID, "Historique EODHD invalide");
      }
      return (payload as EodhdEodRow[]).map((row) => {
        const date = stringValue(row.date);
        if (date === null) throw new ProviderError("MALFORMED_RESPONSE", EODHD_PROVIDER_ID, "Date EOD absente");
        return {
          date,
          open: row.open == null ? null : numericString(row.open, "open"),
          high: row.high == null ? null : numericString(row.high, "high"),
          low: row.low == null ? null : numericString(row.low, "low"),
          close: numericString(row.close, "close"),
          currency: request.instrument.currency,
        };
      });
    },

    async getFxRate(base: CurrencyCode, quote: CurrencyCode): Promise<FxQuote> {
      if (base === quote) {
        return { base, quote, rate: toDecimalString("1"), provider: EODHD_PROVIDER_ID, asOf: now().toISOString(), freshness: "LIVE" };
      }
      const payload = (await requestJson(`real-time/${base}${quote}.FOREX`)) as EodhdRealtime;
      const rate = numericString(payload.close, "close");
      if (typeof payload.timestamp !== "number") {
        throw new ProviderError("MALFORMED_RESPONSE", EODHD_PROVIDER_ID, "Timestamp FX EODHD absent");
      }
      return {
        base,
        quote,
        rate,
        provider: EODHD_PROVIDER_ID,
        asOf: new Date(payload.timestamp * 1000).toISOString(),
        freshness: "DELAYED",
      };
    },
  };
}
