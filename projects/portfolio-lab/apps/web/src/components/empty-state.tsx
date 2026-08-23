import Link from "next/link";
import type { Route } from "next";

/**
 * État vide générique.
 *
 * Aucun écran de PortfolioLab n'affiche de donnée de démonstration pour
 * « remplir » : tant que l'utilisateur n'a rien saisi, on explique et on
 * propose une action, sans jamais simuler un portefeuille.
 */
export function EmptyState({
  title,
  lines,
  action,
}: Readonly<{
  title: string;
  lines: readonly string[];
  action?: { href: Route; label: string };
}>): React.JSX.Element {
  return (
    <section className="rounded-token-lg border border-subtle bg-surface p-6 text-center">
      <h2 className="text-lg font-medium text-primary">{title}</h2>
      <div className="mx-auto mt-3 max-w-prose space-y-2 text-sm leading-relaxed text-secondary">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="mt-6 inline-flex min-h-[var(--pl-touch-target)] items-center justify-center rounded-token-md border border-copper px-5 text-sm font-medium text-copper transition-colors hover:bg-elevated"
          style={{ transitionDuration: "var(--pl-transition-fast)" }}
        >
          {action.label}
        </Link>
      ) : null}
    </section>
  );
}
