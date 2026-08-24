import {
  isCurrencyCode,
  toDecimalString,
  type AssetType,
  type CurrencyCode,
  type DecimalString,
} from "@portfolio-lab/domain";

import {
  eodhdChannelFor,
  eodhdStreamSymbol,
  eodhdStreamUrl,
  eodhdSubscription,
  parseEodhdTick,
  type EodhdChannel,
} from "./eodhd-stream.js";
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
  type SubscriptionHandle,
} from "./contract.js";

export const EODHD_PROVIDER_ID = "eodhd";

export type EodhdMode = "demo" | "live";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Socket minimal dont l'adaptateur a besoin.
 *
 * Volontairement plus étroit que `WebSocket` : le paquet `market-data` ne
 * dépend d'aucune implémentation, et les tests fournissent un faux socket sans
 * ouvrir de port. C'est ce qui permet de vérifier l'abonnement, le
 * désabonnement et le traitement des ticks dans la suite unitaire.
 */
export type StreamSocket = {
  send(data: string): void;
  close(): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "open" | "error" | "close", listener: () => void): void;
};

export type StreamSocketFactory = (url: string) => StreamSocket;

export type EodhdProviderOptions = {
  readonly apiToken: string;
  readonly mode: EodhdMode;
  readonly fetchImpl?: FetchLike;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
  /**
   * Fabrique de socket temps réel. Absente, l'adaptateur annonce
   * `streaming: false` : mieux vaut ne rien promettre que promettre un flux
   * qu'aucune implémentation ne sait ouvrir.
   */
  readonly socketFactory?: StreamSocketFactory;
  readonly streamBaseUrl?: string;
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

/** Normalisation décimale du fournisseur — voir `provider-decimal.ts`. */
function numericString(value: unknown, field: string): DecimalString {
  return providerDecimal(value, EODHD_PROVIDER_ID, field);
}

function currencyFrom(value: unknown): CurrencyCode | null {
  return isCurrencyCode(value) ? value : null;
}

/**
 * Traduit le champ `Type` d'EODHD vers la taxonomie interne.
 *
 * La version d'origine ne connaissait que trois types et renvoyait `null` pour
 * tout le reste — un `null` que l'appelant traduisait en « ligne ignorée ».
 * Les indices, devises, cryptos et obligations remontés par la recherche EODHD
 * étaient donc **silencieusement jetés** : l'utilisateur cherchait « S&P 500 »
 * et n'obtenait rien, sans qu'aucune erreur ne l'explique.
 *
 * L'ordre des tests compte. « ETF » avant « fund » parce qu'EODHD écrit
 * parfois « ETF » dans un libellé contenant aussi « Fund » ; « preferred
 * stock » avant « stock » n'est pas nécessaire, les deux étant des actions.
 */
function assetTypeFromEodhd(type: string): AssetType | null {
  const normalized = type.toLowerCase();
  if (normalized.includes("etf") || normalized.includes("etc")) return "ETF";
  if (normalized.includes("fund")) return "MUTUAL_FUND";
  if (normalized.includes("index") || normalized.includes("indice")) return "INDEX";
  if (normalized.includes("currency") || normalized.includes("forex")) return "FX";
  if (normalized.includes("crypto")) return "CRYPTO";
  if (normalized.includes("bond") || normalized.includes("note")) return "BOND";
  if (normalized.includes("future")) return "FUTURE";
  if (normalized.includes("commodity")) return "COMMODITY";
  if (normalized.includes("stock") || normalized.includes("equity")) return "STOCK";
  return null;
}

/**
 * Code de place EODHD vers code MIC ISO 10383.
 *
 * EODHD suffixe ses symboles d'un code maison — `.US`, `.SW`, `.PA` — qui
 * **n'est pas un MIC**. Les confondre placerait une valeur inventée dans un
 * champ que le reste du produit lit comme une référence normalisée.
 *
 * La table ne couvre que les places dont le MIC est certain. Tout le reste
 * reste `null` : ne rien affirmer vaut mieux qu'affirmer approximativement, et
 * un `null` se corrige, une valeur fausse se propage.
 */
const MIC_BY_EODHD_EXCHANGE: Readonly<Record<string, string>> = {
  /*
   * `US` est **délibérément absent**. C'est un code composite couvrant NYSE,
   * NASDAQ, AMEX et ARCA : `AAPL.US` se négocie sur XNAS, `VTI.US` sur ARCX.
   * Le traduire par un MIC unique attribuerait une place fausse à une position
   * sur deux. Il en va de même pour `TSE`, qu'EODHD emploie pour Tokyo alors
   * que la lecture spontanée est Toronto.
   */
  NASDAQ: "XNAS",
  NYSE: "XNYS",
  NYSEARCA: "ARCX",
  BATS: "BATS",
  SW: "XSWX",
  VX: "XVTX",
  PA: "XPAR",
  AS: "XAMS",
  BR: "XBRU",
  LS: "XLIS",
  XETRA: "XETR",
  F: "XFRA",
  MI: "XMIL",
  MC: "XMAD",
  LSE: "XLON",
  L: "XLON",
  VI: "XWBO",
  ST: "XSTO",
  HE: "XHEL",
  CO: "XCSE",
  OL: "XOSL",
  TO: "XTSE",
  HK: "XHKG",
  AU: "XASX",
};

function micFromEodhdExchange(exchange: string): string | null {
  return MIC_BY_EODHD_EXCHANGE[exchange.toUpperCase()] ?? null;
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

  async function requestJson(
    path: string,
    params: Readonly<Record<string, string>> = {},
  ): Promise<unknown> {
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
        return (
          Object.values(DEMO_INSTRUMENTS).find((item) => item.isin === ref.isin)?.providerSymbol ??
          null
        );
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
      throw new ProviderError(
        "MALFORMED_RESPONSE",
        EODHD_PROVIDER_ID,
        "Réponse search EODHD non-tableau",
      );
    }
    return (payload as EodhdSearchRow[]).flatMap((row): InstrumentCandidate[] => {
      const code = stringValue(row.Code);
      const exchange = stringValue(row.Exchange);
      const name = stringValue(row.Name);
      const type = stringValue(row.Type);
      const currency = currencyFrom(row.Currency);
      if (code === null || exchange === null || name === null || type === null || currency === null)
        return [];
      const assetType = assetTypeFromEodhd(type);
      if (assetType === null) return [];
      if (query.assetTypes !== undefined && !query.assetTypes.includes(assetType)) return [];
      return [
        {
          provider: EODHD_PROVIDER_ID,
          providerSymbol: `${code}.${exchange}`,
          name,
          assetType,
          currency,
          exchangeMic: micFromEodhdExchange(exchange),
          isin: stringValue(row.ISIN),
          figi: null,
          countryCode: stringValue(row.Country),
          confidence: confidence(row, needle.toLowerCase()),
        },
      ];
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
      return hit === undefined
        ? null
        : {
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
    const exact =
      ref.kind === "ISIN"
        ? candidates.filter((item) => item.isin === ref.isin)
        : candidates.filter((item) => item.providerSymbol.split(".")[0] === ref.ticker);
    if (exact.length === 0) return null;
    if (exact.length > 1) {
      /*
       * Plusieurs instruments correspondent — typiquement la même société
       * cotée sur plusieurs places, ou deux classes de parts d'un fonds.
       *
       * L'ancienne version renvoyait `null`, que le routeur interprétait comme
       * « ce fournisseur ne connaît pas » et qui le faisait passer au suivant.
       * Le fournisseur suivant, lui, pouvait trancher tout seul : l'utilisateur
       * se retrouvait avec un instrument choisi à sa place, sur une place et
       * dans une devise qu'il n'avait pas demandées.
       *
       * `AMBIGUOUS` n'est pas récupérable par le routeur, précisément pour que
       * la question remonte à l'utilisateur.
       */
      throw new ProviderError(
        "AMBIGUOUS",
        EODHD_PROVIDER_ID,
        `${exact.length} instruments correspondent : ${exact
          .map((item) => `${item.providerSymbol} (${item.currency})`)
          .join(", ")}`,
      );
    }
    const hit = exact[0];
    if (hit === undefined) return null;
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
      throw new ProviderError(
        "NOT_FOUND",
        EODHD_PROVIDER_ID,
        `Pas d'EOD pour ${instrument.providerSymbol}`,
      );
    }
    const row = payload[0] as EodhdEodRow;
    const close = numericString(row.close, "close");
    const date = stringValue(row.date);
    if (date === null)
      throw new ProviderError("MALFORMED_RESPONSE", EODHD_PROVIDER_ID, "Date EOD absente");
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
        /*
         * Cette liste est **porteuse** depuis LIVE-01 : le routeur n'appelle
         * plus un fournisseur pour une classe qu'il ne déclare pas. Elle
         * omettait `FX` alors que `getFxRate` existe — les devises auraient
         * cessé d'être servies par EODHD sans qu'aucune erreur ne le dise.
         *
         * Ne figurent ici que les classes dont l'adaptateur sait réellement
         * résoudre et valoriser un instrument. Les options en sont absentes :
         * EODHD ne publie pas de chaîne d'options, et l'annoncer ferait router
         * vers lui des requêtes qu'il ne peut pas honorer.
         */
        assetTypes: ["STOCK", "ETF", "MUTUAL_FUND", "INDEX", "FX", "CRYPTO", "BOND"],
        searchByText: options.mode === "live",
        searchByIsin: options.mode === "live",
        optionChains: false,
        fx: true,
        history: true,
        // Annoncé seulement si une implémentation existe : le routeur écarte
        // les fournisseurs incapables, encore faut-il qu'il soit informé.
        streaming: options.socketFactory !== undefined,
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
      const payload = (await requestJson(
        `real-time/${encodeURIComponent(instrument.providerSymbol)}`,
      )) as EodhdRealtime;
      const close = numericString(payload.close, "close");
      const previousClose =
        payload.previousClose == null
          ? undefined
          : numericString(payload.previousClose, "previousClose");
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
        /*
         * La clé est **omise** quand la valeur est inconnue, jamais posée à
         * `undefined` : le contrat est déclaré sous `exactOptionalPropertyTypes`,
         * où « absent » et « présent mais indéfini » sont deux choses
         * différentes. Absent est celle qui décrit la réalité — le fournisseur
         * n'a pas donné de clôture précédente.
         */
        ...(previousClose === undefined ? {} : { previousClose }),
        marketState: "UNKNOWN",
      };
    },

    async getHistory(request: HistoryRequest): Promise<readonly PriceBar[]> {
      const payload = await requestJson(
        `eod/${encodeURIComponent(request.instrument.providerSymbol)}`,
        {
          from: request.from.slice(0, 10),
          to: request.to.slice(0, 10),
          period: "d",
          order: "a",
        },
      );
      if (!Array.isArray(payload)) {
        throw new ProviderError(
          "MALFORMED_RESPONSE",
          EODHD_PROVIDER_ID,
          "Historique EODHD invalide",
        );
      }
      return (payload as EodhdEodRow[]).map((row) => {
        const date = stringValue(row.date);
        if (date === null)
          throw new ProviderError("MALFORMED_RESPONSE", EODHD_PROVIDER_ID, "Date EOD absente");
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
        /*
         * Un taux d'une devise vers elle-même vaut exactement 1, mais ce n'est
         * pas une observation de marché : aucun fournisseur ne l'a coté.
         * L'annoncer `LIVE` reviendrait à revendiquer une fraîcheur temps réel
         * pour une constante, exactement la promotion que la règle de
         * fraîcheur interdit. `MANUAL` dit ce que c'est : une valeur posée par
         * l'application.
         */
        return {
          base,
          quote,
          rate: toDecimalString("1"),
          provider: EODHD_PROVIDER_ID,
          asOf: now().toISOString(),
          freshness: "MANUAL",
        };
      }
      const payload = (await requestJson(`real-time/${base}${quote}.FOREX`)) as EodhdRealtime;
      const rate = numericString(payload.close, "close");
      if (typeof payload.timestamp !== "number") {
        throw new ProviderError(
          "MALFORMED_RESPONSE",
          EODHD_PROVIDER_ID,
          "Timestamp FX EODHD absent",
        );
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

    /**
     * Abonne un lot d'instruments aux canaux temps réel d'EODHD.
     *
     * Un socket est ouvert **par canal**, pas par instrument : EODHD sépare
     * actions américaines, devises et crypto, et vingt positions sur trois
     * classes tiennent en trois connexions au lieu de vingt.
     *
     * Les instruments qu'aucun canal ne couvre sont ignorés **ici** en toute
     * connaissance de cause : le routeur les a déjà signalés à l'appelant via
     * `unsupported`, et c'est là que l'information doit remonter.
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
                EODHD_PROVIDER_ID,
                "Aucune fabrique de socket configurée",
              );
            }

            const byChannel = new Map<EodhdChannel, ResolvedInstrument[]>();
            for (const instrument of instruments) {
              const channel = eodhdChannelFor(instrument);
              if (channel === null) continue;
              const group = byChannel.get(channel) ?? [];
              group.push(instrument);
              byChannel.set(channel, group);
            }

            const sockets: StreamSocket[] = [];

            for (const [channel, group] of byChannel) {
              const socket = factory(
                eodhdStreamUrl(
                  channel,
                  options.apiToken,
                  options.streamBaseUrl ?? "wss://ws.eodhistoricaldata.com/ws",
                ),
              );

              /*
               * Le symbole de flux diffère du symbole REST : l'index permet de
               * retrouver l'instrument résolu, seul porteur de la devise. La
               * déduire du canal donnerait des dollars à une action suisse.
               */
              const byStreamSymbol = new Map(
                group.map((instrument) => [eodhdStreamSymbol(instrument), instrument]),
              );

              socket.addEventListener("open", () => {
                socket.send(
                  JSON.stringify(eodhdSubscription("subscribe", [...byStreamSymbol.keys()])),
                );
              });

              socket.addEventListener("message", (event: { data: unknown }) => {
                const payload = ((): unknown => {
                  if (typeof event.data !== "string") return event.data;
                  try {
                    return JSON.parse(event.data);
                  } catch {
                    // Un message non-JSON n'est pas une panne : EODHD envoie
                    // des textes de statut. L'ignorer vaut mieux que rompre.
                    return null;
                  }
                })();

                const symbol =
                  typeof payload === "object" && payload !== null && "s" in payload
                    ? String((payload as { s: unknown }).s)
                    : null;
                const instrument = symbol === null ? undefined : byStreamSymbol.get(symbol);
                if (instrument === undefined) return;

                const quote = parseEodhdTick(payload, {
                  instrument,
                  channel,
                  receivedAt: now().toISOString(),
                });
                if (quote !== null) onQuote(quote);
              });

              sockets.push(socket);
            }

            return {
              async unsubscribe(): Promise<void> {
                for (const socket of sockets) socket.close();
              },
            };
          },
        }),
  };
}
