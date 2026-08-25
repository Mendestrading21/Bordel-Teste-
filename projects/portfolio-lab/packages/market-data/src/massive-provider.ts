import type { CurrencyCode } from "@portfolio-lab/domain";

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
import { MASSIVE_PROVIDER_ID } from "./massive-normalisation.js";
import { providerDecimal } from "./provider-decimal.js";

export { MASSIVE_PROVIDER_ID };

export type MassiveMode = "live";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type MassiveProviderOptions = {
  readonly apiKey: string;
  readonly fetchImpl?: FetchLike;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
  /**
   * Fraîcheur garantie par le plan **réellement souscrit**.
   *
   * Massive vend des plans différés et des plans temps réel sur les mêmes
   * endpoints : la réponse a la même forme dans les deux cas. Rien dans la
   * charge utile ne permet donc de distinguer un cours temps réel d'un cours
   * différé de quinze minutes, et le déduire serait une invention. C'est
   * l'abonnement qui décide, et il est déclaré ici.
   */
  readonly freshness: "LIVE" | "DELAYED";
  readonly delayMinutes?: number | null;
};

/**
 * Adaptateur Massive.
 *
 * ⚠️ **Réserve importante.** Les chemins d'endpoint et la forme exacte des
 * réponses n'ont pas pu être confrontés à l'API réelle : la politique de sortie
 * réseau de cet environnement refuse `massive.com`, et aucune clé n'est
 * disponible. Ce que fait cet adaptateur du contenu une fois lu — les
 * invariants de contrat, de multiplicateur, d'échéance et de fraîcheur — est en
 * revanche entièrement testé dans `massive-normalisation.test.ts`.
 *
 * La séparation est délibérée : le jour où l'accès existera, corriger la forme
 * du fil ne touchera que l'extraction, jamais les règles métier.
 */
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

