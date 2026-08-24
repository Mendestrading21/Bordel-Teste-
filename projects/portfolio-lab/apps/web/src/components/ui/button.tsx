import Link from "next/link";
import type { Route } from "next";

import {
  BUTTON_BASE,
  BUTTON_SIZE,
  BUTTON_VARIANT,
  cx,
  type ButtonSize,
  type ButtonVariant,
} from "./styles";

/** Classe complète d'un bouton, partagée par le bouton et le lien-bouton. */
export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className);
}

/**
 * Bouton d'action.
 *
 * La durée de transition vient du token `--pl-transition-fast`, mis à `0ms`
 * sous `prefers-reduced-motion` : le réglage système est respecté sans qu'un
 * composant ait à s'en soucier.
 */
export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...rest
}: Readonly<{
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
}> &
  React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <button className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

/** Lien présenté comme un bouton. Reste un `<a>` : il navigue, il n'agit pas. */
export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
}: Readonly<{
  href: Route;
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  className?: string | undefined;
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
