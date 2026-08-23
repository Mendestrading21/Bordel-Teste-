import type {
  AssetType,
  CurrencyCode,
  DecimalString,
  MarketState,
  PriceType,
  QuoteFreshness,
} from "@portfolio-lab/domain";

/**
 * Contrat fournisseur de données de marché.
 *
 * Ce fichier ne contient **aucun** type propre à un vendeur. C'est ce qui rend
 * un fournisseur remplaçable par configuration : si un objet de SDK fuit
 * jusqu'ici, le reste du produit s'y accroche et le remplacement devient une
 * réécriture.
 */

/** Identifiant normalisé d'un instrument. */
export type InstrumentReference =
  | { readonly kind: "ISIN"; readonly isin: string; readonly currency?: CurrencyCode }
  | {
      readonly kind: "TICKER";
      readonly ticker: string;
      readonly exchangeMic?: string;
      readonly currency?: CurrencyCode;
    }
  | { readonly kind: "FIGI"; readonly figi: string }
  | { readonly kind: "PROVIDER_SYMBOL"; readonly provider: string; readonly symbol: string }
  | {
      readonly kind: "OPTION";
      readonly underlying: string;
      readonly optionType: "CALL" | "PUT";
      /** Échéance au format ISO `YYYY-MM-DD`. */
      readonly expiration: string;
      readonly strike: DecimalString;
    };

export type InstrumentSearchQuery = {
  /** Texte libre : nom, ticker ou ISIN. */
  readonly text: string;
  readonly assetTypes?: readonly AssetType[];
  readonly exchangeMic?: string;
  readonly limit?: number;
};

/**
 * Candidat retourné par une recherche.
 *
 * `confidence` est une aide au tri, **jamais** une autorisation de sélection
 * automatique : `MARKET_DATA.md` impose que toute ambiguïté soit tranchée par
 * l'utilisateur. Deux classes de parts d'un fonds ne diffèrent parfois que par
 * une lettre.
 */
export type InstrumentCandidate = {
  readonly provider: string;
  readonly providerSymbol: string;
  readonly name: string;
  readonly assetType: AssetType;
  readonly currency: CurrencyCode;
  readonly exchangeMic: string | null;
  readonly isin: string | null;
  readonly figi: string | null;
  readonly countryCode: string | null;
  /** 0 à 1. Aide au tri uniquement. */
  readonly confidence: number;
};

export type ResolvedInstrument = {
  readonly provider: string;
  readonly providerSymbol: string;
  readonly name: string;
  readonly assetType: AssetType;
  readonly currency: CurrencyCode;
  readonly exchangeMic: string | null;
  readonly isin: string | null;
  /** Renseigné uniquement pour `assetType === "OPTION"`. */
  readonly optionContract: OptionContractDetails | null;
};

/**
 * Détail canonique d'un contrat d'option.
 *
 * `multiplier` est **obligatoire** et sans valeur par défaut : un adaptateur qui
 * ne peut pas le lire chez la source doit échouer, jamais supposer 100. Un
 * contrat ajusté après un split ne vaut pas 100.
 */
export type OptionContractDetails = {
  readonly underlyingSymbol: string;
  readonly optionType: "CALL" | "PUT";
  readonly expiration: string;
  readonly strike: DecimalString;
  readonly multiplier: DecimalString;
  /** Symbole OSI quand le fournisseur le publie. */
  readonly osiSymbol: string | null;
  readonly exerciseStyle: "AMERICAN" | "EUROPEAN" | null;
  readonly settlementType: "PHYSICAL" | "CASH" | null;
};

export type NormalizedQuote = {
  readonly instrumentId: string;
  readonly provider: string;
  readonly providerSymbol: string;
  readonly currency: CurrencyCode;
  readonly price: DecimalString;
  readonly priceType: PriceType;
  readonly freshness: QuoteFreshness;
  /** Horodatage du fournisseur, ISO 8601 UTC. */
  readonly asOf: string;
  /** Horodatage de réception, ISO 8601 UTC. */
  readonly receivedAt: string;
  readonly bid?: DecimalString;
  readonly ask?: DecimalString;
  readonly previousClose?: DecimalString;
  readonly marketState?: MarketState;
};

export type PriceBar = {
  readonly date: string;
  readonly open: DecimalString | null;
  readonly high: DecimalString | null;
  readonly low: DecimalString | null;
  readonly close: DecimalString;
  readonly currency: CurrencyCode;
};

export type HistoryRequest = {
  readonly instrument: ResolvedInstrument;
  readonly from: string;
  readonly to: string;
  readonly interval: "1day";
};

export type FxQuote = {
  readonly base: CurrencyCode;
  readonly quote: CurrencyCode;
  readonly rate: DecimalString;
  readonly provider: string;
  readonly asOf: string;
  readonly freshness: QuoteFreshness;
};

/**
 * Capacités déclarées d'un fournisseur.
 *
 * Déclarées et non devinées : le routeur choisit un fournisseur par capacité et
 * par classe d'actifs, pas par ordre de configuration.
 */
export type ProviderCapabilities = {
  readonly assetTypes: readonly AssetType[];
  readonly searchByText: boolean;
  readonly searchByIsin: boolean;
  readonly optionChains: boolean;
  readonly fx: boolean;
  readonly history: boolean;
  readonly streaming: boolean;
  /**
   * Meilleure fraîcheur que le fournisseur peut fournir **avec l'abonnement
   * configuré**. Un plan gratuit qui ne sert que du différé doit annoncer
   * `DELAYED`, jamais `LIVE`.
   */
  readonly bestFreshness: QuoteFreshness;
  /** Délai annoncé en minutes quand `bestFreshness` vaut `DELAYED`. */
  readonly delayMinutes: number | null;
};

export type SubscriptionHandle = {
  readonly unsubscribe: () => Promise<void>;
};

/** Erreurs normalisées, communes à tous les adaptateurs. */
export type ProviderErrorKind =
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "UNSUPPORTED"
  | "NETWORK"
  | "MALFORMED_RESPONSE";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    readonly provider: string,
    message: string,
    /** Délai suggéré avant nouvelle tentative, en secondes. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface MarketDataProvider {
  readonly id: string;
  capabilities(): ProviderCapabilities;
  search(query: InstrumentSearchQuery): Promise<readonly InstrumentCandidate[]>;
  resolve(ref: InstrumentReference): Promise<ResolvedInstrument | null>;
  getSnapshot(instrument: ResolvedInstrument): Promise<NormalizedQuote>;
  getHistory(request: HistoryRequest): Promise<readonly PriceBar[]>;
  getFxRate?(base: CurrencyCode, quote: CurrencyCode): Promise<FxQuote>;
  subscribe?(
    instruments: readonly ResolvedInstrument[],
    onQuote: (quote: NormalizedQuote) => void,
  ): Promise<SubscriptionHandle>;
}
