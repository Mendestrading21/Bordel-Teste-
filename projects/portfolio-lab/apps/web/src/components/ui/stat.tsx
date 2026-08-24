import {
  cx,
  STAT_LABEL_SIZE,
  STAT_VALUE_SIZE,
  TEXT_TONE,
  type StatSize,
  type Tone,
} from "./styles";

/**
 * Un chiffre et son libellé.
 *
 * Le libellé est au-dessus de la valeur : en lecture verticale sur mobile,
 * l'œil rencontre d'abord ce que le chiffre signifie. La valeur porte
 * `pl-numeric` (chasses tabulaires) pour que deux montants empilés restent
 * alignés colonne par colonne.
 */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  size = "md",
  className,
}: Readonly<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode | undefined;
  tone?: Tone | undefined;
  size?: StatSize | undefined;
  className?: string | undefined;
}>): React.JSX.Element {
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <span className={cx(STAT_LABEL_SIZE[size], "text-tertiary")}>{label}</span>
      <span className={cx("pl-numeric", STAT_VALUE_SIZE[size], TEXT_TONE[tone])}>{value}</span>
      {hint === undefined ? null : <span className="text-xs text-tertiary">{hint}</span>}
    </div>
  );
}
