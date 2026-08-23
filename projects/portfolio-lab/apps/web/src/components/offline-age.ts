/**
 * Âge d'une donnée, en texte lisible.
 *
 * Sans fausse précision : sous la minute, on ne prétend pas compter les
 * secondes. L'arrondi est vers le bas — annoncer une donnée plus jeune qu'elle
 * ne l'est risquerait de rassurer à tort, mais annoncer plus vieux ferait
 * douter d'une donnée fraîche, ce qui est le travers le plus fréquent.
 */
export function describeAge(renderedAt: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - renderedAt.getTime()) / 60_000);

  if (minutes < 1) {
    return "il y a moins d'une minute";
  }
  if (minutes < 60) {
    return `il y a ${minutes} minute${minutes > 1 ? "s" : ""}`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `il y a ${hours} heure${hours > 1 ? "s" : ""}`;
  }

  const days = Math.floor(hours / 24);
  return `il y a ${days} jour${days > 1 ? "s" : ""}`;
}
