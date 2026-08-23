import { formatMoney, formatPercent, formatQuantity, signOf } from "@portfolio-lab/ui";
import type { CurrencyCode, DecimalString } from "@portfolio-lab/domain";

const SIGN_CLASS = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-primary",
} as const;

/** Montant formaté, en chasse tabulaire pour rester aligné en colonne. */
export function Money({
  value,
  currency,
  colored = false,
}: Readonly<{
  value: DecimalString;
  currency: CurrencyCode;
  colored?: boolean;
}>): React.JSX.Element {
  const tone = colored ? SIGN_CLASS[signOf(value)] : "text-primary";
  return <span className={`pl-numeric ${tone}`}>{formatMoney(value, currency)}</span>;
}

/**
 * Variation en pourcentage.
 *
 * `null` rend un tiret cadratin : une variation inconnue ne doit jamais
 * s'afficher comme `0.00 %`, qui se lirait « stable ».
 */
export function Percent({
  value,
  colored = true,
}: Readonly<{ value: DecimalString | null; colored?: boolean }>): React.JSX.Element {
  if (value === null) {
    return (
      <span className="pl-numeric text-secondary" title="Variation non disponible">
        —
      </span>
    );
  }
  const tone = colored ? SIGN_CLASS[signOf(value)] : "text-primary";
  return <span className={`pl-numeric ${tone}`}>{formatPercent(value)}</span>;
}

/**
 * Quantité, sans les zéros de queue du `numeric(30, 12)`.
 *
 * « 2.000000000000 » se lit mal ; la précision réelle est conservée quand elle
 * existe.
 */
export function Quantity({ value }: Readonly<{ value: DecimalString }>): React.JSX.Element {
  return <span className="pl-numeric">{formatQuantity(value)}</span>;
}

/**
 * Valeur indisponible.
 *
 * Composant dédié plutôt qu'un simple tiret, pour que l'absence de donnée porte
 * toujours son explication accessible.
 */
export function Unavailable({ reason }: Readonly<{ reason: string }>): React.JSX.Element {
  return (
    <span className="pl-numeric text-stale" title={reason}>
      —<span className="sr-only"> {reason}</span>
    </span>
  );
}
