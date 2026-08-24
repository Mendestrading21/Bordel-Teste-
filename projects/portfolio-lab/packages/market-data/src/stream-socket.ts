/**
 * Socket minimal dont les adaptateurs de flux ont besoin.
 *
 * Volontairement plus étroit que `WebSocket` : le paquet `market-data` ne
 * dépend d'aucune implémentation — ni `ws`, ni le `WebSocket` du navigateur —
 * et les tests fournissent un faux socket sans ouvrir de port. C'est ce qui
 * permet de vérifier abonnement, désabonnement, battement de cœur et
 * traitement des ticks dans la suite unitaire, qui ne sort jamais sur le
 * réseau.
 *
 * L'application décide de l'implémentation réelle et la passe par
 * `socketFactory`. Un adaptateur sans fabrique annonce `streaming: false` :
 * mieux vaut ne rien promettre que promettre un flux que rien ne sait ouvrir.
 */
export type StreamSocket = {
  send(data: string): void;
  close(): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "open" | "error" | "close", listener: () => void): void;
};

export type StreamSocketFactory = (url: string) => StreamSocket;

/**
 * Décode un message reçu, quelle qu'en soit la forme.
 *
 * Un message non-JSON n'est pas une panne : les fournisseurs envoient des
 * textes de statut et des battements. Renvoyer `null` laisse l'appelant les
 * ignorer sans rompre la connexion.
 */
export function decodeStreamMessage(data: unknown): unknown {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
