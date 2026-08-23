/*
 * Journal de la passerelle.
 *
 * L'implémentation est partagée avec l'application web
 * (`@portfolio-lab/security`) : deux journaux avec deux règles d'expurgation
 * différentes finiraient par ne pas protéger les mêmes choses, et le plus
 * permissif des deux déciderait de ce qui fuit.
 */
export { createLogger, type Logger, type LogLevel, type LogSink } from "@portfolio-lab/security";
