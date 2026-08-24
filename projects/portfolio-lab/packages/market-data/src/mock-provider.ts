import { ASSET_TYPES, toDecimalString, type CurrencyCode, type DecimalString } from "@portfolio-lab/domain";

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
  type SubscriptionHandle,
} from "./contract.js";

export const MOCK_PROVIDER_ID = "mock";

export type MockInstrument = {
  readonly symbol: string;
  readonly name: string;
  readonly assetType: ResolvedInstrument["assetType"];
  readonly currency: CurrencyCode;
  readonly exchangeMic: string | null;
  readonly isin: string | null;
  readonly optionContract?: ResolvedInstrument["optionContract"];
};

function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

function priceFor(symbol: string, offset = 0): DecimalString {
  const raw = (hash(symbol) + offset) % 50_000;
  const cents = raw + 100;
  const units = Math.floor(cents / 100);
  const fraction = cents % 100;
  return toDecimalString(`${units}.${String(fraction).padStart(2, "0")}`);
}

export type MockProviderOptions = {
  readonly instruments: readonly MockInstrument[];
  readonly fxRates?: ReadonlyMap<string, DecimalString>;
  readonly now?: () => Date;
  readonly failWith?: ProviderError;
};

export function createMockProvider(options: MockProviderOptions): MarketDataProvider {
  const now = options.now ?? ((): Date => new Date());
  const bySymbol = new Map(options.instruments.map((entry) => [entry.symbol, entry]));

  function assertHealthy(): void {
    if (options.failWith !== undefined) throw options.failWith;
  }

  function toResolved(instrument: MockInstrument): ResolvedInstrument {
    return {
      provider: MOCK_PROVIDER_ID,
      providerSymbol: instrument.symbol,
      name: instrument.name,
      assetType: instrument.assetType,
      currency: instrument.currency,
      exchangeMic: instrument.exchangeMic,
      isin: instrument.isin,
      optionContract: instrument.optionContract ?? null,
    };
  }

  return {
    id: MOCK_PROVIDER_ID,
    capabilities(): ProviderCapabilities {
      return {
        assetTypes: ASSET_TYPES,
        searchByText: true,
        searchByIsin: true,
        optionChains: true,
        fx: true,
        history: true,
        streaming: true,
        bestFreshness: "MANUAL",
        delayMinutes: null,
      };
    },
    async search(query: InstrumentSearchQuery): Promise<readonly InstrumentCandidate[]> {
      assertHealthy();
      const needle = query.text.trim().toLowerCase();
      if (needle === "") return [];
      return options.instruments
        .filter((instrument) => {
          if (query.assetTypes !== undefined && !query.assetTypes.includes(instrument.assetType)) return false;
          if (query.exchangeMic !== undefined && instrument.exchangeMic !== query.exchangeMic) return false;
          return instrument.symbol.toLowerCase().includes(needle) || instrument.name.toLowerCase().includes(needle) || instrument.isin?.toLowerCase() === needle;
        })
        .slice(0, query.limit ?? 20)
        .map((instrument) => ({
          provider: MOCK_PROVIDER_ID,
          providerSymbol: instrument.symbol,
          name: instrument.name,
          assetType: instrument.assetType,
          currency: instrument.currency,
          exchangeMic: instrument.exchangeMic,
          isin: instrument.isin,
          figi: null,
          countryCode: null,
          confidence: instrument.isin?.toLowerCase() === needle ? 1 : instrument.symbol.toLowerCase() === needle ? 0.9 : 0.5,
        }));
    },
    async resolve(ref: InstrumentReference): Promise<ResolvedInstrument | null> {
      assertHealthy();
      const found = (() => {
        switch (ref.kind) {
          case "ISIN":
            return options.instruments.find((entry) => entry.isin === ref.isin);
          case "TICKER":
            return options.instruments.find((entry) => entry.symbol === ref.ticker && (ref.exchangeMic === undefined || entry.exchangeMic === ref.exchangeMic));
          case "PROVIDER_SYMBOL":
            return ref.provider === MOCK_PROVIDER_ID ? bySymbol.get(ref.symbol) : undefined;
          case "OPTION":
            return options.instruments.find((entry) => entry.optionContract != null && entry.optionContract.underlyingSymbol === ref.underlying && entry.optionContract.optionType === ref.optionType && entry.optionContract.expiration === ref.expiration && entry.optionContract.strike === ref.strike);
          case "FIGI":
            return undefined;
        }
      })();
      return found === undefined ? null : toResolved(found);
    },
    async getSnapshot(instrument: ResolvedInstrument): Promise<NormalizedQuote> {
      assertHealthy();
      const source = bySymbol.get(instrument.providerSymbol);
      if (source === undefined) throw new ProviderError("NOT_FOUND", MOCK_PROVIDER_ID, `Instrument inconnu : ${instrument.providerSymbol}`);
      const timestamp = now().toISOString();
      const price = priceFor(source.symbol);
      if (source.assetType === "MUTUAL_FUND") {
        return { instrumentId: source.symbol, provider: MOCK_PROVIDER_ID, providerSymbol: source.symbol, currency: source.currency, price, priceType: "NAV", freshness: "NAV", asOf: timestamp, receivedAt: timestamp };
      }
      const bid = priceFor(source.symbol, -50);
      const ask = priceFor(source.symbol, 50);
      return {
        instrumentId: source.symbol,
        provider: MOCK_PROVIDER_ID,
        providerSymbol: source.symbol,
        currency: source.currency,
        price,
        priceType: "LAST_TRADE",
        freshness: "MANUAL",
        asOf: timestamp,
        receivedAt: timestamp,
        bid: bid <= ask ? bid : ask,
        ask: bid <= ask ? ask : bid,
        previousClose: priceFor(source.symbol, 25),
        marketState: "CLOSED",
      };
    },
    async getHistory(request: HistoryRequest): Promise<readonly PriceBar[]> {
      assertHealthy();
      const bars: PriceBar[] = [];
      const from = new Date(request.from);
      const to = new Date(request.to);
      for (let day = new Date(from); day <= to; day.setUTCDate(day.getUTCDate() + 1)) {
        const iso = day.toISOString().slice(0, 10);
        const weekday = day.getUTCDay();
        if (weekday === 0 || weekday === 6) continue;
        const close = priceFor(`${request.instrument.providerSymbol}:${iso}`);
        bars.push({ date: iso, open: close, high: close, low: close, close, currency: request.instrument.currency });
      }
      return bars;
    },
    async getFxRate(base: CurrencyCode, quote: CurrencyCode): Promise<FxQuote> {
      assertHealthy();
      const rate = options.fxRates?.get(`${base}/${quote}`);
      if (rate === undefined) throw new ProviderError("NOT_FOUND", MOCK_PROVIDER_ID, `Taux indisponible : ${base}/${quote}`);
      return { base, quote, rate, provider: MOCK_PROVIDER_ID, asOf: now().toISOString(), freshness: "MANUAL" };
    },
    async subscribe(instruments: readonly ResolvedInstrument[], onQuote: (quote: NormalizedQuote) => void): Promise<SubscriptionHandle> {
      assertHealthy();
      let active = true;
      const timers = instruments.map((instrument) => setTimeout(() => {
        if (!active) return;
        void this.getSnapshot(instrument).then(onQuote);
      }, 0));
      return {
        async unsubscribe(): Promise<void> {
          active = false;
          for (const timer of timers) clearTimeout(timer);
        },
      };
    },
  };
}
