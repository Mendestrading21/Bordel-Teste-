import {
  isCurrencyCode,
  toDecimalString,
  type AssetType,
  type CurrencyCode,
  type DecimalString,
} from "@portfolio-lab/domain";

import {
  decodeStreamMessage,
  type StreamSocket,
  type StreamSocketFactory,
} from "./stream-socket.js";
import { providerDecimal } from "./provider-decimal.js";
import {
  parseTwelveDataTick,
  twelveDataHeartbeat,
  twelveDataStreamUrl,
  twelveDataSubscription,
} from "./twelve-data-stream.js";
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
  /**
   * Fabrique de socket temps réel, fournie par l'application.
   *
   * Absente, l'adaptateur annonce `streaming: false`. La version précédente
   * annonçait `true` sans qu'aucune méthode `subscribe` n'existe : une
   * capacité déclarée que rien n'implémentait.
   */
  readonly socketFactory?: StreamSocketFactory;
  readonly streamBaseUrl?: string;
  /** Intervalle du battement de cœur. Le serveur ferme une connexion inactive. */
  readonly heartbeatMs?: number;
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

/**
 * Traduit `instrument_type` de Twelve Data vers la taxonomie interne.
 *
 * Comme chez EODHD, tout type non reconnu renvoyait `null` et la ligne était
 * **silencieusement jetée** par l'appelant. Twelve Data couvre pourtant les
 * devises, les cryptos, les indices et les matières premières : chercher
 * « USD/CHF » ou « Gold » ne rendait rien, sans erreur pour l'expliquer.
 *
 * L'ordre compte : « exchange-traded » attrape les ETF avant que « fund » ne
 * les capture comme fonds classiques, ce qui les ferait valoriser à la NAV au
 * lieu du cours de bourse.
 */
function assetType(value: string): AssetType | null {
  const normalized = value.toLowerCase();
  if (normalized === "etf" || normalized.includes("exchange-traded")) return "ETF";
  if (normalized.includes("mutual fund") || normalized.includes("bond fund")) return "MUTUAL_FUND";
  if (normalized.includes("index")) return "INDEX";
  if (
    normalized.includes("physical currency") ||
    normalized.includes("forex") ||
    normalized === "currency"
  )
    return "FX";
  if (normalized.includes("digital currency") || normalized.includes("crypto")) return "CRYPTO";
  if (normalized.includes("commodity")) return "COMMODITY";
  if (normalized.includes("bond")) return "BOND";
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
          httpMessage("Twelve Data", response.status, await errorBody(response)),
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
          httpMessage("Twelve Data", response.status, await errorBody(response)),
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
    if (exact.length === 0) return null;
    if (exact.length > 1) {
      /*
       * Plusieurs places pour le même symbole. Renvoyer `null` faisait passer
       * le routeur au fournisseur suivant, lequel pouvait choisir seul une
       * place et une devise que l'utilisateur n'avait pas demandées.
       */
      throw new ProviderError(
        "AMBIGUOUS",
        TWELVE_DATA_PROVIDER_ID,
        `${exact.length} instruments correspondent : ${exact
          .map((item) => `${item.providerSymbol} @ ${item.exchangeMic ?? "?"} (${item.currency})`)
          .join(", ")}`,
      );
    }
    const hit = exact[0];
    if (hit === undefined) return null;
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
        /*
         * Liste porteuse depuis LIVE-01 : le routeur n'appelle plus un
         * fournisseur pour une classe absente. Elle omettait `FX` alors que
         * `getFxRate` existe, si bien que les devises auraient cessé d'être
         * servies sans qu'aucune erreur ne le dise.
         */
        assetTypes: ["STOCK", "ETF", "MUTUAL_FUND", "INDEX", "FX", "CRYPTO", "COMMODITY"],
        searchByText: true,
        // ISIN existe sur certains endpoints/add-ons mais n'est pas supposé actif sans preuve du plan.
        searchByIsin: false,
        optionChains: false,
        fx: true,
        history: true,
        /*
         * `true` était annoncé sans qu'aucune méthode `subscribe` n'existe :
         * une capacité déclarée que rien n'implémentait. Le routeur s'en
         * protège, mais un fournisseur ne doit pas mentir sur ce qu'il sait
         * faire — l'annonce suit désormais la présence d'une fabrique.
         */
        streaming: options.socketFactory !== undefined,
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

    /**
     * Abonne un lot d'instruments au flux Twelve Data.
     *
     * Un seul socket suffit, contrairement à EODHD : Twelve Data multiplexe
     * toutes les classes d'actifs sur un point d'entrée unique.
     *
     * Le battement de cœur n'est pas décoratif : le serveur ferme une
     * connexion inactive, et une fermeture silencieuse pendant les heures
     * creuses ressemble exactement à un marché sans transaction.
     */
    ...(options.socketFactory === undefined
      ? {}
      : {
          async subscribe(
            instruments: readonly ResolvedInstrument[],
            onQuote: (quote: NormalizedQuote) => void,
          ): Promise<SubscriptionHandle> {
            const factory = options.socketFactory;
            if (factory === undefined) {
              throw new ProviderError(
                "UNSUPPORTED",
                TWELVE_DATA_PROVIDER_ID,
                "Aucune fabrique de socket configurée",
              );
            }

            const bySymbol = new Map(
              instruments.map((instrument) => [instrument.providerSymbol, instrument]),
            );

            const socket: StreamSocket = factory(
              twelveDataStreamUrl(options.apiKey, options.streamBaseUrl),
            );

            socket.addEventListener("open", () => {
              socket.send(
                JSON.stringify(twelveDataSubscription("subscribe", [...bySymbol.keys()])),
              );
            });

            socket.addEventListener("message", (event: { data: unknown }) => {
              const payload = decodeStreamMessage(event.data);
              if (typeof payload !== "object" || payload === null) return;

              const symbol =
                "symbol" in payload ? String((payload as { symbol: unknown }).symbol) : null;
              const instrument = symbol === null ? undefined : bySymbol.get(symbol);
              if (instrument === undefined) return;

              const quote = parseTwelveDataTick(payload, {
                instrument,
                receivedAt: now().toISOString(),
                /*
                 * La fraîcheur vient du plan souscrit, jamais du fait qu'un
                 * tick soit arrivé : un plan différé envoie lui aussi des
                 * messages par socket.
                 */
                freshness: configuredFreshness,
              });
              if (quote !== null) onQuote(quote);
            });

            const heartbeat = setInterval(() => {
              socket.send(JSON.stringify(twelveDataHeartbeat()));
            }, options.heartbeatMs ?? 10_000);
            // Ne retient pas le processus Node à l'arrêt.
            heartbeat.unref?.();

            return {
              async unsubscribe(): Promise<void> {
                clearInterval(heartbeat);
                socket.send(
                  JSON.stringify(twelveDataSubscription("unsubscribe", [...bySymbol.keys()])),
                );
                socket.close();
              },
            };
          },
        }),
  };
}
