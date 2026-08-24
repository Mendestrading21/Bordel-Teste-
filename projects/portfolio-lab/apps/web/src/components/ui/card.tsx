import { CARD_BASE, CARD_PADDING, CARD_TONE, cx, type CardPadding, type CardTone } from "./styles";

/**
 * Élément HTML rendu par la carte.
 *
 * Une carte n'est pas toujours une simple boîte : dès qu'elle porte un titre,
 * c'est une **section** de la page, et la balise doit le dire. La hiérarchie de
 * régions est ce sur quoi s'appuie la navigation par lecteur d'écran ; la
 * réduire à des `div` la fait disparaître sans que rien ne se voie à l'écran.
 */
export type CardElement = "div" | "section" | "article" | "li";

/**
 * Conteneur de base de l'interface.
 *
 * Toute information groupée passe par une `Card` : c'est ce qui garantit qu'un
 * rayon, une bordure et un niveau de fond ne sont jamais réinventés écran par
 * écran.
 */
export function Card({
  as: Element = "div",
  tone = "surface",
  padding = "md",
  className,
  children,
  ...rest
}: Readonly<{
  as?: CardElement | undefined;
  tone?: CardTone | undefined;
  padding?: CardPadding | undefined;
}> &
  React.HTMLAttributes<HTMLElement>): React.JSX.Element {
  return (
    <Element className={cx(CARD_BASE, CARD_TONE[tone], CARD_PADDING[padding], className)} {...rest}>
      {children}
    </Element>
  );
}
