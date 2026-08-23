import { readSupabaseConfig, type EnvRecord } from "./config";
import { resolveSessionState, type SessionState } from "./session";

/**
 * État de session résolu côté serveur.
 *
 * Tant que Supabase n'est pas configuré — l'état du dépôt aujourd'hui —, la
 * fonction renvoie `unconfigured`. Elle ne fabrique jamais une session fictive
 * pour « faire tourner » l'interface : un écran qui prétendrait afficher un
 * portefeuille sans utilisateur authentifié serait exactement le genre de
 * fausse donnée que le produit interdit.
 *
 * La lecture réelle du cookie de session Supabase est branchée ici au moment où
 * un projet existe ; la forme du résultat, elle, est déjà figée et testée.
 */
export function getServerSessionState(env: EnvRecord = process.env): SessionState {
  const configuration = readSupabaseConfig(env);

  if (!configuration.configured) {
    return resolveSessionState(null, { configured: false, reason: configuration.reason });
  }

  // Aucun cookie n'est lu tant que le flux d'authentification n'est pas
  // branché : l'état honnête est « anonyme », pas « authentifié ».
  return resolveSessionState(null, { configured: true });
}