export function createMassiveProvider(options: MassiveProviderOptions): MarketDataProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? "https://api.massive.com").replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? 8_000;
  const now = options.now ?? (() => new Date());

  async function requestJson(
    path: string,
    params: Readonly<Record<string, string>> = {},
  ): Promise<unknown> {
    const url = new URL(`${baseUrl}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url.toString(), {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          /*
           * La clé voyage en en-tête et jamais dans l'URL : une URL se
           * retrouve dans les journaux d'accès, les traces et les rapports
           * d'erreur, et une clé qui y figure est une clé publiée.
           */
          Authorization: `Bearer ${options.apiKey}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        throw new ProviderError(
          "UNAUTHORIZED",
          MASSIVE_PROVIDER_ID,
          httpMessage("Massive", response.status, await errorBody(response)),
        );
      }
      if (response.status === 429) {
        const retry = response.headers.get("retry-after");
        throw new ProviderError(
          "RATE_LIMITED",
          MASSIVE_PROVIDER_ID,
          "Quota Massive atteint",
          retry === null ? null : Number.parseInt(retry, 10),
        );
      }
      if (response.status === 404) {
        throw new ProviderError("NOT_FOUND", MASSIVE_PROVIDER_ID, "Ressource Massive introuvable");
      }
      if (!response.ok) {
        throw new ProviderError(
          "NETWORK",
          MASSIVE_PROVIDER_ID,
          httpMessage("Massive", response.status, await errorBody(response)),
        );
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ProviderError("NETWORK", MASSIVE_PROVIDER_ID, `Massive injoignable : ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    id: MASSIVE_PROVIDER_ID,

    capabilities(): ProviderCapabilities {
      return {
        /*
         * Massive est un fournisseur **américain**. Y router une action suisse
         * produirait un « introuvable » qui ressemble à un instrument
         * inexistant plutôt qu'à une couverture absente. Les fonds classiques
         * en sont exclus : ils se valorisent à la NAV, que Massive ne publie
         * pas.
         */
        assetTypes: ["STOCK", "ETF", "OPTION", "INDEX", "FUTURE"],
        searchByText: true,
        searchByIsin: false,
        /*
         * `false`, alors que Massive publie bien des chaînes d'options.
         *
         * Le drapeau décrit ce que **cet adaptateur** sait faire, pas ce que le
         * fournisseur propose. Aucune méthode `getOptionChain` n'a été écrite
         * ici : l'annoncer ferait choisir Massive par le routeur pour une
         * chaîne, puis échouer à chaque appel — une lacune de couverture
         * déguisée en panne intermittente.
         */
        optionChains: false,
        fx: false,
        history: true,
        // Le flux relève de LIVE-09 : l'annoncer ici promettrait un temps réel
        // qu'aucune implémentation ne sait ouvrir.
        streaming: false,
        bestFreshness: options.freshness,
        delayMinutes: options.freshness === "DELAYED" ? (options.delayMinutes ?? null) : null,
      };
    },

    async search(query: InstrumentSearchQuery): Promise<readonly InstrumentCandidate[]> {
      const needle = query.text.trim();
      if (needle === "") return [];
      const payload = (await requestJson("v3/reference/tickers", {
        search: needle,
        limit: String(query.limit ?? 20),
        active: "true",
      })) as { results?: unknown };

      if (!Array.isArray(payload.results)) {
        throw new ProviderError(
          "MALFORMED_RESPONSE",
          MASSIVE_PROVIDER_ID,
          "Réponse de recherche Massive sans tableau `results`",
        );
      }

      return payload.results.flatMap((row): InstrumentCandidate[] => {
        if (typeof row !== "object" || row === null) return [];
        const entry = row as Record<string, unknown>;
        const ticker = typeof entry["ticker"] === "string" ? entry["ticker"] : null;
        const name = typeof entry["name"] === "string" ? entry["name"] : null;
        if (ticker === null || name === null) return [];

        const assetType = ((): InstrumentCandidate["assetType"] | null => {
          const market = typeof entry["market"] === "string" ? entry["market"] : "";
          const type = typeof entry["type"] === "string" ? entry["type"].toUpperCase() : "";
          if (market === "indices") return "INDEX";
          if (market === "futures") return "FUTURE";
          if (type === "ETF" || type === "ETV" || type === "ETN") return "ETF";
          if (type === "CS" || type === "ADRC" || type === "PFD") return "STOCK";
          return null;
        })();
        if (assetType === null) return [];
        if (query.assetTypes !== undefined && !query.assetTypes.includes(assetType)) return [];

        const currency =
          typeof entry["currency_name"] === "string"
            ? (entry["currency_name"].toUpperCase() as CurrencyCode)
            : ("USD" as CurrencyCode);

        return [
          {
            provider: MASSIVE_PROVIDER_ID,
            providerSymbol: ticker,
            name,
            assetType,
            currency,
            exchangeMic:
              typeof entry["primary_exchange"] === "string" ? entry["primary_exchange"] : null,
            isin: null,
            figi: typeof entry["composite_figi"] === "string" ? entry["composite_figi"] : null,
            countryCode: "US",
            confidence: ticker.toUpperCase() === needle.toUpperCase() ? 0.95 : 0.6,
          },
        ];
      });
    },

    async resolve(ref: InstrumentReference): Promise<ResolvedInstrument | null> {
      if (ref.kind !== "TICKER" && ref.kind !== "PROVIDER_SYMBOL") return null;
      if (ref.kind === "PROVIDER_SYMBOL" && ref.provider !== MASSIVE_PROVIDER_ID) return null;

      const symbol = ref.kind === "TICKER" ? ref.ticker : ref.symbol;
      const candidates = await this.search({ text: symbol, limit: 50 });
      const exact = candidates.filter(
        (candidate) => candidate.providerSymbol.toUpperCase() === symbol.toUpperCase(),
      );

      if (exact.length === 0) return null;
      if (exact.length > 1) {
        throw new ProviderError(
          "AMBIGUOUS",
          MASSIVE_PROVIDER_ID,
          `${exact.length} instruments portent le symbole ${symbol}`,
        );
      }

      const hit = exact[0];
      if (hit === undefined) return null;
      return {
        provider: MASSIVE_PROVIDER_ID,
        providerSymbol: hit.providerSymbol,
        name: hit.name,
        assetType: hit.assetType,
        currency: hit.currency,
        exchangeMic: hit.exchangeMic,
        isin: hit.isin,
        optionContract: null,
      };
    },

    async getSnapshot(instrument: ResolvedInstrument): Promise<NormalizedQuote> {
      const payload = (await requestJson(
        `v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(instrument.providerSymbol)}`,
      )) as { ticker?: Record<string, unknown> };

      const snapshot = payload.ticker;
      if (snapshot === undefined) {
        throw new ProviderError(
          "NOT_FOUND",
          MASSIVE_PROVIDER_ID,
          `Aucun instantané pour ${instrument.providerSymbol}`,
        );
      }

      const lastTrade = snapshot["lastTrade"] as Record<string, unknown> | undefined;
      const price = providerDecimal(lastTrade?.["p"], MASSIVE_PROVIDER_ID, "lastTrade.p");

      /*
       * Massive horodate en nanosecondes. Diviser par un million donne des
       * millisecondes ; l'oublier daterait chaque cours de plusieurs
       * millénaires dans le futur, et la détection de péremption les
       * accepterait tous comme frais.
       */
      const nanos = lastTrade?.["t"];
      if (typeof nanos !== "number" || !Number.isFinite(nanos)) {
        throw new ProviderError(
          "MALFORMED_RESPONSE",
          MASSIVE_PROVIDER_ID,
          "Horodatage de transaction absent",
        );
      }

      const previousDay = snapshot["prevDay"] as Record<string, unknown> | undefined;
      const previousClose =
        previousDay?.["c"] === undefined || previousDay["c"] === null
          ? undefined
          : providerDecimal(previousDay["c"], MASSIVE_PROVIDER_ID, "prevDay.c");

      return {
        instrumentId: instrument.providerSymbol,
        provider: MASSIVE_PROVIDER_ID,
        providerSymbol: instrument.providerSymbol,
        currency: instrument.currency,
        price,
        priceType: "LAST_TRADE",
        // Jamais déduite de la charge utile : les plans différés et temps réel
        // renvoient la même forme.
        freshness: options.freshness,
        asOf: new Date(nanos / 1_000_000).toISOString(),
        receivedAt: now().toISOString(),
        ...(previousClose === undefined ? {} : { previousClose }),
      };
    },

    async getHistory(request: HistoryRequest): Promise<readonly PriceBar[]> {
      const from = request.from.slice(0, 10);
      const to = request.to.slice(0, 10);
      const payload = (await requestJson(
        `v2/aggs/ticker/${encodeURIComponent(request.instrument.providerSymbol)}/range/1/day/${from}/${to}`,
        { adjusted: "true", sort: "asc" },
      )) as { results?: unknown };

      if (!Array.isArray(payload.results)) return [];

      return payload.results.flatMap((row): PriceBar[] => {
        if (typeof row !== "object" || row === null) return [];
        const bar = row as Record<string, unknown>;
        const timestamp = bar["t"];
        if (typeof timestamp !== "number") return [];
        return [
          {
            date: new Date(timestamp).toISOString().slice(0, 10),
            open: bar["o"] == null ? null : providerDecimal(bar["o"], MASSIVE_PROVIDER_ID, "o"),
            high: bar["h"] == null ? null : providerDecimal(bar["h"], MASSIVE_PROVIDER_ID, "h"),
            low: bar["l"] == null ? null : providerDecimal(bar["l"], MASSIVE_PROVIDER_ID, "l"),
            close: providerDecimal(bar["c"], MASSIVE_PROVIDER_ID, "c"),
            currency: request.instrument.currency,
          },
        ];
      });
    },
  };
}
