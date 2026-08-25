import { createCoinGeckoProvider } from "./coingecko-provider.js";
import { createFinnhubProvider } from "./finnhub-provider.js";
import type { ProviderCapabilities } from "./contract.js";
import { createEodhdProvider } from "./eodhd-provider.js";
import { createMassiveProvider } from "./massive-provider.js";
import { createTwelveDataProvider } from "./twelve-data-provider.js";
import type { ProviderRegistration } from "./registry.js";

/**
 * Fournisseurs candidats de `references/MARKET_DATA.md`.
 *
 * Quatre adaptateurs existent désormais réellement — EODHD, Twelve Data,
 * CoinGecko et Massive — et `create` les instancie quand leur clé, ou leur mode
 * démo officiel, est disponible. Les autres restent des descriptions de ce
 * qu'il faudrait vérifier : `create` y renvoie `null`, et ajouter une clé
 * n'active pas un adaptateur inexistant.
 *
 * La distinction est portée par `verification` et `blockedBy`, jamais par un
 * silence. Un fournisseur non instancié produit des cellules `NOT_RUN` avec sa
 * raison — jamais des `NOT_FOUND`, qui feraient croire à un défaut de
 * couverture alors qu'aucun appel n'a eu lieu.
 *
 * Aucun de ces adaptateurs n'est pour autant `PRODUCTION_TESTED` : écrire un
 * client HTTP ne prouve pas qu'il fonctionne. Tant qu'un appel réel n'a pas
 * abouti, le niveau de vérification reste au mieux `IMPLEMENTED_UNTESTED` —
 * dire mieux reviendrait à croire une plaquette commerciale.
 *
 * La marche à suivre est décrite dans `docs/market-data-integration.md`.
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

const BLOCKED_BY_ACCESS =
  "Adaptateur implémenté et testé sur fixtures. Reste à prouver par un appel " +
  "réel : requiert (1) une clé d'API ou le mode démo officiel, (2) un accès " +
  "réseau au fournisseur, (3) la vérification du délai réellement servi et des " +
  "droits d'usage personnel. Voir docs/market-data-integration.md.";

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
    verification: "FIXTURE_TESTED",
    blockedBy: BLOCKED_BY_ACCESS,
    apiKeyEnvVar: "TWELVE_DATA_API_KEY",
    documentationUrl: "https://twelvedata.com/docs",
    create: (env) => {
      const apiKey = env["TWELVE_DATA_API_KEY"];
      /*
       * `demo` est la clé publique officielle de Twelve Data. L'utiliser sans
       * clé personnelle est légitime et permet de prouver le transport ; la
       * fraîcheur reste `DELAYED`, jamais promue.
       */
      return createTwelveDataProvider({
        apiKey: apiKey ?? "demo",
        mode: apiKey === undefined ? "demo" : "live",
        freshness: env["TWELVE_DATA_FRESHNESS"] === "LIVE" ? "LIVE" : "DELAYED",
      });
    },
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
    verification: "FIXTURE_TESTED",
    blockedBy: BLOCKED_BY_ACCESS,
    apiKeyEnvVar: "MASSIVE_API_KEY",
    documentationUrl: "https://massive.com/docs/websocket/stocks/overview",
    create: (env) => {
      const apiKey = env["MASSIVE_API_KEY"];
      // Massive n'expose aucun mode démo public : sans clé, rien à instancier.
      if (apiKey === undefined) return null;
      return createMassiveProvider({
        apiKey,
        freshness: env["MASSIVE_FRESHNESS"] === "LIVE" ? "LIVE" : "DELAYED",
      });
    },
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
    verification: "FIXTURE_TESTED",
    blockedBy: BLOCKED_BY_ACCESS,
    apiKeyEnvVar: "EODHD_API_KEY",
    documentationUrl: "https://eodhd.com/financial-apis/search-api-for-stocks-etfs-mutual-funds",
    create: (env) => {
      const apiToken = env["EODHD_API_KEY"];
      /*
       * `demo` est la clé publique officielle d'EODHD, limitée à quelques
       * symboles. Elle ne donne pas accès à la recherche : l'adaptateur le
       * déclare dans ses capacités plutôt que d'échouer à l'appel.
       */
      return createEodhdProvider({
        apiToken: apiToken ?? "demo",
        mode: apiToken === undefined ? "demo" : "live",
      });
    },
  },
  {
    id: "coingecko",
    label: "CoinGecko",
    capabilities: UNMEASURED_CAPABILITIES({
      assetTypes: ["CRYPTO"],
      searchByText: true,
      history: true,
    }),
    verification: "FIXTURE_TESTED",
    blockedBy: BLOCKED_BY_ACCESS,
    apiKeyEnvVar: "COINGECKO_API_KEY",
    documentationUrl: "https://docs.coingecko.com/",
    create: (env) => {
      /*
       * CoinGecko sert un accès sans clé, plafonné en cadence. C'est le seul
       * fournisseur de cette liste qui peut être interrogé réellement sans
       * inscription — ce qui en fait le meilleur candidat pour prouver le
       * transport dès que l'accès réseau existe.
       */
      const apiKey = env["COINGECKO_API_KEY"];
      return createCoinGeckoProvider(
        apiKey === undefined ? { mode: "keyless" } : { mode: "demo", apiKey },
      );
    },
  },
  {
    id: "finnhub",
    label: "Finnhub",
    capabilities: UNMEASURED_CAPABILITIES({
      /*
       * Actions et ETF américains seulement. Le plan gratuit ne sert ni les
       * fonds de placement, ni les options, ni les places suisses et
       * européennes en temps réel : les déclarer enverrait le routeur chez un
       * fournisseur qui échouerait à chaque appel.
       */
      assetTypes: ["STOCK", "ETF"],
      searchByText: true,
      history: false,
      streaming: false,
      bestFreshness: "DELAYED",
    }),
    verification: "FIXTURE_TESTED",
    blockedBy: BLOCKED_BY_ACCESS,
    apiKeyEnvVar: "FINNHUB_API_KEY",
    documentationUrl: "https://finnhub.io/docs/api",
    create: (env) => {
      const apiKey = env["FINNHUB_API_KEY"];
      if (apiKey === undefined || apiKey.trim() === "") return null;
      /*
       * Le plan vient de la configuration, jamais de la présence d'une clé :
       * une clé gratuite et une clé payante se ressemblent trait pour trait,
       * et en déduire « temps réel » afficherait « en direct » sur du différé.
       */
      const plan = env["FINNHUB_PLAN"] === "paid" ? "paid" : "free";
      const declaredDelay = Number(env["FINNHUB_DELAY_MINUTES"]);
      return createFinnhubProvider({
        apiKey,
        plan,
        delayMinutes: Number.isFinite(declaredDelay) && declaredDelay > 0 ? declaredDelay : null,
      });
    },
  },
  {
    id: "finra",
    label: "FINRA TRACE",
    capabilities: UNMEASURED_CAPABILITIES({
      assetTypes: ["BOND"],
      // TRACE publie des transactions déclarées, pas un flux ni un carnet.
      bestFreshness: "EOD",
    }),
    verification: "FIXTURE_TESTED",
    blockedBy:
      "Le module finra-trace sait normaliser une transaction TRACE et en déduire " +
      "une fraîcheur, mais il n'existe ni client HTTP ni entrée de routeur pour " +
      "aller la chercher : ce sont des fonctions, pas un fournisseur. " +
      NOT_IMPLEMENTED,
    apiKeyEnvVar: "FINRA_API_KEY",
    documentationUrl: "https://www.finra.org/finra-data/browse-catalog/fixed-income",
    create: () => null,
  },
  {
    id: "alphavantage",
    label: "Alpha Vantage",
    capabilities: UNMEASURED_CAPABILITIES({
      assetTypes: ["STOCK", "ETF"],
      searchByText: true,
      fx: true,
      history: true,
    }),
    verification: "UNVERIFIED",
    blockedBy: NOT_IMPLEMENTED,
    apiKeyEnvVar: "ALPHAVANTAGE_API_KEY",
    documentationUrl: "https://www.alphavantage.co/documentation/",
    create: () => null,
  },
  {
    id: "factset",
    label: "FactSet",
    capabilities: UNMEASURED_CAPABILITIES({
      assetTypes: ["STOCK", "ETF", "MUTUAL_FUND", "OPTION", "BOND"],
      searchByText: true,
      searchByIsin: true,
      optionChains: true,
      fx: true,
      history: true,
    }),
    verification: "UNVERIFIED",
    blockedBy:
      "Offre institutionnelle : l'accès se négocie, il ne s'obtient pas par " +
      "inscription. " + NOT_IMPLEMENTED,
    apiKeyEnvVar: "FACTSET_API_KEY",
    documentationUrl: "https://developer.factset.com/",
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
