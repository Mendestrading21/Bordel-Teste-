import { redactSecrets } from "./config.js";

const LEVEL_ORDER = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export type LogLevel = keyof typeof LEVEL_ORDER;

export type LogSink = (line: string) => void;

/**
 * Journal structuré expurgé.
 *
 * Toute la sortie passe par `redactSecrets` : une clé fournisseur ne peut pas
 * atteindre stdout, même recopiée dans un message d'erreur amont.
 */
export function createLogger(
  level: LogLevel,
  sink: LogSink = (line) => process.stdout.write(`${line}\n`),
  now: () => Date = () => new Date(),
) {
  const threshold = LEVEL_ORDER[level];

  function emit(
    entryLevel: LogLevel,
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ) {
    if (LEVEL_ORDER[entryLevel] < threshold) {
      return;
    }
    const payload = {
      ts: now().toISOString(),
      level: entryLevel,
      message,
      ...(context ?? {}),
    };
    sink(redactSecrets(JSON.stringify(payload)));
  }

  return {
    debug: (message: string, context?: Readonly<Record<string, unknown>>) =>
      emit("debug", message, context),
    info: (message: string, context?: Readonly<Record<string, unknown>>) =>
      emit("info", message, context),
    warn: (message: string, context?: Readonly<Record<string, unknown>>) =>
      emit("warn", message, context),
    error: (message: string, context?: Readonly<Record<string, unknown>>) =>
      emit("error", message, context),
  };
}

export type Logger = ReturnType<typeof createLogger>;
