import { ProviderError } from "./contract.js";

export const OPENFIGI_PROVIDER_ID = "openfigi";
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type OpenFigiResolverOptions = {
  readonly apiKey?: string;
  readonly fetchImpl?: FetchLike;
  readonly timeoutMs?: number;
};

export type OpenFigiMappingRequest = {
  readonly idType: "ID_ISIN" | "TICKER" | "ID_BB_GLOBAL";
  readonly idValue: string;
  readonly micCode?: string;
  readonly currency?: string;
};

export type OpenFigiMatch = {
  readonly figi: string;
  readonly ticker: string | null;
  readonly name: string | null;
  readonly exchangeCode: string | null;
  readonly securityType: string | null;
  readonly securityType2: string | null;
  readonly marketSector: string | null;
  readonly compositeFigi: string | null;
  readonly shareClassFigi: string | null;
};

type RawMatch = {
  figi?: unknown;
  ticker?: unknown;
  name?: unknown;
  exchCode?: unknown;
  securityType?: unknown;
  securityType2?: unknown;
  marketSector?: unknown;
  compositeFIGI?: unknown;
  shareClassFIGI?: unknown;
};
type RawJobResult = { data?: unknown; error?: unknown; warning?: unknown };

const stringOrNull = (value: unknown): string | null => typeof value === "string" && value.trim() !== "" ? value : null;

export function createOpenFigiResolver(options: OpenFigiResolverOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;

  async function map(requests: readonly OpenFigiMappingRequest[]): Promise<readonly (readonly OpenFigiMatch[])[]> {
    if (requests.length === 0) return [];
    const maxJobs = options.apiKey === undefined ? 5 : 100;
    if (requests.length > maxJobs) {
      throw new ProviderError("UNSUPPORTED", OPENFIGI_PROVIDER_ID, `OpenFIGI accepte au plus ${maxJobs} jobs par requête dans ce mode`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
      if (options.apiKey !== undefined) headers["X-OPENFIGI-APIKEY"] = options.apiKey;
      const response = await fetchImpl("https://api.openfigi.com/v3/mapping", {
        method: "POST",
        headers,
        body: JSON.stringify(requests),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        throw new ProviderError("UNAUTHORIZED", OPENFIGI_PROVIDER_ID, `OpenFIGI HTTP ${response.status}`);
      }
      if (response.status === 429) {
        const reset = response.headers.get("ratelimit-reset");
        throw new ProviderError(
          "RATE_LIMITED",
          OPENFIGI_PROVIDER_ID,
          "OpenFIGI rate limit atteint",
          reset === null ? null : Number.parseInt(reset, 10),
        );
      }
      if (!response.ok) throw new ProviderError("NETWORK", OPENFIGI_PROVIDER_ID, `OpenFIGI HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload) || payload.length !== requests.length) {
        throw new ProviderError("MALFORMED_RESPONSE", OPENFIGI_PROVIDER_ID, "Réponse OpenFIGI non alignée avec les jobs envoyés");
      }
      return (payload as RawJobResult[]).map((job) => {
        if (!Array.isArray(job.data)) return [];
        return (job.data as RawMatch[]).flatMap((raw): OpenFigiMatch[] => {
          const figi = stringOrNull(raw.figi);
          if (figi === null) return [];
          return [{
            figi,
            ticker: stringOrNull(raw.ticker),
            name: stringOrNull(raw.name),
            exchangeCode: stringOrNull(raw.exchCode),
            securityType: stringOrNull(raw.securityType),
            securityType2: stringOrNull(raw.securityType2),
            marketSector: stringOrNull(raw.marketSector),
            compositeFigi: stringOrNull(raw.compositeFIGI),
            shareClassFigi: stringOrNull(raw.shareClassFIGI),
          }];
        });
      });
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ProviderError("NETWORK", OPENFIGI_PROVIDER_ID, `OpenFIGI indisponible : ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    map,
    async byIsin(isin: string): Promise<readonly OpenFigiMatch[]> {
      return (await map([{ idType: "ID_ISIN", idValue: isin }]))[0] ?? [];
    },
    async byTicker(ticker: string, micCode?: string): Promise<readonly OpenFigiMatch[]> {
      return (await map([{ idType: "TICKER", idValue: ticker, ...(micCode === undefined ? {} : { micCode }) }]))[0] ?? [];
    },
    async byFigi(figi: string): Promise<readonly OpenFigiMatch[]> {
      return (await map([{ idType: "ID_BB_GLOBAL", idValue: figi }]))[0] ?? [];
    },
  };
}
