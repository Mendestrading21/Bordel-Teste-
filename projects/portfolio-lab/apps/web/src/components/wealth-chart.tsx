import { formatMoney } from "@portfolio-lab/ui";
import type { CurrencyCode } from "@portfolio-lab/domain";
import type { HistoryBounds, WealthPoint } from "@portfolio-lab/portfolio-engine";

/**
 * Courbe du patrimoine.
 *
 * Le graphique est **doublé** d'un tableau de valeurs exactes, ouvert d'un
 * clic : une courbe seule communique une tendance mais aucun chiffre, et un
 * `aria-label` résumant « la courbe monte » ne remplace pas les montants.
 *
 * Le tracé est un simple SVG, sans dépendance : une bibliothèque de graphiques
 * apporterait ici des tooltips au survol — inutilisables au doigt — et du
 * canvas, invisible aux lecteurs d'écran.
 */

/** Dimensions du repère interne ; le SVG s'étire ensuite au conteneur. */
const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 160;
const PADDING_Y = 8;

/**
 * Locale des libellés de date.
 *
 * `NUMERIC_LOCALE` vaut `de-CH` — le bon choix pour les **nombres** suisses,
 * mais il rendrait « août » en « Aug. » au milieu d'une interface française.
 * Les chiffres et les mots ne suivent donc pas la même locale, et c'est
 * délibéré.
 */
const DATE_LOCALE = "fr-CH";

function formatDay(date: string): string {
  // Les dates arrivent en `AAAA-MM-JJ` ; le `T12:00` évite qu'un décalage de
  // fuseau ne recule l'affichage d'un jour.
  return new Intl.DateTimeFormat(DATE_LOCALE, { day: "2-digit", month: "short" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

/** Au-delà, les repères de mesure se chevauchent et sont masqués. */
const MARKER_LIMIT = 30;

const MS_PER_DAY = 86_400_000;

function dayNumber(date: string): number {
  return Date.parse(`${date}T12:00:00Z`) / MS_PER_DAY;
}

/**
 * Coordonnées du tracé.
 *
 * L'axe horizontal est **proportionnel aux dates**, jamais à l'index du point.
 * Espacer les points régulièrement ferait ressembler un trou de trois mois à
 * un intervalle d'un jour : la courbe donnerait à voir une progression
 * régulière là où l'historique est simplement lacunaire.
 *
 * Une série plate est centrée verticalement plutôt qu'écrasée en bas : sans
 * cela, `(valeur − min) / (max − min)` diviserait par zéro.
 */
type Coordinate = { readonly x: number; readonly y: number };

function coordinates(
  history: readonly WealthPoint[],
  bounds: HistoryBounds,
): readonly Coordinate[] {
  const min = Number(bounds.min);
  const max = Number(bounds.max);
  const span = max - min;
  const usable = VIEW_HEIGHT - PADDING_Y * 2;

  const firstDay = dayNumber(history[0]?.date ?? "1970-01-01");
  const lastDay = dayNumber(history[history.length - 1]?.date ?? "1970-01-01");
  const dayspan = lastDay - firstDay;

  return history.map((point) => {
    // Un point unique — ou plusieurs le même jour — est centré : diviser par
    // un intervalle nul produirait `NaN` dans les coordonnées.
    const x =
      dayspan === 0 ? VIEW_WIDTH / 2 : ((dayNumber(point.date) - firstDay) / dayspan) * VIEW_WIDTH;
    const ratio = bounds.flat ? 0.5 : (Number(point.marketValueBase) - min) / span;
    return { x, y: VIEW_HEIGHT - PADDING_Y - ratio * usable };
  });
}

export function WealthChart({
  history,
  bounds,
  currency,
}: Readonly<{
  history: readonly WealthPoint[];
  bounds: HistoryBounds;
  currency: CurrencyCode;
}>): React.JSX.Element {
  const first = history[0];
  const last = history[history.length - 1];
  const plot = coordinates(history, bounds);
  const summary =
    first === undefined || last === undefined
      ? "Historique vide."
      : `Patrimoine du ${formatDay(first.date)} au ${formatDay(last.date)} : ` +
        `de ${formatMoney(first.marketValueBase, currency)} à ` +
        `${formatMoney(last.marketValueBase, currency)}, ` +
        `entre ${formatMoney(bounds.min, currency)} et ${formatMoney(bounds.max, currency)}.`;

  return (
    <figure className="mt-3">
      {/*
       * Le SVG garde ses proportions (`preserveAspectRatio` par défaut).
       * Les étirer à la largeur du conteneur déformerait aussi les repères de
       * mesure en ovales, et `vector-effect: non-scaling-size` n'est pas
       * implémenté par les navigateurs.
       */}
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label={summary}
        className="h-auto w-full"
      >
        <polyline
          points={plot.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")}
          fill="none"
          stroke="var(--pl-accent-copper)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/*
         * Un repère par mesure réelle.
         *
         * Le segment entre deux points est une interpolation, pas une donnée :
         * marquer les mesures distingue ce qui a été calculé de ce qui n'est
         * que le trait qui les relie.
         *
         * Au-delà d'une trentaine de points, les repères se touchent et
         * épaississent la courbe sans plus rien distinguer : ils disparaissent
         * alors, la densité de la série jouant le même rôle.
         */}
        {plot.length > MARKER_LIMIT
          ? null
          : plot.map((point, index) => (
              <circle
                key={history[index]?.date ?? index}
                cx={point.x}
                cy={point.y}
                r={4}
                fill="var(--pl-accent-copper)"
              />
            ))}
      </svg>

      <figcaption className="mt-2 flex justify-between text-xs text-secondary">
        <span>{first === undefined ? "" : formatDay(first.date)}</span>
        <span>{last === undefined ? "" : formatDay(last.date)}</span>
      </figcaption>

      {/*
       * Le tableau porte les valeurs exactes, repliées par défaut pour ne pas
       * noyer l'écran mobile.
       *
       * Un `details` fermé est retiré de l'arbre d'accessibilité : le tableau
       * n'est donc lisible qu'une fois déplié, au clavier comme au doigt.
       * C'est pourquoi le résumé du graphique ci-dessus porte déjà les montants
       * de début, de fin et les bornes — l'information chiffrée essentielle est
       * annoncée sans qu'aucune interaction soit nécessaire.
       */}
      <details className="mt-3">
        <summary className="inline-flex min-h-[var(--pl-touch-target)] cursor-pointer items-center text-sm text-copper">
          Valeurs chiffrées ({history.length} point{history.length > 1 ? "s" : ""})
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Valeur du patrimoine enregistrée à la fin de chaque journée
            </caption>
            <thead>
              <tr className="text-left text-xs tracking-wide text-secondary uppercase">
                <th scope="col" className="py-1 pr-4 font-medium">
                  Date
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Patrimoine
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((point) => (
                <tr key={point.date} className="border-t border-subtle">
                  <th scope="row" className="py-1 pr-4 text-left font-normal text-secondary">
                    {point.date}
                  </th>
                  <td className="pl-numeric py-1 text-right text-primary">
                    {formatMoney(point.marketValueBase, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
