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
 */

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const MAX_ATTEMPTS = 8;

export type UseLiveQuotesResult = {
  readonly quotes: ReadonlyMap<string, LiveQuote>;
  readonly connection: LiveConnectionState;
};

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

export function useLiveQuotes(symbols: readonly string[]): UseLiveQuotesResult {
  const [quotes, setQuotes] = useState<ReadonlyMap<string, LiveQuote>>(new Map());
  const [connection, setConnection] = useState<LiveConnectionState>({ status: "connecting" });

  /*
   * `symbols` est un nouveau tableau à chaque rendu du parent. Le sérialiser
   * donne une dépendance stable : sans cela, l'effet se relancerait à chaque
   * rendu et rouvrirait la socket en boucle.
   */
  const symbolKey = [...symbols].sort().join(",");

  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const closedRef = useRef(false);

  useEffect(() => {
    closedRef.current = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    if (symbolKey === "") {
      setConnection({ status: "disabled", reason: "Aucun instrument à suivre." });
      return;
    }

    async function connect(): Promise<void> {
      if (closedRef.current) {
        return;
      }

      let token: string;
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
        const payload = (await response.json()) as { token?: unknown };
        if (typeof payload.token !== "string") {
          setConnection({ status: "failed", reason: "Jeton de canal invalide." });
          return;
        }
        token = payload.token;
      } catch {
        setConnection({ status: "failed", reason: "Impossible de joindre le serveur." });
        return;
      }

      if (closedRef.current) {
        return;
      }

      const url = new URL("/live", window.location.origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

      const socket = new WebSocket(url, [tokenProtocol(token)]);
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        // Liste complète et non différentielle : une reconnexion retrouve le
        // bon état sans rejouer de séquence.
        socket.send(JSON.stringify({ type: "subscribe", symbols: symbolKey.split(",") }));
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
                next.set(quote.providerSymbol, quote);
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
  }, [symbolKey]);

  return { quotes, connection };
}
