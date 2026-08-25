"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActiveNav, NAV_ITEMS } from "./nav-items";
import { NavIcon } from "./nav-icon";
import { cx } from "./ui";

/**
 * Barre de navigation basse.
 *
 * Elle est posée sur la surface élevée et non sur le fond : sur un bleu-nuit
 * aussi sombre, une barre de la même couleur que la page ne se détache que par
 * son filet supérieur, et disparaît dès que le contenu défile derrière.
 *
 * L'onglet actif reçoit une pastille d'accent **en plus** de la couleur, et
 * `aria-current` reste la source de vérité : la teinte seule ne suffit ni pour
 * un lecteur d'écran ni pour une vision des couleurs atypique.
 *
 * Chaque cible fait au moins 44 px (`--pl-touch-target`) et la barre réserve la
 * safe-area iOS, sans quoi le dernier onglet tomberait sous l'indicateur
 * d'accueil de l'iPhone.
 */
export function BottomNav(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-subtle bg-elevated/95 backdrop-blur"
      style={{ paddingBottom: "var(--pl-safe-bottom)" }}
    >
      <ul className="mx-auto flex w-full max-w-3xl px-1">
        {NAV_ITEMS.map((item) => {
          const active = isActiveNav(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-[var(--pl-touch-target)] flex-col items-center justify-center gap-1 px-1 py-1.5",
                  "text-[11px] font-medium transition-colors",
                  active ? "text-accent" : "text-tertiary hover:text-primary",
                )}
              >
                <span
                  className={cx(
                    "flex h-7 w-12 items-center justify-center rounded-token-pill transition-colors",
                    active ? "bg-accent/15" : "bg-transparent",
                  )}
                >
                  <NavIcon name={item.label} active={active} />
                </span>
                <span>{item.label}</span>
                <span className="sr-only">{item.description}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
