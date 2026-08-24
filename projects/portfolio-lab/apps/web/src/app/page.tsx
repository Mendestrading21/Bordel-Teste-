import { BASE_CURRENCY, type AssetType, type CurrencyCode } from "@portfolio-lab/domain";
import { allocate, portfolioReturn } from "@portfolio-lab/portfolio-engine";

import { DataHealth } from "@/components/data-health";
import { DemoBanner } from "@/components/demo-banner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  AllocationSummary,
  WealthHero,
  WealthMetrics,
  type AllocationRow,
} from "@/components/wealth-hero";
import { SessionNotice } from "@/components/session-notice";
import { getServerSessionState } from "@/lib/auth/server";
import { loadPortfolioView } from "@/lib/data/portfolio";

export const dynamic = "force-dynamic";

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

  /*
   * Répartition par classe d'actifs, réduite aux cinq premières parts.
   *
   * L'accueil répond à « comment est-ce réparti », pas à « donne-moi le détail
   * exhaustif » — c'est le rôle de l'écran Analyse. Au-delà de cinq lignes, la
   * liste cesse d'être lisible d'un coup d'œil et devient un tableau.
   */
  const positionById = new Map(view.positions.map((position) => [position.positionId, position]));
  const allocationRows: readonly AllocationRow[] =
    valuation === null
      ? []
      : allocate(
          valuation.positions.map((value) => ({
            key: positionById.get(value.positionId)?.assetType ?? "OTHER",
            marketValueBase: value.marketValueBase,
          })),
        )
          .map((slice) => ({
            assetType: slice.key as AssetType,
            // `grossPct` est une fraction ; l'affichage attend un pourcentage.
            sharePct: Number(slice.grossPct) * 100,
          }))
          .sort((a, b) => b.sharePct - a.sharePct)
          .slice(0, 5);

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
          <WealthHero
            valuation={valuation}
            currency={currency}
            marksAsOf={view.marksAsOf}
            positionCount={valuation.positions.length}
            returnPct={pnlPct}
          />

          <WealthMetrics valuation={valuation} currency={currency} returnPct={pnlPct} />

          <AllocationSummary rows={allocationRows} />

          <DataHealth valuation={valuation} />
        </>
      )}
    </>
  );
}
