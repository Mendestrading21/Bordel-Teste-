import { CHIP_BASE, CHIP_TONE, cx, type Tone } from "./styles";

/**
 * Pastille courte : un statut, une catégorie, un compte.
 *
 * `icon` accepte un émoji, utilisé comme **marqueur sémantique** — jamais comme
 * décoration. Il est masqué aux lecteurs d'écran : le libellé porte déjà le
 * sens, et « graphique ascendant » lu à voix haute n'aide personne.
 */
export function Chip({
  tone = "neutral",
  icon,
  title,
  className,
  children,
}: Readonly<{
  tone?: Tone | undefined;
  icon?: string | undefined;
  title?: string | undefined;
  className?: string | undefined;
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <span className={cx(CHIP_BASE, CHIP_TONE[tone], className)} title={title}>
      {icon === undefined ? null : (
        <span aria-hidden="true" className="text-[12px] leading-none">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
