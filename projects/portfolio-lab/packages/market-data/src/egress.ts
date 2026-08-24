/**
 * Détection d'un blocage réseau en amont du fournisseur.
 *
 * Un environnement d'exécution à liste blanche répond lui-même `403` sur les
 * hôtes non autorisés, avec son propre corps de réponse. Vu depuis
 * l'adaptateur, c'est indiscernable d'un `403` du fournisseur : les deux
 * deviennent `UNAUTHORIZED`, et le rapport conclut « clé refusée » alors que la
 * requête n'a jamais quitté la machine.
 *
 * La confusion coûte cher : on cherche une clé, on en régénère une, on relit la
 * documentation du fournisseur — pour un problème qui est ailleurs. Le corps de
 * la réponse, lui, tranche.
 */
const GATEWAY_SIGNATURES: readonly RegExp[] = [
  /not in allowlist/i,
  /network egress/i,
  /egress settings/i,
  /blocked by (?:proxy|policy)/i,
  /forbidden by proxy/i,
  /proxy authentication required/i,
  /CONNECT tunnel failed/i,
  /ENOTFOUND/,
  /EAI_AGAIN/,
  /ECONNREFUSED/,
];

/**
 * `true` si le message décrit un blocage réseau plutôt qu'un refus fournisseur.
 *
 * Volontairement conservateur : en cas de doute, on laisse le diagnostic
 * d'origine. Annoncer à tort « réseau bloqué » masquerait une vraie clé
 * invalide, ce qui est la symétrie exacte du problème qu'on corrige.
 */
export function isEgressBlocked(message: string): boolean {
  return GATEWAY_SIGNATURES.some((pattern) => pattern.test(message));
}
