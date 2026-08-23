import type { ProviderCapabilities } from "./contract.js";
import type { ProviderRegistration } from "./registry.js";

/**
 * Fournisseurs candidats de `references/MARKET_DATA.md`.
 *
 * **Aucun de ces adaptateurs n'est implémenté**, et c'est délibéré.
 *
 * Écrire un client HTTP contre une API dont on ne peut vérifier ni le format de
 * réponse, ni le niveau de fraîcheur réellement servi, ni les droits d'usage,
 * reviendrait à produire du code qui *paraît* intégré. La matrice de couverture
 * le rapporterait alors comme testé alors qu'aucun appel n'aurait jamais eu
 * lieu — exactement ce que le skill interdit.
 *
 * Ces enregistrements décrivent donc ce qu'il faut vérifier et ce qui bloque,
 * sous une forme que la matrice et l'écran d'état des fournisseurs lisent
 * directement. `create` renvoie toujours `null` : ajouter une clé n'active pas
 * un adaptateur inexistant.
 *
 * La marche à suivre pour en implémenter un est décrite dans
 * `docs/market-data-integration.md`.
 */

/**
 * Capacités **annoncées par la documentation publique**, jamais mesurées.
 *
 * Le champ `bestFreshness` retenu ici est volontairement le plus prudent :
 * tant que le niveau réellement servi n'a pas été observé, supposer mieux que
 * `DELAYED` reviendrait à croire une plaquette commerciale.
 */
const UNMEASURED_CAPABILITIES = (
  overrides: Partial<ProviderCapabilities>,
): ProviderCapabilities => ({
  assetTypes: [],
  searchByText: false,
  searchByIsin: false,
  optionChains: false,
  fx: false,
  history: false,
  streaming: false,
  bestFreshness: "DELAYED",
  delayMinutes: null,
  ...overrides,
});

const NOT_IMPLEMENTED =
  "Adaptateur non implémenté. Requiert : (1) une clé d'API, (2) un accès réseau " +
  "au fournisseur, (3) la vérification officielle du type de données, du délai, " +
  "de la place de cotation et des droits d'usage personnel. " +
  "Voir docs/market-data-integration.md.";

export const CANDIDATE_PROVIDERS: readonly ProviderRegistration[] = [
  {
    id: "twelvedata",
    label: "Twelve Data",
    capabilities: UNMEASURED_CAPABILITIES({
      assetTypes: ["STOCK", "ETF"],
      searchByText: true,
      searchByIsin: true,
      fx: true,
      history: true,
      streaming: true,
    }),
    verification: "UNVERIFIED",
    blockedBy: NOT_IMPLEMENTED,
    apiKeyEnvVar: "TWELVE_DATA_API_KEY",
    documentationUrl: "https://twelvedata.com/docs",
    create: () => null,
  },
  {
    id: "massive",
    label: "Massive",
    capabilities: UNMEASURED_CAPABILITIES({
      assetTypes: ["STOCK", "OPTION"],
      searchByText: true,
      optionChains: true,
      history: true,
      streaming: true,
    }),
    verification: "UNVERIFIED",
    blockedBy: NOT_IMPLEMENTED,
    apiKeyEnvVar: "MASSIVE_API_KEY",
    documentationUrl: "https://massive.com/docs/websocket/stocks/overview",
    create: () => null,
  },
  {
    id: "eodhd",
    label: "EODHD",
    capabilities: UNMEASURED_CAPABILITIES({
      assetTypes: ["STOCK", "ETF", "MUTUAL_FUND"],
      searchByText: true,
      searchByIsin: true,
      history: true,
      // Une NAV de fonds n'est pas un flux : la meilleure fraîcheur possible
      // pour cette classe d'actifs est structurellement `NAV`.
      bestFreshness: "EOD",
    }),
    verification: "UNVERIFIED",
    blockedBy: NOT_IMPLEMENTED,
    apiKeyEnvVar: "EODHD_API_KEY",
    documentationUrl: "https://eodhd.com/financial-apis/search-api-for-stocks-etfs-mutual-funds",
    create: () => null,
  },
  {
    id: "openfigi",
    label: "OpenFIGI",
    capabilities: UNMEASURED_CAPABILITIES({
      assetTypes: ["STOCK", "ETF", "OPTION", "MUTUAL_FUND"],
      searchByText: true,
      searchByIsin: true,
      // OpenFIGI normalise des identifiants ; ce n'est PAS une source de prix.
      history: false,
      streaming: false,
      bestFreshness: "UNAVAILABLE",
    }),
    verification: "UNVERIFIED",
    blockedBy:
      "Service de normalisation d'identifiants uniquement — ne fournit aucun prix. " +
      NOT_IMPLEMENTED,
    apiKeyEnvVar: "OPENFIGI_API_KEY",
    documentationUrl: "https://www.openfigi.com/api/documentation",
    create: () => null,
  },
];
