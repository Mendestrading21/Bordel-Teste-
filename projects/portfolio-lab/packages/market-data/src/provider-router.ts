import type {
  HistoryRequest,
  InstrumentCandidate,
  InstrumentReference,
  InstrumentSearchQuery,
  MarketDataProvider,
  NormalizedQuote,
  PriceBar,
  ResolvedInstrument,
  SubscriptionHandle,
} from "./contract";
import { ProviderError } from "./contract";

export type ProviderRequirement =
  "search" | "resolve" | "snapshot" | "history" | "stream" | "optionChain" | "fx";

export type ProviderPolicy = {
  readonly providerId: string;
  readonly priority: number;
  readonly enabled: boolean;
};

export type RouterTrace = {
  readonly requirement: ProviderRequirement;
  readonly attemptedProviders: readonly string[];
  readonly servedBy: string | null;
  readonly failures: readonly { provider: string; kind: string; message: string }[];
};

/**
 * Routeur fournisseur générique.
 *
 * Objectifs :
 * - centraliser le fallback ;
 * - ne jamais coder de logique fournisseur dans l'UI ;
 * - conserver une trace de quel fournisseur a effectivement servi la donnée ;
 * - ne pas masquer les erreurs de couverture ou de licence.
 */
export class ProviderRouter {
  private readonly providers = new Map<string, MarketDataProvider>();
  private readonly policies: readonly ProviderPolicy[];

