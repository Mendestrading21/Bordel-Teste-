import { describeAge } from "./offline-age";

/**
 * Bandeau « hors ligne ».
 *
 * C'est la pièce qui rend le cache honnête : le service worker sert la dernière
 * page connue quand le réseau manque, et sans ce bandeau l'utilisateur lirait
 * un patrimoine daté en croyant le voir à l'instant.
 *
 * **Il est rendu côté serveur et masqué par CSS**, jamais monté par JavaScript.
 *
 * Une première version en dépendait : elle montait le bandeau depuis un effet
 * client, après hydratation. Or une page servie hors ligne est exactement la
 * situation où l'hydratation peut ne pas aboutir — un chunk absent du cache
 * suffit. Le bandeau disparaissait alors précisément quand il était nécessaire,
 * et la page se présentait comme à jour. Faire dépendre l'avertissement du
 * succès du JavaScript revenait à ne pas l'avoir.
 *
 * Deux sources indépendantes lèvent l'attribut `data-pl-offline` sur `<html>` :
 *
 * 1. **le service worker**, qui l'inscrit dans le HTML qu'il sert depuis son
 *    cache — aucun JavaScript de page n'intervient ;
 * 2. **le veilleur client**, pour la coupure qui survient alors que la page est
 *    déjà ouverte. Celui-là est une amélioration, pas la garantie.
 */

/** Horodatage absolu, lisible sans JavaScript. */
function formatAbsolute(renderedAt: string): string {
  return new Intl.DateTimeFormat("fr-CH", {
    timeZone: "Europe/Zurich",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(renderedAt));
}

export function OfflineNotice({
  renderedAt,
  now = new Date(),
}: Readonly<{ renderedAt: string; now?: Date }>): React.JSX.Element {
  return (
    <div
      className="pl-offline mb-4 rounded-token-md border border-warning/50 bg-surface px-4 py-3"
      role="status"
      aria-live="polite"
    >
      <p className="text-xs font-semibold tracking-wide text-warning uppercase">Hors ligne</p>
      <p className="mt-1 text-sm text-secondary">
        Les chiffres affichés proviennent de votre dernière connexion, le{" "}
        <time dateTime={renderedAt} className="pl-numeric">
          {formatAbsolute(renderedAt)}
        </time>{" "}
        (<span data-pl-age>{describeAge(new Date(renderedAt), now)}</span>). Aucun cours n&apos;a
        été récupéré depuis, et aucune modification ne peut être enregistrée tant que la connexion
        n&apos;est pas rétablie.
      </p>
    </div>
  );
}
