import type { AssetType } from "@portfolio-lab/domain";

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

/**
 * Ce que la requête concerne, au-delà du simple besoin technique.
 *
 * Sans cela, le routeur interrogeait un fournisseur crypto pour une option
 * américaine : la requête partait, échouait, et la latence était payée pour
 * rien. Pire, un fournisseur qui répond « je ne trouve pas » pour un actif
 * qu'il ne couvre **pas du tout** est indiscernable d'un fournisseur qui a
 * vraiment cherché.
 */
export type RoutingContext = {
  readonly assetType?: AssetType | undefined;
  readonly exchangeMic?: string | null | undefined;
};

export type RouterFailure = {
  readonly provider: string;
  readonly kind: string;
  readonly message: string;
};

export type RouterTrace = {
  readonly requirement: ProviderRequirement;
  readonly attemptedProviders: readonly string[];
  readonly servedBy: string | null;
  readonly failures: readonly RouterFailure[];
  /**
   * Fournisseurs écartés **avant** tout appel, avec la raison.
   *
   * Un fournisseur simplement absent de la liste des tentatives ne dit pas
   * s'il a été jugé incompétent, désactivé, ou s'il n'existe pas. La
   * distinction compte pour diagnostiquer une couverture manquante.
   */
  readonly skipped: readonly { provider: string; reason: string }[];
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

  /**
   * Raison pour laquelle un fournisseur ne peut pas servir cette requête, ou
   * `null` s'il le peut.
   *
   * Renvoyer la **raison** plutôt qu'un booléen est délibéré : elle est
   * reportée dans la trace, et c'est elle qui permet de répondre à « pourquoi
   * cette obligation n'a-t-elle aucun cours ? » sans relire le code.
   */
  private incapacity(
    provider: MarketDataProvider,
    requirement: ProviderRequirement,
    context: RoutingContext,
  ): string | null {
    const capabilities = provider.capabilities();

    if (context.assetType !== undefined && !capabilities.assetTypes.includes(context.assetType)) {
      return `ne couvre pas ${context.assetType}`;
    }

    switch (requirement) {
      case "search":
        return capabilities.searchByText || capabilities.searchByIsin
          ? null
          : "aucune recherche supportée";
      case "history":
        return capabilities.history ? null : "pas d'historique";
      case "stream":
        if (!capabilities.streaming) return "pas de flux temps réel";
        return provider.subscribe === undefined ? "aucune implémentation de flux" : null;
      case "optionChain":
        return capabilities.optionChains ? null : "pas de chaîne d'options";
      case "fx":
        if (!capabilities.fx) return "pas de FX";
        return provider.getFxRate === undefined ? "aucune implémentation FX" : null;
      case "resolve":
      case "snapshot":
        return null;
    }
  }

  private ordered(
    requirement: ProviderRequirement,
    context: RoutingContext,
  ): { usable: MarketDataProvider[]; skipped: { provider: string; reason: string }[] } {
    const usable: MarketDataProvider[] = [];
    const skipped: { provider: string; reason: string }[] = [];

    for (const policy of this.policies) {
      const provider = this.providers.get(policy.providerId);
      if (provider === undefined) {
        skipped.push({ provider: policy.providerId, reason: "fournisseur non enregistré" });
        continue;
      }
      const reason = this.incapacity(provider, requirement, context);
      if (reason === null) usable.push(provider);
      else skipped.push({ provider: provider.id, reason });
    }

    return { usable, skipped };
  }

  /** Erreurs qui autorisent à essayer le fournisseur suivant. */
  private static readonly RECOVERABLE = new Set([
    "NOT_FOUND",
    "UNSUPPORTED",
    "RATE_LIMITED",
    "NETWORK",
  ]);

  private async firstSuccess<T>(
    requirement: ProviderRequirement,
    context: RoutingContext,
    operation: (provider: MarketDataProvider) => Promise<T>,
  ): Promise<{ value: T; trace: RouterTrace }> {
    const { usable, skipped } = this.ordered(requirement, context);
    const attemptedProviders: string[] = [];
    const failures: RouterFailure[] = [];

    for (const provider of usable) {
      attemptedProviders.push(provider.id);
      try {
        const value = await operation(provider);
        return {
          value,
          trace: { requirement, attemptedProviders, servedBy: provider.id, failures, skipped },
        };
      } catch (error) {
        if (error instanceof ProviderError) {
          failures.push({ provider: provider.id, kind: error.kind, message: error.message });
          /*
           * `UNAUTHORIZED` et `AMBIGUOUS` ne sont pas récupérables, et c'est
           * volontaire. Basculer sur un autre fournisseur masquerait une clé
           * invalide derrière un résultat plausible, ou trancherait à la place
           * de l'utilisateur entre deux instruments homonymes.
           */
          if (ProviderRouter.RECOVERABLE.has(error.kind)) continue;
        }
        throw error;
      }
    }

    const detail =
      attemptedProviders.length > 0
        ? `Tentatives : ${attemptedProviders.join(", ")}`
        : skipped.length > 0
          ? `Aucun fournisseur compétent — ${skipped.map((entry) => `${entry.provider} (${entry.reason})`).join(", ")}`
          : "Aucun fournisseur enregistré";

    throw new ProviderError(
      "NOT_FOUND",
      "router",
      `Aucun fournisseur disponible pour ${requirement}. ${detail}`,
    );
  }

  async search(
    query: InstrumentSearchQuery,
  ): Promise<{ candidates: readonly InstrumentCandidate[]; trace: RouterTrace }> {
    /*
     * Une recherche portant sur un seul type d'actif n'interroge que les
     * fournisseurs qui le couvrent. Quand plusieurs types sont demandés — ou
     * aucun — tous les fournisseurs de recherche sont interrogés : c'est le cas
     * de la recherche universelle, où l'utilisateur tape « Apple » sans dire ce
     * qu'il cherche.
     */
    const soleType = query.assetTypes?.length === 1 ? query.assetTypes[0] : undefined;
    const { usable, skipped } = this.ordered("search", { assetType: soleType });

    const attemptedProviders: string[] = [];
    const failures: RouterFailure[] = [];
    const all: InstrumentCandidate[] = [];

    for (const provider of usable) {
      attemptedProviders.push(provider.id);
      try {
        all.push(...(await provider.search(query)));
      } catch (error) {
        if (error instanceof ProviderError) {
          /*
           * Contrairement à `firstSuccess`, une recherche ne s'interrompt pas
           * sur `UNAUTHORIZED`. Une clé invalide chez un fournisseur sur six ne
           * doit pas priver l'utilisateur des résultats des cinq autres. Rien
           * n'est masqué pour autant : l'échec figure dans la trace, et
           * l'interface peut annoncer « EODHD : clé refusée » à côté des
           * résultats obtenus ailleurs.
           */
          failures.push({ provider: provider.id, kind: error.kind, message: error.message });
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
        skipped,
      },
    };
  }

  resolve(
    ref: InstrumentReference,
    context?: RoutingContext,
  ): Promise<{ instrument: ResolvedInstrument; trace: RouterTrace }> {
    return this.firstSuccess("resolve", context ?? {}, async (provider) => {
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
            skipped: [],
          },
        }))
        .catch(async (error) => {
          if (
            !(error instanceof ProviderError) ||
            !["NOT_FOUND", "UNSUPPORTED", "RATE_LIMITED", "NETWORK"].includes(error.kind)
          )
            throw error;
          const fallback = await this.firstSuccess(
            "snapshot",
            { assetType: instrument.assetType, exchangeMic: instrument.exchangeMic },
            (provider) => provider.getSnapshot(instrument),
          );
          return { quote: fallback.value, trace: fallback.trace };
        });
    }

    return this.firstSuccess(
      "snapshot",
      { assetType: instrument.assetType, exchangeMic: instrument.exchangeMic },
      (provider) => provider.getSnapshot(instrument),
    ).then(({ value, trace }) => ({ quote: value, trace }));
  }

  history(request: HistoryRequest): Promise<{ bars: readonly PriceBar[]; trace: RouterTrace }> {
    return this.firstSuccess(
      "history",
      {
        assetType: request.instrument.assetType,
        exchangeMic: request.instrument.exchangeMic,
      },
      (provider) => provider.getHistory(request),
    ).then(({ value, trace }) => ({ bars: value, trace }));
  }

  /**
   * Abonne un lot d'instruments, en disant lesquels ne seront pas suivis.
   *
   * La version précédente ignorait en silence tout instrument dont le
   * fournisseur ne sait pas diffuser : l'appelant recevait une souscription
   * apparemment normale, et la moitié de son portefeuille ne bougeait jamais.
   * Rien ne distinguait cela d'un marché calme. Les instruments non couverts
   * sont désormais rendus explicitement, avec la raison.
   */
  async subscribe(
    instruments: readonly ResolvedInstrument[],
    onQuote: (quote: NormalizedQuote) => void,
  ): Promise<{
    handle: SubscriptionHandle;
    traces: readonly RouterTrace[];
    unsupported: readonly { instrument: ResolvedInstrument; reason: string }[];
  }> {
    const groups = new Map<string, ResolvedInstrument[]>();
    const unsupported: { instrument: ResolvedInstrument; reason: string }[] = [];

    for (const instrument of instruments) {
      const provider = this.providers.get(instrument.provider);
      if (provider === undefined) {
        unsupported.push({
          instrument,
          reason: `fournisseur « ${instrument.provider} » non enregistré`,
        });
        continue;
      }
      const reason = this.incapacity(provider, "stream", {
        assetType: instrument.assetType,
        exchangeMic: instrument.exchangeMic,
      });
      if (reason !== null) {
        unsupported.push({ instrument, reason: `${provider.id} : ${reason}` });
        continue;
      }
      const group = groups.get(provider.id) ?? [];
      group.push(instrument);
      groups.set(provider.id, group);
    }

    const handles: SubscriptionHandle[] = [];
    const traces: RouterTrace[] = [];

    for (const [providerId, group] of groups) {
      const provider = this.providers.get(providerId);
      // `incapacity` a déjà garanti les deux présences ; la vérification
      // explicite évite une assertion non nulle que le type ne justifie pas.
      if (provider?.subscribe === undefined) continue;
      const handle = await provider.subscribe(group, onQuote);
      handles.push(handle);
      traces.push({
        requirement: "stream",
        attemptedProviders: [providerId],
        servedBy: providerId,
        failures: [],
        skipped: [],
      });
    }

    return {
      handle: {
        unsubscribe: async () => {
          await Promise.allSettled(handles.map((entry) => entry.unsubscribe()));
        },
      },
      traces,
      unsupported,
    };
  }
}
