import { z } from "zod";

/**
 * Protocole du canal temps réel entre la PWA et la passerelle.
 *
 * Les deux sens sont validés par Zod. Valider ce que le **serveur** envoie peut
 * sembler superflu, mais c'est ce qui garantit qu'une évolution de la passerelle
 * ne peut pas injecter silencieusement une forme inattendue dans le calcul de
 * valorisation du client.
 */

/** Messages du client vers la passerelle. */
export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscribe"),
    /**
     * Liste **complète** des symboles voulus, pas un différentiel.
     *
     * Déclaratif et idempotent : un client qui se reconnecte retrouve le bon
     * état sans rejouer une séquence d'ajouts et de retraits.
     */
    symbols: z.array(z.string().min(1).max(64)).max(500),
  }),
  z.object({ type: z.literal("ping") }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/);

const quoteSchema = z.object({
  instrumentId: z.string(),
  provider: z.string(),
  providerSymbol: z.string(),
  currency: z.string().length(3),
  price: decimalString,
  priceType: z.enum(["LAST_TRADE", "MID", "BID", "ASK", "PREVIOUS_CLOSE", "NAV", "MANUAL"]),
  freshness: z.enum(["LIVE", "DELAYED", "EOD", "NAV", "MANUAL", "STALE", "UNAVAILABLE"]),
  asOf: z.string(),
  receivedAt: z.string(),
  bid: decimalString.optional(),
  ask: decimalString.optional(),
  previousClose: decimalString.optional(),
  marketState: z.enum(["PRE", "OPEN", "AFTER", "CLOSED", "UNKNOWN"]).optional(),
});

/** Messages de la passerelle vers le client. */
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("welcome"),
    /** Fournisseur réellement actif, affiché tel quel dans l'interface. */
    provider: z.string(),
    /**
     * Meilleure fraîcheur que ce fournisseur peut servir.
     *
     * Transmise dès la connexion pour que l'interface n'annonce jamais mieux
     * que ce qui est réellement disponible.
     */
    bestFreshness: z.enum(["LIVE", "DELAYED", "EOD", "NAV", "MANUAL", "STALE", "UNAVAILABLE"]),
  }),
  z.object({ type: z.literal("quotes"), quotes: z.array(quoteSchema) }),
  z.object({ type: z.literal("pong") }),
  z.object({
    type: z.literal("error"),
    code: z.enum(["UNAUTHORIZED", "MALFORMED", "RATE_LIMITED", "PROVIDER_DOWN"]),
    /** Message destiné à l'utilisateur, sans détail interne ni secret. */
    message: z.string(),
  }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

/** Intervalle de heartbeat, en millisecondes. */
export const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * Délai au-delà duquel une connexion sans réponse est considérée morte.
 *
 * Deux intervalles de heartbeat plus une marge : un seul intervalle fermerait
 * la connexion au moindre à-coup réseau.
 */
export const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 2 + 5_000;

/**
 * Fenêtre de regroupement des ticks avant diffusion, en millisecondes.
 *
 * Sans ce regroupement, un instrument très actif enverrait des dizaines de
 * messages par seconde à un téléphone, pour un affichage arrondi au centime qui
 * ne change pas visiblement.
 */
export const BROADCAST_THROTTLE_MS = 250;

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = clientMessageSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    // Un message illisible est rejeté sans détail : renvoyer l'erreur de
    // parsing exposerait la structure interne attendue.
    return null;
  }
}
