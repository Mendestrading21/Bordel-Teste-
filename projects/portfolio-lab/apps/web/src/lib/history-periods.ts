import {
  historyBounds,
  isComparableSeries,
  wealthChange,
  type HistoryBounds,
  type WealthChange,
  type WealthPoint,
} from "@portfolio-lab/portfolio-engine";

/**
 * Fenêtres proposées au-dessus de la courbe.
 *
 * `null` pour « Tout » : la fenêtre n'a pas de borne basse.
 */
const WINDOWS = [
  { key: "1M", label: "1 mois", days: 30 },
  { key: "3M", label: "3 mois", days: 90 },
  { key: "6M", label: "6 mois", days: 180 },
  { key: "1A", label: "1 an", days: 365 },
  { key: "ALL", label: "Tout", days: null },
] as const;

export type PeriodKey = (typeof WINDOWS)[number]["key"];

export type HistoryPeriod = {
  readonly key: PeriodKey;
  readonly label: string;
  readonly points: readonly WealthPoint[];
  readonly bounds: HistoryBounds;
  readonly change: WealthChange;
};

const MS_PER_DAY = 86_400_000;

/**
 * Découpe l'historique en fenêtres traçables.
 *
 * Une fenêtre n'est proposée que si elle contient **au moins deux points
 * réellement enregistrés**. Rien n'est interpolé, rien n'est reporté : « 1 mois »
 * montre les points du dernier mois, pas une valeur d'il y a trente jours
 * reconstituée à partir des cours d'aujourd'hui. Si l'historique s'arrête il y a
 * six mois, les fenêtres courtes disparaissent — c'est l'information juste, pas
 * une panne.
 *
 * La variation affichée porte donc sur le **premier et le dernier point
 * enregistrés dans la fenêtre**, dont les dates encadrent la courbe. Ce n'est
 * pas la même chose qu'une variation sur trente jours calendaires, et l'écran
 * ne doit pas laisser croire le contraire.
 *
 * Les séries non comparables — deux versions du moteur, deux devises de
 * consolidation — ne produisent aucune fenêtre : superposer ces points
 * dessinerait une marche qui ne correspond à aucun mouvement de patrimoine.
 */
export function historyPeriods(
  history: readonly WealthPoint[],
  today: string,
): readonly HistoryPeriod[] {
  if (history.length < 2 || !isComparableSeries(history)) return [];

  const anchor = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(anchor)) return [];

  const periods: HistoryPeriod[] = [];
  for (const window of WINDOWS) {
    const points =
      window.days === null
        ? history
        : history.filter((point) => {
            const at = Date.parse(`${point.date}T00:00:00Z`);
            return !Number.isNaN(at) && anchor - at <= window.days * MS_PER_DAY;
          });

    if (points.length < 2) continue;

    const bounds = historyBounds(points);
    const change = wealthChange(points);
    if (bounds === null || change === null) continue;

    /*
     * Une fenêtre qui contient exactement les mêmes points que la précédente
     * n'apprend rien : proposer « 1 mois », « 3 mois » et « 6 mois » pour la
     * même courbe donne trois onglets qui ne changent jamais rien.
     *
     * Le groupe fusionné garde le libellé le **plus étroit**. Les deux sont
     * exacts — la fenêtre des trois derniers mois contient bien ces points —
     * mais un onglet « 3 mois » au-dessus d'une courbe de vingt jours se lit
     * comme un écran cassé, là où « 1 mois » décrit ce qu'on voit.
     *
     * Seul « Tout » fait exception : ce libellé ne promet pas une durée, il dit
     * que rien n'est écarté, et c'est une information à garder.
     */
    const previous = periods[periods.length - 1];
    if (previous !== undefined && previous.points.length === points.length) {
      if (window.key === "ALL") {
        periods[periods.length - 1] = { ...previous, key: window.key, label: window.label };
      }
      continue;
    }

    periods.push({ key: window.key, label: window.label, points, bounds, change });
  }

  return periods;
}
