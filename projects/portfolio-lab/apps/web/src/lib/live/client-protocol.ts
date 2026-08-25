/**
 * Vue client du protocole temps réel.
 *
 * Volontairement dupliquée depuis la passerelle plutôt qu'importée : le
 * navigateur ne doit charger ni `ws`, ni `node:crypto`, ni quoi que ce soit
 * du processus serveur. Un test vérifie que les deux définitions restent
 * alignées.
 */

/**
 * Fraîcheurs que l'interface sait représenter.
 *
 * Reprises du domaine plutôt que déclarées en `string`. Une valeur inconnue
 * arrivant du fil traversait jusqu'au badge, qui s'en sert pour indexer sa
 * table de tons : la pastille sortait sans couleur et sans libellé, sur un
 * cours par ailleurs affiché comme n'importe quel autre.
 */
export const LIVE_FRESHNESS = [
  "LIVE",
  "DELAYED",
  "EOD",
  "NAV",
  "MANUAL",
  "STALE",
  "UNAVAILABLE",
] as const;

export type LiveFreshness = (typeof LIVE_FRESHNESS)[number];

export type LiveQuote = {
  readonly instrumentId: string;
  readonly provider: string;
  readonly providerSymbol: string;
  readonly currency: string;
  readonly price: string;
  readonly priceType: string;
  readonly freshness: LiveFreshness;
  readonly asOf: string;
  readonly receivedAt: string;
  readonly bid?: string;
  readonly ask?: string;
  readonly previousClose?: string;
};

export type LiveServerMessage =
  | { readonly type: "welcome"; readonly provider: string; readonly bestFreshness: string }
  | { readonly type: "quotes"; readonly quotes: readonly LiveQuote[] }
  | { readonly type: "pong" }
  | { readonly type: "error"; readonly code: string; readonly message: string };

/** État de la connexion, tel que l'interface doit le représenter. */
export type LiveConnectionState =
  | { readonly status: "disabled"; readonly reason: string }
  | { readonly status: "connecting" }
  | { readonly status: "open"; readonly provider: string; readonly bestFreshness: string }
  | { readonly status: "reconnecting"; readonly attempt: number }
  | { readonly status: "failed"; readonly reason: string };

/**
 * Analyse un message reçu de la passerelle.
 *
 * Le client valide ce que le serveur envoie : une évolution de la passerelle ne
 * doit pas pouvoir injecter silencieusement une forme inattendue dans le calcul
 * de valorisation affiché.
 */
export function parseServerMessage(raw: string): LiveServerMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
    return null;
  }

  const message = parsed as Record<string, unknown>;

  switch (message["type"]) {
    case "welcome":
      return typeof message["provider"] === "string" && typeof message["bestFreshness"] === "string"
        ? {
            type: "welcome",
            provider: message["provider"],
            bestFreshness: message["bestFreshness"],
          }
        : null;

    case "quotes": {
      if (!Array.isArray(message["quotes"])) {
        return null;
      }
      const quotes = message["quotes"].filter(isLiveQuote);
      // Un message dont *aucune* quote n'est valide est rejeté ; un message
      // partiellement valide conserve ce qui l'est, plutôt que de tout perdre
      // pour une ligne mal formée.
      return quotes.length === 0 ? null : { type: "quotes", quotes };
    }

    case "pong":
      return { type: "pong" };

    case "error":
      return typeof message["code"] === "string" && typeof message["message"] === "string"
        ? { type: "error", code: message["code"], message: message["message"] }
        : null;

    default:
      return null;
  }
}

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

function isLiveQuote(value: unknown): value is LiveQuote {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const quote = value as Record<string, unknown>;
  return (
    typeof quote["providerSymbol"] === "string" &&
    typeof quote["price"] === "string" &&
    // Un prix qui n'est pas une décimale exacte ne doit jamais entrer dans le
    // moteur de valorisation.
    DECIMAL_PATTERN.test(quote["price"]) &&
    typeof quote["currency"] === "string" &&
    /*
     * Une fraîcheur que l'interface ne sait pas représenter fait rejeter la
     * cotation entière. Un cours dont on ne peut pas caractériser l'âge ne doit
     * pas s'afficher comme les autres : il paraîtrait aussi sûr qu'eux.
     */
    LIVE_FRESHNESS.includes(quote["freshness"] as LiveFreshness) &&
    typeof quote["asOf"] === "string"
  );
}

/** Sous-protocole portant le jeton, aligné sur la passerelle. */
export function tokenProtocol(token: string): string {
  return `portfolio-lab.token.${token}`;
}
