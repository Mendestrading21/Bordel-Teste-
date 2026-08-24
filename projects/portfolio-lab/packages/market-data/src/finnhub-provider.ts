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

export const FINNHUB_PROVIDER_ID = "finnhub";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Plan réellement souscrit.
 *
 * La fraîcheur ne se déduit **jamais** de la présence d'une clé. Le plan
 * gratuit de Finnhub ne sert du temps réel que sur les actions américaines ;
 * tout le reste est différé, et une place suisse ou européenne n'y figure pas
 * du tout. Annoncer `LIVE` parce qu'une réponse est arrivée afficherait « en
 * direct » sur une donnée qui ne l'est pas.
 */
export type FinnhubPlan = "free" | "paid";

export type FinnhubProviderOptions = {
  readonly apiKey: string;
  readonly plan: FinnhubPlan;
  readonly fetchImpl?: FetchLike;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
  /**
   * Délai annoncé du plan, en minutes, quand la fraîcheur est différée.
   * Sans valeur explicite, l'écran dira « différé » sans chiffrer le retard
   * plutôt que d'en inventer un.
   */
  readonly delayMinutes?: number | null;
};

const DEFAULT_BASE_URL = "https://finnhub.io/api/v1";

type QuotePayload = {
  c?: unknown;
  d?: unknown;
  dp?: unknown;
  h?: unknown;
  l?: unknown;
  o?: unknown;
  pc?: unknown;
  t?: unknown;
};

type SearchPayload = { count?: unknown; result?: unknown };

type SearchRow = {
  description?: unknown;
  displaySymbol?: unknown;
  symbol?: unknown;
  type?: unknown;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function decimal(value: unknown, field: string): DecimalString {
  return providerDecimal(value, FINNHUB_PROVIDER_ID, field);
}

/** Extrait tronqué du corps d'une réponse en erreur, pour diagnostiquer. */
async function errorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.trim().slice(0, 300);
  } catch {
    return "";
  }
}

function httpMessage(prefix: string, status: number, body: string): string {
  return body === "" ? `${prefix} HTTP ${status}` : `${prefix} HTTP ${status} — ${body}`;
}

/**
 * Classe d'actifs déduite du champ `type` de la recherche Finnhub.
 *
 * La table ne connaît que ce que la documentation publie. Une valeur inconnue
 * ne devient pas `OTHER` en silence : elle est rendue telle quelle à l'appelant
 * sous forme de `null`, et le candidat est écarté. Ranger un tracker à levier
 * parmi les actions parce que son type n'était pas prévu fausserait ensuite
 * chaque répartition.
 */
const ASSET_TYPE_BY_FINNHUB: Readonly<Record<string, InstrumentCandidate["assetType"]>> = {
  "Common Stock": "STOCK",
  ADR: "STOCK",
  GDR: "STOCK",
  REIT: "STOCK",
  ETP: "ETF",
  ETF: "ETF",
  "Mutual Fund": "MUTUAL_FUND",
  "Closed-End Fund": "MUTUAL_FUND",
  Bond: "BOND",
};

export function finnhubAssetType(raw: unknown): InstrumentCandidate["assetType"] | null {
  const key = str(raw);
  if (key === null) return null;
  return ASSET_TYPE_BY_FINNHUB[key] ?? null;
}

/**
 * Un `c` à zéro n'est pas un cours de zéro.
 *
 * Finnhub renvoie `{"c":0,"d":null,"dp":null,"h":0,"l":0,"o":0,"pc":0}` pour un
 * symbole qu'il ne connaît pas — statut HTTP 200 compris. Prendre ce zéro pour
 * un prix valoriserait la position à néant sans rien signaler, ce qui est pire
 * qu'une erreur : le total resterait plausible.
 */
export function isEmptyQuote(payload: QuotePayload): boolean {
  const current = payload.c;
  const previous = payload.pc;
  const zero = (v: unknown): boolean => v === 0 || v === "0";
  return zero(current) && zero(previous);
}

/**
 * Fraîcheur d'une cotation Finnhub.
 *
 * Elle dépend du plan souscrit **et** du marché : le plan gratuit ne sert du
 * temps réel que sur les places américaines. Un symbole sans suffixe de place
 * est américain chez Finnhub ; tout suffixe (`.SW`, `.PA`, `.L`) désigne une
 * place étrangère, hors du temps réel gratuit.
 */
