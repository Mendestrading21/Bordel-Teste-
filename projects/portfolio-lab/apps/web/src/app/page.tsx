import { BASE_CURRENCY, type CurrencyCode } from "@portfolio-lab/domain";
import { portfolioReturn } from "@portfolio-lab/portfolio-engine";

import { DataHealth } from "@/components/data-health";
import { DemoBanner } from "@/components/demo-banner";
import { EmptyState } from "@/components/empty-state";
import { FreshnessBadge } from "@/components/freshness-badge";
import { Money, Percent } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { SessionNotice } from "@/components/session-notice";
import { getServerSessionState } from "@/lib/auth/server";
import { loadPortfolioView } from "@/lib/data/portfolio";

export const dynamic = "force-dynamic";

/** Indicateur secondaire du tableau de bord. */
function Metric({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>): React.JSX.Element {
  return (
    <div className="rounded-token-md border border-subtle bg-surface px-4 py-3">
      <dt className="text-xs tracking-wide text-secondary uppercase">{label}</dt>
      <dd className="mt-1 text-base font-medium">{children}</dd>
    </div>
  );
}

export default async function AccueilPage(): Promise<React.JSX.Element> {
  const session = getServerSessionState();
  const view = await loadPortfolioView();
  const { valuation } = view;

  const currency = (view.portfolio?.base_currency ?? BASE_CURRENCY) as CurrencyCode;

  /*
   * Pourcentage de P&L au niveau du portefeuille.
   *
   * Le calcul est délégué au moteur, en arithmétique décimale : la version
   * précédente passait par `Number`, ce qui réintroduisait l'erreur de
   * flottant sur le chiffre le plus regardé de l'écran.
   */
  const pnlPct = valuation === null ? null : portfolioReturn(valuation);

  return (
    <>
      <PageHeader title="Accueil" subtitle="Votre patrimoine consolidé en francs suisses." />
      <DemoBanner mode={view.mode} />
      {view.mode.kind === "demo" ? null : <SessionNotice state={session} />}

      {valuation === null || valuation.positions.length === 0 ? (
        view.mode.kind === "unavailable" ? (
          <EmptyState
            title="Données indisponibles"
            lines={[
              view.mode.reason,
              "L'application reste consultable, mais aucune position ne peut être lue ou enregistrée.",
            ]}
          />
        ) : !view.authenticated ? (
          /*
           * Distinct de « portefeuille vide » : afficher « aucun placement
           * enregistré » à un utilisateur simplement déconnecté lui laisserait
           * croire que ses données ont disparu.
           */
          <EmptyState
            title="Patrimoine privé"
            lines={[
              "PortfolioLab est une application personnelle : vos positions ne sont visibles qu'une fois votre session ouverte.",
              "Aucune donnée n'est affichée avant authentification, et aucune donnée de démonstration ne vient combler l'écran.",
              "L'application ne se connecte à aucune banque et ne demande aucun mot de passe bancaire.",
            ]}
          />
        ) : (
          <EmptyState
            title="Aucun placement enregistré"
            lines={[
              "PortfolioLab ne se connecte à aucune banque et n'importe rien automatiquement : vous ajoutez vous-même chaque placement.",
              "Une fois une position saisie, l'application récupère les cours disponibles, convertit en CHF et affiche la source ainsi que la fraîcheur de chaque donnée.",
              "Les comptes — Swissquote, IBKR, BCGE, UBS — sont de simples étiquettes d'organisation, sans aucun identifiant bancaire.",
            ]}
            action={{ href: "/ajouter", label: "Ajouter mon premier placement" }}
          />
        )
      ) : (
        <>
          <section
            aria-labelledby="patrimoine-total"
            className="rounded-token-lg border border-subtle bg-surface px-5 py-6"
          >
            <h2 id="patrimoine-total" className="text-xs tracking-wide text-secondary uppercase">
              Patrimoine total
            </h2>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              <Money value={valuation.totalMarketValueBase} currency={currency} />
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <FreshnessBadge freshness={valuation.worstFreshness} asOf={view.marksAsOf} />
              <span className="text-xs text-secondary">
                {valuation.positions.length} position{valuation.positions.length > 1 ? "s" : ""}
              </span>
            </div>
          </section>

          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric label="P&L latent">
              <Money value={valuation.totalUnrealizedPnlBase} currency={currency} colored />
            </Metric>
            <Metric label="Performance">
              <Percent value={pnlPct} />
            </Metric>
            <Metric label="Capital investi">
              <Money value={valuation.totalCostBasisBase} currency={currency} />
            </Metric>
          </dl>

          <section className="mt-4 rounded-token-md border border-subtle bg-surface px-4 py-3">
            <h2 className="text-xs tracking-wide text-secondary uppercase">Variation du jour</h2>
            {valuation.totalDayPnlBase === null ? (
              <p className="mt-1 text-sm text-secondary">
                Non calculable : au moins une position n&apos;a pas de clôture précédente connue.
                Afficher un total partiel serait trompeur.
              </p>
            ) : (
              <p className="mt-1 text-base font-medium">
                <Money value={valuation.totalDayPnlBase} currency={currency} colored />
              </p>
            )}
          </section>

          <DataHealth valuation={valuation} />
        </>
      )}
    </>
  );
}
