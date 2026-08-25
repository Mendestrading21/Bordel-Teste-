"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  BASE_INTERVAL_MS,
  mergeQuotes,
  nextDelayMs,
  shouldPoll,
  type LiveQuoteRecord,
  type RefreshState,
} from "./refresh-policy";

/**
 * Scrutation des cours par REST.
 *
 * Complément du canal WebSocket, pas son remplaçant. Les fournisseurs
 * accessibles sans abonnement servent du REST : sans cette scrutation, leurs
 * cours n'atteignent jamais l'écran.
 *
 * Le hook n'envoie **aucun identifiant** : le serveur dérive la liste des
 * instruments du portefeuille de la session. Le navigateur ne connaît donc
 * jamais de clé fournisseur, et ne peut pas servir de sonde.
 *
 * Toute la logique de décision vit dans `refresh-policy`, testée à part.
 */

export type UseQuoteRefreshResult = {
  readonly quotes: ReadonlyMap<string, LiveQuoteRecord>;
  readonly state: RefreshState;
  /** Déclenche une campagne immédiate, hors cadence. */
  readonly refreshNow: () => void;
};

type QuotesPayload = {
  status?: unknown;
  reason?: unknown;
  refreshedAt?: unknown;
  providers?: unknown;
  quotes?: unknown;
  unquoted?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Ne garde que les cours dont **tous** les champs affichés sont présents. */
function parseQuotes(value: unknown): readonly LiveQuoteRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is LiveQuoteRecord => {
    if (!isRecord(entry)) return false;
    return (
      typeof entry["instrumentId"] === "string" &&
      typeof entry["price"] === "string" &&
      typeof entry["currency"] === "string" &&
      typeof entry["freshness"] === "string" &&
      typeof entry["asOf"] === "string" &&
      typeof entry["provider"] === "string"
    );
  });
}

function parseUnquoted(value: unknown): readonly { instrumentId: string; reason: string }[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is { instrumentId: string; reason: string } => {
    if (!isRecord(entry)) return false;
    return typeof entry["instrumentId"] === "string" && typeof entry["reason"] === "string";
  });
}

export function useQuoteRefresh(
  options: Readonly<{ intervalMs?: number; enabled?: boolean }> = {},
): UseQuoteRefreshResult {
  const intervalMs = options.intervalMs ?? BASE_INTERVAL_MS;
  const enabled = options.enabled ?? true;

  const [quotes, setQuotes] = useState<ReadonlyMap<string, LiveQuoteRecord>>(new Map());
  const [state, setState] = useState<RefreshState>({ status: "idle" });

  const failuresRef = useRef(0);
  const inFlightRef = useRef(false);
  const stateRef = useRef<RefreshState>(state);
  stateRef.current = state;

  const runRefresh = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return;

    const conditions = {
      documentVisible: document.visibilityState === "visible",
      online: navigator.onLine,
      state: stateRef.current,
    };
    if (!shouldPoll(conditions)) return;

    inFlightRef.current = true;
    setState({ status: "refreshing" });

    try {
      const response = await fetch("/api/quotes", { method: "POST" });

      if (!response.ok) {
        failuresRef.current += 1;
        /*
         * Le corps de la réponse n'est pas affiché tel quel : il vient du
         * serveur, mais rien ne garantit qu'un intermédiaire ne l'a pas
         * remplacé par une page d'erreur bavarde.
         */
        setState({
          status: "failed",
          reason:
            response.status === 429
              ? "Trop de rafraîchissements. Les cours reprendront dans un instant."
              : "Les cours n'ont pas pu être rafraîchis. Les valeurs affichées sont les dernières connues.",
        });
        return;
      }

      const payload = (await response.json()) as QuotesPayload;

      if (payload.status === "disabled") {
        failuresRef.current = 0;
        setState({
          status: "disabled",
          reason:
            typeof payload.reason === "string"
              ? payload.reason
              : "Aucun fournisseur de cours n'est configuré.",
        });
        return;
      }

      failuresRef.current = 0;
      const received = parseQuotes(payload.quotes);
      setQuotes((previous) => mergeQuotes(previous, received));
      setState({
        status: "ok",
        refreshedAt:
          typeof payload.refreshedAt === "string"
            ? payload.refreshedAt
            : new Date().toISOString(),
        providers: Array.isArray(payload.providers)
          ? payload.providers.filter((entry): entry is string => typeof entry === "string")
          : [],
        quoted: received.length,
        unquoted: parseUnquoted(payload.unquoted),
      });
    } catch {
      failuresRef.current += 1;
      // Les cours déjà reçus ne sont pas effacés : ils restent affichés avec
      // leur horodatage, ce qui est l'état réel des connaissances.
      setState({ status: "failed", reason: "Serveur injoignable pour le rafraîchissement." });
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const refreshNow = useCallback(() => {
    void runRefresh();
  }, [runRefresh]);

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const schedule = (): void => {
      if (cancelled) return;
      timer = setTimeout(() => {
        void runRefresh().finally(schedule);
      }, nextDelayMs(failuresRef.current, intervalMs));
    };

    // Une première campagne immédiate : attendre une minute avant d'afficher
    // le moindre cours ferait passer l'écran pour figé.
    void runRefresh().finally(schedule);

    /*
     * Retour au premier plan : campagne immédiate. Un onglet rouvert après une
     * heure afficherait sinon des cours d'il y a une heure jusqu'au prochain
     * tour de cadence, sans que rien ne le signale.
     */
    const onVisible = (): void => {
      if (document.visibilityState === "visible") void runRefresh();
    };
    const onOnline = (): void => void runRefresh();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, intervalMs, runRefresh]);

  return { quotes, state, refreshNow };
}
