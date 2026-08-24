import type { Metadata } from "next";

import type { CurrencyCode, DecimalString } from "@portfolio-lab/domain";
import { NAV_FREQUENCY_LABEL } from "@portfolio-lab/market-data";

import { DemoBanner } from "@/components/demo-banner";
import { EmptyState } from "@/components/empty-state";
import { FreshnessBadge } from "@/components/freshness-badge";
import { Money, Quantity, Unavailable } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { Card, Stat } from "@/components/ui";
import { listFunds, type FundView } from "@/lib/data/funds";
import { loadPortfolioView } from "@/lib/data/portfolio";

export const metadata: Metadata = { title: "Fonds" };
export const dynamic = "force-dynamic";

function Row({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-subtle py-2 last:border-b-0">
      <dt className="text-sm text-secondary">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

/**
 * Explication de l'état d'une NAV, en français et sans jargon.
 *
 * Un badge « périmé » sans motif laisserait l'utilisateur incapable de
 * distinguer un fonds en retard de publication d'une panne de récupération.
 */
function navExplanation(fund: FundView): string {
  if (fund.nav === null) {
    return "Aucune valeur nette d'inventaire n'a encore été publiée pour ce fonds.";
  }
  switch (fund.nav.status.kind) {
    case "CURRENT": {
      const days = fund.nav.status.businessDaysOld;
      /*
       * « 0 jour ouvré » ne veut pas dire « aujourd'hui » : une NAV publiée
       * vendredi et lue le dimanche a bien zéro jour ouvré d'écart. Dire
       * « publiée aujourd'hui » serait faux, et masquerait justement le
       * raisonnement en jours ouvrés que l'écran cherche à expliquer.
       */
      if (days === 0) {
        return "À jour : aucun jour ouvré ne s'est écoulé depuis sa date de valeur.";
      }
      return `À jour : ${days} jour${days > 1 ? "s" : ""} ouvré${
        days > 1 ? "s" : ""
      } depuis sa date de valeur.`;
    }
    case "STALE":
      return `Aucune publication depuis ${fund.nav.status.businessDaysOld} jours ouvrés, alors que la fréquence attendue en tolère ${fund.nav.status.toleranceDays}.`;
    case "FUTURE_DATED":
      return "La date de la NAV est postérieure à aujourd'hui : la source est incohérente.";
    case "MISSING":
      return "Aucune valeur nette d'inventaire disponible.";
  }
}

/**
 * Ce que l'utilisateur détient réellement de ce fonds.
 *
 * Un écran « Fonds » qui montre la NAV sans montrer les parts détenues
 * ne répond qu'à la moitié de la question. La NAV est une donnée de marché ; ce
 * que l'on possède est la raison de venir sur cet écran.
 */
export type FundHolding = {
  readonly quantity: DecimalString;
  readonly marketValueBase: DecimalString | null;
  readonly baseCurrency: CurrencyCode;
  readonly accountName: string;
  readonly positionId: string;
};

function FundCard({
  fund,
  holding,
}: Readonly<{ fund: FundView; holding: FundHolding | null }>): React.JSX.Element {
  return (
    <Card as="li" padding="md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium text-primary">{fund.name}</h2>
          {fund.isin === null ? null : (
            <p className="pl-numeric mt-0.5 text-xs text-tertiary">{fund.isin}</p>
          )}
        </div>
        {/*
          `exactOptionalPropertyTypes` distingue « absent » de « undefined » :
          on omet donc `provider` plutôt que de lui passer `undefined`.
        */}
        {fund.nav === null ? (
          <FreshnessBadge freshness="UNAVAILABLE" />
        ) : (
          <FreshnessBadge
            freshness={fund.nav.freshness}
            asOf={fund.nav.record.retrievedAt}
            provider={fund.nav.record.provider}
          />
        )}
      </div>

      {/*
       * La NAV porte la taille dominante et la position vient à côté : ce sont
       * les deux chiffres pour lesquels on ouvre cet écran. Le reste — classe
       * de parts, domiciliation, profondeur d'historique — sert à vérifier
       * qu'on regarde le bon fonds, une fois, pas tous les jours.
       */}
      <div className="mt-3 grid grid-cols-2 gap-4">
        <Stat
          label="Dernière NAV"
          value={
            fund.nav === null ? (
              <span className="text-base text-stale">Indisponible</span>
            ) : (
              <Money value={fund.nav.record.value} currency={fund.nav.record.currency} bare />
            )
          }
          hint={
            fund.nav === null
              ? `en ${fund.currency}`
              : `au ${new Date(`${fund.nav.record.navDate}T00:00:00Z`).toLocaleDateString("fr-CH", {
                  timeZone: "UTC",
                })}, en ${fund.nav.record.currency}`
          }
        />

        {holding === null ? (
          <Stat
            label="Ma position"
            value={<span className="text-base text-stale">Aucune</span>}
            hint="Ce fonds n'est rattaché à aucune position."
          />
        ) : (
          <Stat
            label="Ma position"
            value={
              holding.marketValueBase === null ? (
                <Unavailable reason="Aucun cours fiable ne permet de valoriser cette position" />
              ) : (
                <Money value={holding.marketValueBase} currency={holding.baseCurrency} bare />
              )
            }
            hint={
              <>
                <Quantity value={holding.quantity} /> parts · {holding.accountName}
              </>
            }
          />
        )}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-tertiary">{navExplanation(fund)}</p>

      {/*
       * Les caractéristiques du fonds sont repliées : elles servent à vérifier
       * qu'on regarde la bonne classe de parts — question décisive, mais posée
       * une fois. Dépliées, elles reléguaient la NAV et la position en haut
       * d'une liste de huit lignes.
       */}
      <details className="group mt-2">
        <summary className="flex min-h-[var(--pl-touch-target)] cursor-pointer list-none items-center justify-between gap-3 text-sm text-secondary">
          <span>Caractéristiques du fonds</span>
          <span aria-hidden="true" className="text-xs text-tertiary group-open:hidden">
            Afficher
          </span>
          <span aria-hidden="true" className="hidden text-xs text-tertiary group-open:inline">
            Masquer
          </span>
        </summary>
        <dl className="mt-1">
          <Row label="Classe de parts">
            {fund.shareClass ?? <span className="text-stale">Non communiquée</span>}
          </Row>
          <Row label="Devise">
            <span className="pl-numeric">{fund.currency}</span>
          </Row>
          <Row label="Fréquence de publication">{NAV_FREQUENCY_LABEL[fund.frequency]}</Row>
          {fund.isAccumulating === null ? null : (
            <Row label="Revenus">{fund.isAccumulating ? "Capitalisés" : "Distribués"}</Row>
          )}
          {fund.domicileCountry === null ? null : (
            <Row label="Domiciliation">{fund.domicileCountry}</Row>
          )}
          <Row label="NAV connues">
            <span className="pl-numeric">{fund.navCount}</span>
          </Row>
        </dl>
      </details>
    </Card>
  );
}

export default async function FondsPage(): Promise<React.JSX.Element> {
  const [view, funds] = await Promise.all([loadPortfolioView(), listFunds()]);

  /*
   * Rattache chaque fonds à la position détenue, s'il y en a une.
   *
   * Un même fonds pourrait être détenu sur deux comptes ; le cas n'existe pas
   * encore dans le modèle — une position par instrument et par compte — donc la
   * première correspondance suffit, et le compte est affiché pour lever toute
   * ambiguïté sur celle qui est montrée.
   */
  const valuationById = new Map(
    (view.valuation?.positions ?? []).map((value) => [value.positionId, value]),
  );
  const holdings = new Map<string, FundHolding>();
  for (const position of view.positions) {
    if (holdings.has(position.instrumentId)) continue;
    const value = valuationById.get(position.positionId);
    holdings.set(position.instrumentId, {
      quantity: position.quantity,
      marketValueBase: value?.marketValueBase ?? null,
      baseCurrency: (value?.baseCurrency ?? view.valuation?.baseCurrency ?? "CHF") as CurrencyCode,
      accountName: position.accountName,
      positionId: position.positionId,
    });
  }

  return (
    <>
      <PageHeader
        title="Fonds de placement"
        subtitle="Dernière valeur nette d'inventaire publiée, et sa date."
      />
      <DemoBanner mode={view.mode} />

      {funds.length === 0 ? (
        <EmptyState
          title="Aucun fonds enregistré"
          lines={[
            "Les fonds de placement sont valorisés par leur dernière NAV publiée, jamais par un cours intraday.",
            "La date de la NAV, la classe de parts et la fréquence de publication sont affichées pour chaque fonds.",
          ]}
          action={{ href: "/ajouter", label: "Ajouter un fonds" }}
        />
      ) : (
        <>
          <ul className="space-y-4">
            {funds.map((fund) => (
              <FundCard
                key={fund.instrumentId}
                fund={fund}
                holding={holdings.get(fund.instrumentId) ?? null}
              />
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-secondary">
            La fraîcheur d&apos;une NAV se juge en <strong>jours ouvrés</strong> et selon la
            fréquence de publication du fonds : une valeur publiée vendredi n&apos;est pas en retard
            le lundi. Aucune NAV n&apos;est interpolée entre deux publications.
          </p>
        </>
      )}
    </>
  );
}