  constructor(providers: readonly MarketDataProvider[], policies?: readonly ProviderPolicy[]) {
    for (const provider of providers) this.providers.set(provider.id, provider);
    this.policies = [
      ...(policies ??
        providers.map((p, index) => ({ providerId: p.id, priority: index, enabled: true }))),
    ]
      .filter((p) => p.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  private ordered(requirement: ProviderRequirement): MarketDataProvider[] {
    return this.policies
      .map((policy) => this.providers.get(policy.providerId))
      .filter((provider): provider is MarketDataProvider => Boolean(provider))
      .filter((provider) => {
        const c = provider.capabilities();
        if (requirement === "search") return c.searchByText || c.searchByIsin;
        if (requirement === "history") return c.history;
        if (requirement === "stream") return c.streaming && Boolean(provider.subscribe);
        if (requirement === "optionChain") return c.optionChains;
        if (requirement === "fx") return c.fx && Boolean(provider.getFxRate);
        return true;
      });
  }

  private async firstSuccess<T>(
    requirement: ProviderRequirement,
    operation: (provider: MarketDataProvider) => Promise<T>,
  ): Promise<{ value: T; trace: RouterTrace }> {
    const attemptedProviders: string[] = [];
    const failures: { provider: string; kind: string; message: string }[] = [];

    for (const provider of this.ordered(requirement)) {
      attemptedProviders.push(provider.id);
      try {
        const value = await operation(provider);
        return {
          value,
          trace: { requirement, attemptedProviders, servedBy: provider.id, failures },
        };
      } catch (error) {
        if (error instanceof ProviderError) {
          failures.push({ provider: provider.id, kind: error.kind, message: error.message });
          if (["NOT_FOUND", "UNSUPPORTED", "RATE_LIMITED", "NETWORK"].includes(error.kind))
            continue;
        }
        throw error;
      }
    }

    throw new ProviderError(
      "NOT_FOUND",
      "router",
      `Aucun fournisseur disponible pour ${requirement}. Tentatives: ${attemptedProviders.join(", ") || "aucune"}`,
    );
  }

  async search(
    query: InstrumentSearchQuery,
  ): Promise<{ candidates: readonly InstrumentCandidate[]; trace: RouterTrace }> {
    const providers = this.ordered("search");
    const attemptedProviders: string[] = [];
    const failures: { provider: string; kind: string; message: string }[] = [];
    const all: InstrumentCandidate[] = [];

    for (const provider of providers) {
      attemptedProviders.push(provider.id);
      try {
        all.push(...(await provider.search(query)));
      } catch (error) {
        if (error instanceof ProviderError) {
          failures.push({ provider: provider.id, kind: error.kind, message: error.message });
          if (["NOT_FOUND", "UNSUPPORTED", "RATE_LIMITED", "NETWORK"].includes(error.kind))
            continue;
        }
        throw error;
      }
    }

    const dedupe = new Map<string, InstrumentCandidate>();
    for (const candidate of all) {
      const key = [
        candidate.isin ?? "",
        candidate.providerSymbol,
        candidate.exchangeMic ?? "",
        candidate.currency,
      ].join("|");
      const previous = dedupe.get(key);
      if (!previous || candidate.confidence > previous.confidence) dedupe.set(key, candidate);
    }

    const candidates = [...dedupe.values()]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, query.limit ?? 25);

    return {
      candidates,
      trace: {
        requirement: "search",
        attemptedProviders,
        servedBy: candidates.length > 0 ? "multi" : null,
        failures,
      },
    };
  }

  resolve(
    ref: InstrumentReference,
  ): Promise<{ instrument: ResolvedInstrument; trace: RouterTrace }> {
    return this.firstSuccess("resolve", async (provider) => {
      const instrument = await provider.resolve(ref);
      if (!instrument) throw new ProviderError("NOT_FOUND", provider.id, "Instrument introuvable");
      return instrument;
    }).then(({ value, trace }) => ({ instrument: value, trace }));
  }

  snapshot(
    instrument: ResolvedInstrument,
  ): Promise<{ quote: NormalizedQuote; trace: RouterTrace }> {
    const preferred = this.providers.get(instrument.provider);
    if (preferred) {
      return preferred
        .getSnapshot(instrument)
        .then((quote) => ({
          quote,
          trace: {
            requirement: "snapshot" as const,
            attemptedProviders: [preferred.id],
            servedBy: preferred.id,
            failures: [],
          },
        }))
        .catch(async (error) => {
          if (
            !(error instanceof ProviderError) ||
            !["NOT_FOUND", "UNSUPPORTED", "RATE_LIMITED", "NETWORK"].includes(error.kind)
          )
            throw error;
          const fallback = await this.firstSuccess("snapshot", (provider) =>
            provider.getSnapshot(instrument),
          );
          return { quote: fallback.value, trace: fallback.trace };
        });
    }

    return this.firstSuccess("snapshot", (provider) => provider.getSnapshot(instrument)).then(
      ({ value, trace }) => ({ quote: value, trace }),
    );
  }

  history(request: HistoryRequest): Promise<{ bars: readonly PriceBar[]; trace: RouterTrace }> {
    return this.firstSuccess("history", (provider) => provider.getHistory(request)).then(
      ({ value, trace }) => ({ bars: value, trace }),
    );
  }

  async subscribe(
    instruments: readonly ResolvedInstrument[],
    onQuote: (quote: NormalizedQuote) => void,
  ): Promise<{ handle: SubscriptionHandle; traces: readonly RouterTrace[] }> {
    const groups = new Map<string, ResolvedInstrument[]>();
    for (const instrument of instruments) {
      const provider = this.providers.get(instrument.provider);
      if (!provider?.subscribe || !provider.capabilities().streaming) continue;
      const group = groups.get(provider.id) ?? [];
      group.push(instrument);
      groups.set(provider.id, group);
    }

    const handles: SubscriptionHandle[] = [];
    const traces: RouterTrace[] = [];
    for (const [providerId, group] of groups) {
      const provider = this.providers.get(providerId)!;
      const handle = await provider.subscribe!(group, onQuote);
      handles.push(handle);
      traces.push({
        requirement: "stream",
        attemptedProviders: [providerId],
        servedBy: providerId,
        failures: [],
      });
    }

    return {
      handle: {
        unsubscribe: async () => {
          await Promise.allSettled(handles.map((h) => h.unsubscribe()));
        },
      },
      traces,
    };
  }
}