export function finnhubFreshness(plan: FinnhubPlan, providerSymbol: string): "LIVE" | "DELAYED" {
  if (plan === "paid") return "LIVE";
  return providerSymbol.includes(".") ? "DELAYED" : "LIVE";
}

/**
 * Adaptateur Finnhub.
 *
 * Couverture réelle du plan gratuit : actions et ETF américains. Les fonds de
 * placement, les options et les places suisses ou européennes n'y sont pas —
 * les capacités déclarées le disent, pour que le routeur n'envoie pas chez
 * Finnhub une requête qu'il ne sait pas honorer.
 */
export function createFinnhubProvider(options: FinnhubProviderOptions): MarketDataProvider {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 8000;
  const now = options.now ?? (() => new Date());

  if (options.apiKey.trim() === "") {
    throw new ProviderError("UNAUTHORIZED", FINNHUB_PROVIDER_ID, "Clé Finnhub absente");
  }

  async function call<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    /* La clé passe en en-tête, jamais dans l'URL : une URL finit dans les
       journaux d'accès, un en-tête beaucoup plus rarement. */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        signal: controller.signal,
        headers: { "X-Finnhub-Token": options.apiKey, Accept: "application/json" },
      });
    } catch (cause) {
      throw new ProviderError(
        "NETWORK",
        FINNHUB_PROVIDER_ID,
        `Finnhub injoignable : ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError(
        "UNAUTHORIZED",
        FINNHUB_PROVIDER_ID,
        httpMessage("Clé Finnhub refusée :", response.status, await errorBody(response)),
      );
    }
    if (response.status === 429) {
      const retry = Number(response.headers.get("retry-after"));
      throw new ProviderError(
        "RATE_LIMITED",
        FINNHUB_PROVIDER_ID,
        httpMessage("Quota Finnhub atteint :", response.status, await errorBody(response)),
        Number.isFinite(retry) && retry > 0 ? retry : 60,
      );
    }
    if (!response.ok) {
      throw new ProviderError(
        "NETWORK",
        FINNHUB_PROVIDER_ID,
        httpMessage("Finnhub :", response.status, await errorBody(response)),
      );
    }

    try {
      return (await response.json()) as T;
    } catch (cause) {
      throw new ProviderError(
        "MALFORMED_RESPONSE",
        FINNHUB_PROVIDER_ID,
        `Réponse Finnhub illisible : ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }

  return {
    id: FINNHUB_PROVIDER_ID,

    capabilities(): ProviderCapabilities {
      const freshness = options.plan === "paid" ? "LIVE" : "DELAYED";
      return {
        /* Ni MUTUAL_FUND ni OPTION : le plan gratuit ne les sert pas, et
           déclarer une capacité que rien ne soutient ferait router vers un
           fournisseur qui échouera systématiquement. */
        assetTypes: ["STOCK", "ETF"],
        searchByText: true,
        searchByIsin: false,
        optionChains: false,
        fx: false,
        history: false,
        streaming: false,
        bestFreshness: freshness,
        delayMinutes: freshness === "DELAYED" ? (options.delayMinutes ?? null) : null,
      };
    },

    async search(query: InstrumentSearchQuery): Promise<readonly InstrumentCandidate[]> {
      const text = query.text.trim();
      if (text === "") return [];

      const payload = await call<SearchPayload>("/search", { q: text, exchange: "US" });
      const rows = Array.isArray(payload.result) ? (payload.result as SearchRow[]) : [];

      const candidates: InstrumentCandidate[] = [];
      for (const row of rows) {
        const symbol = str(row.symbol);
        const name = str(row.description);
        const assetType = finnhubAssetType(row.type);
        /* Un type inconnu est écarté, jamais rangé dans « Autre » : une ligne
           mal classée fausse ensuite toutes les répartitions. */
        if (symbol === null || name === null || assetType === null) continue;
        if (query.assetTypes && !query.assetTypes.includes(assetType)) continue;

        candidates.push({
          provider: FINNHUB_PROVIDER_ID,
          providerSymbol: symbol,
          name,
          assetType,
          /* Finnhub ne publie pas la devise sur la recherche. On ne la devine
             pas : le filtre `exchange=US` garantit seulement la place, pas la
             monnaie de cotation d'un ADR. */
          currency: "USD" as CurrencyCode,
          exchangeMic: null,
          isin: null,
          figi: null,
          countryCode: "US",
          confidence: str(row.displaySymbol)?.toUpperCase() === text.toUpperCase() ? 0.9 : 0.5,
        });
      }
      return candidates.slice(0, query.limit ?? 20);
    },

    async resolve(ref: InstrumentReference): Promise<ResolvedInstrument | null> {
      if (ref.kind === "PROVIDER_SYMBOL" && ref.provider === FINNHUB_PROVIDER_ID) {
        return {
          provider: FINNHUB_PROVIDER_ID,
          providerSymbol: ref.symbol,
          name: ref.symbol,
          assetType: "STOCK",
          currency: "USD" as CurrencyCode,
          exchangeMic: null,
          isin: null,
          optionContract: null,
        };
      }

      if (ref.kind !== "TICKER") {
        /* ISIN, FIGI et options ne sont pas résolus ici : Finnhub ne les sert
           pas sur ce plan, et prétendre le contraire enverrait le routeur dans
           une impasse silencieuse. */
        return null;
      }

      const matches = await this.search({ text: ref.ticker, limit: 20 });
      const exact = matches.filter(
        (c) => c.providerSymbol.toUpperCase() === ref.ticker.toUpperCase(),
      );

      if (exact.length === 0) return null;
      if (exact.length > 1) {
        /* Plusieurs contrats portent le même symbole : c'est à l'utilisateur
           de trancher, jamais à l'adaptateur. */
        throw new ProviderError(
          "AMBIGUOUS",
          FINNHUB_PROVIDER_ID,
          `${exact.length} instruments portent le symbole ${ref.ticker}`,
        );
      }

      const only = exact[0];
      if (only === undefined) return null;
      return {
        provider: FINNHUB_PROVIDER_ID,
        providerSymbol: only.providerSymbol,
        name: only.name,
        assetType: only.assetType,
        currency: ref.currency ?? only.currency,
        exchangeMic: ref.exchangeMic ?? null,
        isin: null,
        optionContract: null,
      };
    },

    async getSnapshot(instrument: ResolvedInstrument): Promise<NormalizedQuote> {
      const payload = await call<QuotePayload>("/quote", { symbol: instrument.providerSymbol });

      if (isEmptyQuote(payload)) {
        throw new ProviderError(
          "NOT_FOUND",
          FINNHUB_PROVIDER_ID,
          `Finnhub ne connaît pas ${instrument.providerSymbol} — cotation vide`,
        );
      }

      const seconds =
        typeof payload.t === "number" && Number.isFinite(payload.t) ? payload.t : null;
      if (seconds === null || seconds <= 0) {
        /* Sans horodatage, impossible de dire si la donnée est de la minute ou
           de la semaine dernière. On refuse plutôt que d'inventer `now`. */
        throw new ProviderError(
          "MALFORMED_RESPONSE",
          FINNHUB_PROVIDER_ID,
          `Cotation ${instrument.providerSymbol} sans horodatage exploitable`,
        );
      }

      const quote: NormalizedQuote = {
        instrumentId: instrument.providerSymbol,
        provider: FINNHUB_PROVIDER_ID,
        providerSymbol: instrument.providerSymbol,
        currency: instrument.currency,
        price: decimal(payload.c, "c"),
        priceType: "LAST_TRADE",
        freshness: finnhubFreshness(options.plan, instrument.providerSymbol),
        asOf: new Date(seconds * 1000).toISOString(),
        receivedAt: now().toISOString(),
        ...(payload.pc === 0 || payload.pc === undefined
          ? {}
          : { previousClose: decimal(payload.pc, "pc") }),
      };
      return quote;
    },

    async getHistory(_request: HistoryRequest): Promise<readonly PriceBar[]> {
      /* L'historique est réservé aux plans payants : `history: false` est
         déclaré, et un appelant qui insiste obtient un refus explicite plutôt
         qu'un tableau vide qu'il prendrait pour « aucune donnée ». */
      throw new ProviderError(
        "UNSUPPORTED",
        FINNHUB_PROVIDER_ID,
        "L'historique Finnhub demande un plan payant",
      );
    },
  };
}
