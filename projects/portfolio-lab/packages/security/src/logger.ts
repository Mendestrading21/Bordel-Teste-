import { redactContext, redactSecrets, shortenIdentifiers, type LogValue } from "./redaction.js";

const LEVEL_ORDER = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export type LogLevel = keyof typeof LEVEL_ORDER;

export type LogSink = (line: string) => void;

export type LogContext = Readonly<Record<string, LogValue>>;

export type Logger = {
  readonly debug: (message: string, context?: LogContext) => void;
  readonly info: (message: string, context?: LogContext) => void;
  readonly warn: (message: string, context?: LogContext) => void;
  readonly error: (message: string, context?: LogContext) => void;
};

/**
 * Journal structuré expurgé.
 *
 * Le contexte n'accepte que des valeurs **primitives**. Ce n'est pas une
 * limitation d'implémentation : accepter un objet arbitraire — une position,
 * une valorisation, une réponse fournisseur — reviendrait à journaliser tout ce
 * qu'il contient, et c'est précisément par là qu'un patrimoine finit dans un
 * fichier de log. L'appelant doit choisir explicitement chaque champ.
 *
 * Le message et le contexte passent tous deux par l'expurgation, y compris la
 * sortie sérialisée : une valeur reçue d'un fournisseur peut contenir une clé
 * sans qu'aucun nom de champ ne le signale.
 */
export function createLogger(
  level: LogLevel,
  sink: LogSink = (line) => process.stdout.write(`${line}\n`),
  now: () => Date = () => new Date(),
  env: Readonly<Record<string, string | undefined>> = process.env,
): Logger {
  const threshold = LEVEL_ORDER[level];

  function emit(entryLevel: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_ORDER[entryLevel] < threshold) {
      return;
    }

    const payload = {
      ts: now().toISOString(),
      level: entryLevel,
      message: shortenIdentifiers(redactSecrets(message, env)),
      ...redactContext(context ?? {}, env),
    };

    // Seconde passe sur la chaîne complète : le message et les valeurs sont
    // déjà expurgés, mais un nom de champ pourrait lui-même contenir un secret.
    sink(redactSecrets(JSON.stringify(payload), env));
  }

  return {
    debug: (message, context) => emit("debug", message, context),
    info: (message, context) => emit("info", message, context),
    warn: (message, context) => emit("warn", message, context),
    error: (message, context) => emit("error", message, context),
  };
}
