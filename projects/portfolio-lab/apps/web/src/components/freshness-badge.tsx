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

  return (
    <Chip tone={TONE[freshness]} title={detail === "" ? undefined : detail}>
      {QUOTE_FRESHNESS_LABEL[freshness]}
      {detail === "" ? null : <span className="sr-only"> — {detail}</span>}
    </Chip>
  );
}
