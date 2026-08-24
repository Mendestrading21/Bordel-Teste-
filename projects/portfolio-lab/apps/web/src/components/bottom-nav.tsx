"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActiveNav, NAV_ITEMS } from "./nav-items";
import { NavIcon } from "./nav-icon";

/**
 * Barre de navigation basse, ancrée et respectant la safe-area iOS.
 *
 * Chaque cible fait au moins 44px de haut (`--pl-touch-target`) et l'état actif
 * est signalé par la couleur *et* par `aria-current`, jamais par la seule
 * teinte cuivre.
 */
export function BottomNav(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-subtle bg-surface/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex w-full max-w-3xl">
        {NAV_ITEMS.map((item) => {
          const active = isActiveNav(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[var(--pl-touch-target)] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors ${
                  active ? "text-accent" : "text-secondary hover:text-primary"
                }`}
                style={{ transitionDuration: "var(--pl-transition-fast)" }}
              >
                <NavIcon name={item.label} active={active} />
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
