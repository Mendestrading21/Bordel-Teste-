/**
 * Remplaçant de `server-only` sous Vitest.
 *
 * Le vrai marqueur **lève** dès qu'il est chargé sans la condition d'export
 * `react-server`, que Vitest ne pose pas. Il rendait donc intestable tout
 * module serveur de l'application — routes, service de cours, accès base —
 * c'est-à-dire précisément le code qui parle au réseau et à la session.
 *
 * Ce fichier ne fait rien, exactement comme le `empty.js` que reçoit un
 * composant serveur. La garantie n'est pas affaiblie : c'est Next, au moment du
 * bundle, qui reste seul juge de ce qui part au navigateur, et il utilise le
 * vrai paquet.
 */
export {};
