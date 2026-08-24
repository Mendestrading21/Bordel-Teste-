import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ASSET_TYPE_LABEL,
  PRICE_TYPE_LABEL,
  type AssetType,
  type CurrencyCode,
} from "@portfolio-lab/domain";

import { ASSET_ICON } from "@/components/asset-icon";
import { DeletePositionForm } from "@/components/delete-position-form";
import { EditPositionForm } from "@/components/edit-position-form";
import { DemoBanner } from "@/components/demo-banner";
import { FreshnessBadge } from "@/components/freshness-badge";
import { Money, Percent, Quantity } from "@/components/money";
import { Card, Chip, Stat } from "@/components/ui";
import { loadPortfolioView } from "@/lib/data/portfolio";
import { unitPriceFromValue } from "@/lib/unit-price";

export const metadata: Metadata = { title: "Détail de la position" };
export const dynamic = "force-dynamic";

/** Ligne d'un tableau de définitions. */
function Row({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-subtle py-2.5 last:border-b-0">
      <dt className="text-sm text-secondary">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

export default async function PositionDetailPage({
  params,
}: Readonly<{ params: Promise<{ positionId: string }> }>): Promise<React.JSX.Element> {
  const { positionId } = await params;
  const view = await loadPortfolioView();

  const position = view.positions.find((entry) => entry.positionId === positionId);
  if (position === undefined) {
    // RLS rend invisible la position d'un tiers : « introuvable » est donc la
    // réponse correcte autant pour une position inexistante que pour celle
    // d'autrui, sans divulguer laquelle.
    notFound();
  }

  const value = view.valuation?.positions.find((entry) => entry.positionId === positionId);
  const assetType = position.assetType as AssetType;
  const unitPrice =
    value === undefined
      ? null
      : unitPriceFromValue(value.marketValueNative, position.quantity, position.multiplier);

  return (
    <>
      <Link href="/positions" className="mb-4 inline-block text-sm text-accent hover:underline">
        ← Retour aux positions
      </Link>

      {/* 1. Identité de l'instrument. */}
      <header className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-token-md bg-elevated text-sm"
        >
          {position.shortName === null ? ASSET_ICON[assetType] : position.shortName.slice(0, 5)}
        </span>
        <div className="min-w-0">
          <h1 className="text-lg leading-tight font-semibold text-primary">
            {position.instrumentName}
          </h1>
          <p className="mt-1 text-xs text-tertiary">
            <span aria-hidden="true">{ASSET_ICON[assetType]} </span>
            {ASSET_TYPE_LABEL[assetType]} · {position.accountName}
          </p>
        </div>
      </header>

      <DemoBanner mode={view.mode} />

      {value === undefined ? (
        <Card padding="lg" className="mt-4">
          <p className="text-sm text-stale">
            Aucun cours fiable n&apos;est disponible pour cet instrument. La position est exclue du
            total du portefeuille plutôt que comptée pour zéro.
          </p>
        </Card>
      ) : (
        <>
          {/* 2. Cours retenu et sa provenance. */}
          <Card as="section" padding="md" className="mt-4" aria-labelledby="cours">
            <h2 id="cours" className="text-xs tracking-wide text-tertiary uppercase">
              Cours retenu
            </h2>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
              <p className="text-2xl font-semibold">
                {unitPrice === null ? (
                  <span className="text-base text-stale">Position soldée</span>
                ) : (
                  <Money value={unitPrice} currency={value.nativeCurrency as CurrencyCode} />
                )}
              </p>
              <FreshnessBadge
                freshness={value.freshness}
                asOf={value.asOf}
                provider={value.provider}
              />
            </div>
            {/*
             * Le cours n'est pas relu chez le fournisseur : il est reconstitué
             * depuis la valorisation. Un chiffre plus frais que le total
             * afficherait une fiche en contradiction avec elle-même.
             */}
            <p className="mt-2 text-xs text-tertiary">
              Reconstitué depuis la valorisation ({PRICE_TYPE_LABEL[value.priceType]}), donc
              cohérent avec le total affiché.
            </p>
          </Card>

          {/* 3. Ce que vaut la position et ce qu'elle a rapporté. */}
          <Card as="section" padding="md" className="mt-3" aria-labelledby="valorisation">
            <h2 id="valorisation" className="text-xs tracking-wide text-tertiary uppercase">
              Ma position
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Stat
                label="Valeur"
                value={
                  <Money
                    value={value.marketValueBase}
                    currency={value.baseCurrency as CurrencyCode}
                    bare
                  />
                }
                hint={`en ${value.baseCurrency}`}
              />
              <Stat
                label="P&L latent"
                value={
                  <Money
                    value={value.unrealizedPnlBase}
                    currency={value.baseCurrency as CurrencyCode}
                    colored
                    bare
                  />
                }
                hint={
                  value.unrealizedPnlPct === null ? (
                    "Coût de revient nul"
                  ) : (
                    <Percent value={value.unrealizedPnlPct} />
                  )
                }
              />
            </div>
            <div className="mt-4 border-t border-subtle pt-3">
              <dl>
                <Row label="Aujourd'hui">
                  {value.dayPnlBase === null ? (
                    /*
                     * Pas de tiret muet : l'absence de clôture précédente est
                     * une information, et la taire ferait passer une donnée
                     * manquante pour une variation nulle.
                     */
                    <span className="text-xs text-stale">Clôture précédente inconnue</span>
                  ) : (
                    <Money
                      value={value.dayPnlBase}
                      currency={value.baseCurrency as CurrencyCode}
                      colored
                    />
                  )}
                </Row>
                <Row label="Valeur en devise native">
                  <Money
                    value={value.marketValueNative}
                    currency={value.nativeCurrency as CurrencyCode}
                  />
                </Row>
                <Row label="Coût de revient">
                  <Money
                    value={value.costBasisBase}
                    currency={value.baseCurrency as CurrencyCode}
                  />
                </Row>
              </dl>
            </div>
          </Card>
        </>
      )}

      {/*
       * 4. Emplacement du graphique.
       *
       * Aucun historique par position n'existe : les instantanés sont pris au
       * niveau du portefeuille, et l'historique fournisseur demande une clé
       * réelle. Plutôt qu'une courbe inventée — la seule chose interdite ici —
       * l'écran dit ce qui manque et pourquoi. Le tracé viendra avec DS-06.
       */}
      <Card as="section" padding="md" className="mt-3" aria-labelledby="historique">
        <h2 id="historique" className="text-xs tracking-wide text-tertiary uppercase">
          Historique
        </h2>
        <p className="mt-2 text-sm text-stale">
          Aucun historique n&apos;est encore conservé pour cette ligne. Les instantanés existants
          portent sur le patrimoine entier, pas position par position.
        </p>
      </Card>

      {/* 5. Métriques propres à la classe d'actifs. */}
      {assetType === "OPTION" ? (
        <Card as="section" padding="md" className="mt-3" aria-labelledby="contrat">
          <h2 id="contrat" className="text-xs tracking-wide text-tertiary uppercase">
            Contrat
          </h2>
          <dl className="mt-1">
            <Row label="Multiplicateur">
              <Quantity value={position.multiplier} />
            </Row>
            <Row label="Contrats détenus">
              <Quantity value={position.quantity} />
            </Row>
          </dl>
          {/*
           * Le multiplicateur est affiché avant tout le reste sur une option :
           * c'est lui qui sépare une valeur de 3.25 d'une exposition de 650, et
           * l'oublier est l'erreur de lecture la plus coûteuse de cet écran.
           */}
          <p className="mt-2 text-xs text-tertiary">
            La valeur affichée tient compte du multiplicateur, jamais supposé.
          </p>
        </Card>
      ) : null}

      {assetType === "MUTUAL_FUND" ? (
        <Card as="section" padding="md" className="mt-3" aria-labelledby="fonds">
          <h2 id="fonds" className="text-xs tracking-wide text-tertiary uppercase">
            Fonds
          </h2>
          <p className="mt-2 text-sm text-secondary">
            Un fonds est valorisé à sa valeur nette d&apos;inventaire, publiée une fois par jour.
            Aucun cours intrajournalier n&apos;existe pour cette ligne.
          </p>
        </Card>
      ) : null}

      {/* 6. Compte, quantité, coût. */}
      <Card as="section" padding="md" className="mt-3" aria-labelledby="detention">
        <h2 id="detention" className="text-xs tracking-wide text-tertiary uppercase">
          Détention
        </h2>
        <dl className="mt-1">
          <Row label="Quantité">
            <Quantity value={position.quantity} />
          </Row>
          <Row label="Coût moyen unitaire">
            <Money value={position.averageCost} currency={position.costCurrency} />
          </Row>
          <Row label="Compte">
            <Chip tone="neutral">{position.accountName}</Chip>
          </Row>
          {position.notes === null ? null : <Row label="Notes">{position.notes}</Row>}
        </dl>
      </Card>

      {/*
       * 7. Provenance, repliée par défaut.
       *
       * Ces champs servent à vérifier un chiffre contesté, pas à le lire tous
       * les jours. Ouverts en permanence, ils repoussaient « Modifier » sous la
       * ligne de flottaison sur un écran de 390 px.
       *
       * `<details>` natif : il fonctionne sans JavaScript, et le navigateur
       * gère seul l'état déplié pour la recherche dans la page.
       */}
      {value === undefined ? null : (
        <details className="group mt-3 overflow-hidden rounded-token-lg border border-subtle bg-surface">
          <summary className="flex min-h-[var(--pl-touch-target)] cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm text-secondary">
            <span>Détails de valorisation</span>
            <span aria-hidden="true" className="text-xs text-tertiary group-open:hidden">
              Afficher
            </span>
            <span aria-hidden="true" className="hidden text-xs text-tertiary group-open:inline">
              Masquer
            </span>
          </summary>
          <div className="border-t border-subtle px-4 py-1">
            <dl>
              <Row label="Méthode de valorisation">{PRICE_TYPE_LABEL[value.priceType]}</Row>
              <Row label="Fournisseur">{value.provider}</Row>
              <Row label="Horodatage du cours">
                <span className="pl-numeric">
                  {new Date(value.asOf).toLocaleString("fr-CH", { timeZone: "Europe/Zurich" })}
                </span>
              </Row>
              <Row label="Taux de change appliqué">
                <span className="pl-numeric">
                  {value.fxRate} {value.nativeCurrency}/{value.baseCurrency}
                </span>
              </Row>
              <Row label="Coût de revient natif">
                <Money
                  value={value.costBasisNative}
                  currency={value.nativeCurrency as CurrencyCode}
                />
              </Row>
              <Row label="Version du moteur de calcul">
                <span className="pl-numeric">{value.calculationVersion}</span>
              </Row>
            </dl>
          </div>
        </details>
      )}

      {/* 8. Actions destructrices en dernier. */}
      <EditPositionForm
        positionId={position.positionId}
        quantity={position.quantity}
        averageCost={position.averageCost}
        costCurrency={position.costCurrency}
        notes={position.notes}
      />

      <DeletePositionForm positionId={position.positionId} name={position.instrumentName} />
    </>
  );
}
