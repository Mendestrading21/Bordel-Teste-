"use client";

import { useEffect, useRef, useState } from "react";

import {
  parseServerMessage,
  tokenProtocol,
  type LiveConnectionState,
  type LiveQuote,
} from "./client-protocol";

/**
 * Abonnement aux cours temps réel.
 *
 * Le hook demande un jeton à son propre backend, ouvre la socket, s'abonne et
 * gère la reconnexion. Le navigateur ne manipule jamais de clé fournisseur :
 * seulement un jeton nominatif de cinq minutes.
 *
 * Il ne reçoit **aucune liste de symboles**. Le serveur dérive le périmètre du
 * portefeuille, le scelle dans le jeton et le renvoie avec l'instrument que
 * chaque symbole désigne. Accepter une liste de l'appelant rouvrirait
 * exactement ce que le périmètre a fermé : un client capable de demander
 * n'importe quel cours sur la clé de l'exploitant.
 */

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const MAX_ATTEMPTS = 8;

export type UseLiveQuotesResult = {
  /** Cours reçus, indexés par **identifiant d'instrument**, pas par symbole. */
  readonly quotes: ReadonlyMap<string, LiveQuote>;
  readonly connection: LiveConnectionState;
};

/** Un symbole suivi, et la ligne qu'il alimente. */
type Subscription = { readonly symbol: string; readonly instrumentId: string };

function parseSubscriptions(value: unknown): readonly Subscription[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Subscription => {
    if (typeof entry !== "object" || entry === null) return false;
    const record = entry as Record<string, unknown>;
    return typeof record["symbol"] === "string" && typeof record["instrumentId"] === "string";
  });
}

/**
 * Délai avant la tentative `attempt`, avec gigue.
 *
 * Même raisonnement que côté passerelle : sans gigue, tous les onglets ouverts
 * se reconnectent au même instant après une coupure.
 */
function reconnectDelay(attempt: number): number {
  const exponential = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_MAX_MS);
  return Math.round(exponential * (0.5 + Math.random() * 0.5));
}

export function useLiveQuotes(): UseLiveQuotesResult {
  const [quotes, setQuotes] = useState<ReadonlyMap<string, LiveQuote>>(new Map());
  const [connection, setConnection] = useState<LiveConnectionState>({ status: "connecting" });

  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const closedRef = useRef(false);

  useEffect(() => {
    closedRef.current = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    async function connect(): Promise<void> {
      if (closedRef.current) {
        return;
      }

      let token: string;
      let subscriptions: readonly Subscription[];
      try {
        const response = await fetch("/api/live-token", { method: "POST" });
        if (!response.ok) {
          const reason =
            response.status === 503
              ? "Le canal temps réel n'est pas configuré sur ce serveur."
              : "Session requise pour recevoir les cours en direct.";
          setConnection({ status: "disabled", reason });
          return;
        }
        const payload = (await response.json()) as { token?: unknown; subscriptions?: unknown };
        if (typeof payload.token !== "string") {
          setConnection({ status: "failed", reason: "Jeton de canal invalide." });
          return;
        }
        token = payload.token;
        subscriptions = parseSubscriptions(payload.subscriptions);

        /*
         * Aucun instrument suivable : c'est un état normal — un portefeuille
         * dont aucune ligne ne porte d'identifiant — et non une panne. Ouvrir
         * la socket pour ne s'abonner à rien laisserait une connexion inutile
         * et un indicateur qui promettrait un flux inexistant.
         */
        if (subscriptions.length === 0) {
          setConnection({
            status: "disabled",
            reason: "Aucun instrument identifié : rien à suivre en direct.",
          });
          return;
        }
      } catch {
        setConnection({ status: "failed", reason: "Impossible de joindre le serveur." });
        return;
      }

      if (closedRef.current) {
        return;
      }

      const bySymbol = new Map(subscriptions.map((entry) => [entry.symbol, entry.instrumentId]));

      const url = new URL("/live", window.location.origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

      const socket = new WebSocket(url, [tokenProtocol(token)]);
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        // Liste complète et non différentielle : une reconnexion retrouve le
        // bon état sans rejouer de séquence.
        socket.send(
          JSON.stringify({ type: "subscribe", symbols: subscriptions.map((entry) => entry.symbol) }),
        );
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        const message = parseServerMessage(event.data);
        if (message === null) {
          return;
        }

        switch (message.type) {
          case "welcome":
            setConnection({
              status: "open",
              provider: message.provider,
              bestFreshness: message.bestFreshness,
            });
            break;
          case "quotes":
            setQuotes((previous) => {
              const next = new Map(previous);
              for (const quote of message.quotes) {
                /*
                 * Le flux ne connaît que des symboles ; l'écran ne connaît que
                 * des instruments. Un cours dont le symbole n'a pas été
                 * demandé est ignoré : la passerelle ne devrait pas en envoyer,
                 * et l'attribuer au hasard vaudrait pire que de le perdre.
                 */
                const target = bySymbol.get(quote.providerSymbol);
                if (target === undefined) continue;
                next.set(target, quote);
              }
              return next;
            });
            break;
          case "error":
            // Une erreur du canal n'efface pas les cours déjà reçus : les
            // derniers connus restent affichés, avec leur fraîcheur.
            setConnection({ status: "failed", reason: message.message });
            break;
          case "pong":
            break;
        }
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (closedRef.current) {
          return;
        }

        attemptRef.current += 1;
        if (attemptRef.current > MAX_ATTEMPTS) {
          setConnection({
            status: "failed",
            reason:
              "Connexion aux cours interrompue. Les valeurs affichées sont les dernières connues.",
          });
          return;
        }

        setConnection({ status: "reconnecting", attempt: attemptRef.current });
        reconnectTimer = setTimeout(() => void connect(), reconnectDelay(attemptRef.current));
      };

      socket.onerror = () => {
        // `onclose` suit systématiquement : c'est là que la reconnexion est
        // décidée, pour ne pas la déclencher deux fois.
      };
    }

    void connect();

    return () => {
      closedRef.current = true;
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
    // Aucune dépendance : le périmètre vient du serveur, pas de l'appelant.
  }, []);

  return { quotes, connection };
}
