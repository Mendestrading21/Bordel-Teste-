import { QUOTE_FRESHNESS_LABEL, type QuoteFreshness } from "@portfolio-lab/domain";

import { Chip, type Tone } from "./ui";

/**
 * Badge de fraîcheur.
 *
 * Le badge n'est jamais masqué, même pour `LIVE` : savoir qu'une donnée est en
 * direct fait partie de l'information. Le statut est porté par le **texte**
 * autant que par la couleur, pour rester lisible sans perception des couleurs.
 */
const TONE: Readonly<Record<QuoteFreshness, Tone>> = {
  LIVE: "positive",
  DELAYED: "warning",
  EOD: "neutral",
  NAV: "accent",
  MANUAL: "neutral",
  STALE: "stale",
  UNAVAILABLE: "negative",
};

export function FreshnessBadge({
  freshness,
  asOf,
  provider,
}: Readonly<{
  freshness: QuoteFreshness;
  asOf?: string | null;
  provider?: string;
}>): React.JSX.Element {
  const detail = [
    provider === undefined ? null : `source : ${provider}`,
    asOf == null
      ? null
      : `au ${new Date(asOf).toLocaleString("fr-CH", { timeZone: "Europe/Zurich" })}`,
  ]
    .filter((part): part is string => part !== null)
    .join(" — ");

  /*
   * Marqueur stable pour les vérifications automatisées.
   *
   * Les parcours E2E cherchaient le libellé « Manuel » n'importe où dans la
   * page. Cela les rendait dépendants de la prose : toute phrase mentionnant un
   * type de cours — l'explication du bandeau de démonstration, par exemple —
   * pouvait devenir la première occurrence trouvée. L'attribut désigne le
   * badge lui-même, quelle que soit la formulation retenue ailleurs.
   */
  const marker = { "data-pl-freshness": freshness } as React.HTMLAttributes<HTMLSpanElement>;

  return (
    <Chip tone={TONE[freshness]} {...(detail === "" ? {} : { title: detail })} {...marker}>
      {QUOTE_FRESHNESS_LABEL[freshness]}
      {detail === "" ? null : <span className="sr-only"> — {detail}</span>}
    </Chip>
  );
}
