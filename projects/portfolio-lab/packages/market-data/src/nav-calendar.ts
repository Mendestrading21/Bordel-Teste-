/**
 * Calendrier de publication des NAV.
 *
 * Le problème que ce module résout : un fonds dont la dernière NAV date de
 * vendredi n'est **pas** en retard le samedi, ni le dimanche, ni le lundi de
 * Pâques. Appliquer un simple seuil en heures ferait clignoter « donnée
 * périmée » sur tout le portefeuille chaque week-end.
 *
 * Le calcul se fait donc en **jours ouvrés**, en tenant compte de la fréquence
 * de publication déclarée du fonds.
 */

/** Fréquence de publication déclarée par le fonds. */
export const NAV_FREQUENCIES = ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "UNKNOWN"] as const;

export type NavFrequency = (typeof NAV_FREQUENCIES)[number];

export const NAV_FREQUENCY_LABEL: Readonly<Record<NavFrequency, string>> = {
  DAILY: "Quotidienne",
  WEEKLY: "Hebdomadaire",
  BIWEEKLY: "Bimensuelle",
  MONTHLY: "Mensuelle",
  UNKNOWN: "Non communiquée",
};

/**
 * Jours ouvrés de tolérance avant de considérer une NAV périmée.
 *
 * Chaque valeur laisse une marge d'un cycle complet : un fonds mensuel publiant
 * le 1er ne doit pas être signalé le 2 du mois suivant à cause d'un décalage de
 * traitement d'un jour.
 */
const TOLERANCE_BUSINESS_DAYS: Readonly<Record<NavFrequency, number>> = {
  DAILY: 3,
  WEEKLY: 8,
  BIWEEKLY: 13,
  MONTHLY: 26,
  // Fréquence inconnue : on est conservateur plutôt que d'alarmer à tort.
  UNKNOWN: 8,
};

/**
 * Jours fériés à ignorer dans le décompte.
 *
 * Volontairement fournis par l'appelant plutôt que codés en dur : les
 * calendriers diffèrent par place de cotation et par pays de domiciliation, et
 * une liste figée deviendrait fausse l'année suivante sans que personne ne s'en
 * aperçoive.
 *
 * Format ISO `YYYY-MM-DD`.
 */
export type HolidayCalendar = ReadonlySet<string>;

export const NO_HOLIDAYS: HolidayCalendar = new Set<string>();

/** `true` si la date tombe un samedi ou un dimanche, en UTC. */
export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** `true` si la date est un jour de bourse : ni week-end, ni férié. */
export function isBusinessDay(date: Date, holidays: HolidayCalendar = NO_HOLIDAYS): boolean {
  return !isWeekend(date) && !holidays.has(date.toISOString().slice(0, 10));
}

/**
 * Nombre de jours ouvrés strictement entre deux dates.
 *
 * La borne de départ est exclue, celle d'arrivée incluse : « publiée hier,
 * évaluée aujourd'hui » vaut un jour ouvré, pas zéro.
 *
 * Renvoie une valeur négative si `to` précède `from`, ce qui signale une NAV
 * datée dans le futur — anomalie que l'appelant doit traiter, pas masquer.
 */
export function businessDaysBetween(
  from: Date,
  to: Date,
  holidays: HolidayCalendar = NO_HOLIDAYS,
): number {
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));

  if (end < start) {
    return -businessDaysBetween(to, from, holidays);
  }

  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isBusinessDay(cursor, holidays)) {
      count += 1;
    }
  }
  return count;
}

/** Verdict de fraîcheur d'une NAV. */
export type NavStatus =
  /** Publiée dans les délais attendus pour sa fréquence. */
  | { readonly kind: "CURRENT"; readonly businessDaysOld: number }
  /** En retard au regard de la fréquence déclarée. */
  | { readonly kind: "STALE"; readonly businessDaysOld: number; readonly toleranceDays: number }
  /** Datée dans le futur : anomalie de la source. */
  | { readonly kind: "FUTURE_DATED" }
  /** Aucune NAV connue. */
  | { readonly kind: "MISSING" };

/**
 * Évalue la fraîcheur d'une NAV.
 *
 * `asOfDate` est la **date de valeur** de la NAV, pas l'instant où elle a été
 * récupérée : un fonds publie une NAV « du 14 » qui peut n'être disponible que
 * le 16. C'est la date de valeur qui fait foi.
 */
export function evaluateNavStatus(
  navDate: Date | null,
  now: Date,
  frequency: NavFrequency,
  holidays: HolidayCalendar = NO_HOLIDAYS,
): NavStatus {
  if (navDate === null) {
    return { kind: "MISSING" };
  }

  const age = businessDaysBetween(navDate, now, holidays);

  if (age < 0) {
    // Une NAV datée dans le futur signale un défaut de la source ; l'afficher
    // comme fraîche masquerait le problème.
    return { kind: "FUTURE_DATED" };
  }

  const tolerance = TOLERANCE_BUSINESS_DAYS[frequency];
  return age <= tolerance
    ? { kind: "CURRENT", businessDaysOld: age }
    : { kind: "STALE", businessDaysOld: age, toleranceDays: tolerance };
}

/** Tolérance en jours ouvrés associée à une fréquence. */
export function toleranceFor(frequency: NavFrequency): number {
  return TOLERANCE_BUSINESS_DAYS[frequency];
}
