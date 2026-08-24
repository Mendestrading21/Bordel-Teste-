import type { Route } from "next";

import { ButtonLink, Card } from "./ui";

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
    <Card as="section" padding="lg" className="text-center">
      <h2 className="text-lg font-medium text-primary">{title}</h2>
      <div className="mx-auto mt-3 max-w-prose space-y-2 text-sm leading-relaxed text-secondary">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      {action ? (
        <div className="mt-6 flex justify-center">
          <ButtonLink href={action.href} variant="primary">
            {action.label}
          </ButtonLink>
        </div>
      ) : null}
    </Card>
  );
}
