import { QUOTE_FRESHNESS_LABEL, type QuoteFreshness } from "@portfolio-lab/domain";

/**
 * Badge de fraîcheur.
 *
 * Le badge n'est jamais masqué, même pour `LIVE` : savoir qu'une donnée est en
 * direct fait partie de l'information. Le statut est porté par le **texte**
 * autant que par la couleur, pour rester lisible sans perception des couleurs.
 */
const TONE: Readonly<Record<QuoteFreshness, string>> = {
  LIVE: "border-positive/40 text-positive",
  DELAYED: "border-warning/40 text-warning",
  EOD: "border-subtle text-secondary",
  NAV: "border-copper/40 text-copper",
  MANUAL: "border-subtle text-secondary",
  STALE: "border-stale/50 text-stale",
  UNAVAILABLE: "border-negative/40 text-negative",
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
    <span
      className={`inline-flex items-center rounded-token-sm border px-2 py-0.5 text-[11px] font-medium ${TONE[freshness]}`}
      title={detail === "" ? undefined : detail}
    >
      {QUOTE_FRESHNESS_LABEL[freshness]}
      {detail === "" ? null : <span className="sr-only"> — {detail}</span>}
    </span>
  );
}
