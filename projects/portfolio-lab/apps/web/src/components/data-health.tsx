import type { PortfolioValuation } from "@portfolio-lab/portfolio-engine";

/** Explication utilisateur de chaque cause de non-valorisation. */
const GAP_LABEL = {
  NO_MARK: "aucun cours disponible pour cet instrument",
  MARK_UNAVAILABLE: "le fournisseur signale le cours comme indisponible",
  NO_FX_RATE: "aucun taux de change disponible vers la devise de consolidation",
  COST_FX_MISSING: "aucun taux de change disponible pour la devise d'achat",
} as const;

/**
 * Santé des données.
 *
 * Les positions non valorisées sont annoncées explicitement, faute de quoi le
 * total afficherait un patrimoine plus faible que la réalité sans le dire.
 */
export function DataHealth({
  valuation,
}: Readonly<{ valuation: PortfolioValuation }>): React.JSX.Element | null {
  if (valuation.unvalued.length === 0) {
    return null;
  }

  return (
    <section
      role="status"
      className="mt-4 rounded-token-md border border-warning/40 bg-surface px-4 py-3"
    >
      <h2 className="text-xs font-semibold tracking-wide text-warning uppercase">
        {valuation.unvalued.length === 1
          ? "1 position non valorisée"
          : `${valuation.unvalued.length} positions non valorisées`}
      </h2>
      <p className="mt-1 text-sm text-secondary">
        Elles sont exclues du total ci-dessus : le patrimoine affiché est donc incomplet.
      </p>
      <ul className="mt-2 space-y-1 text-sm text-secondary">
        {valuation.unvalued.map((gap) => (
          <li key={gap.positionId}>— {GAP_LABEL[gap.reason.kind]}</li>
        ))}
      </ul>
    </section>
  );
}
