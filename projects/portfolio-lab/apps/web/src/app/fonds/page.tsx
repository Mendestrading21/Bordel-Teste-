import type { Metadata } from "next";

import { NAV_FREQUENCY_LABEL } from "@portfolio-lab/market-data";
import { formatMoney } from "@portfolio-lab/ui";

import { DemoBanner } from "@/components/demo-banner";
import { EmptyState } from "@/components/empty-state";
import { FreshnessBadge } from "@/components/freshness-badge";
import { PageHeader } from "@/components/page-header";
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

function FundCard({ fund }: Readonly<{ fund: FundView }>): React.JSX.Element {
  return (
    <li className="rounded-token-lg border border-subtle bg-surface px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium text-primary">{fund.name}</h2>
          {fund.isin === null ? null : (
            <p className="pl-numeric mt-0.5 text-xs text-secondary">{fund.isin}</p>
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

      <dl className="mt-3">
        <Row label="Dernière NAV">
          {fund.nav === null ? (
            <span className="text-stale">Indisponible</span>
          ) : (
            <span className="pl-numeric">
              {formatMoney(fund.nav.record.value, fund.nav.record.currency)}
            </span>
          )}
        </Row>
        <Row label="Date de la NAV">
          {fund.nav === null ? (
            <span className="text-stale">—</span>
          ) : (
            <span className="pl-numeric">
              {new Date(`${fund.nav.record.navDate}T00:00:00Z`).toLocaleDateString("fr-CH", {
                timeZone: "UTC",
              })}
            </span>
          )}
        </Row>
        <Row label="Classe de parts">
          {fund.shareClass ?? <span className="text-secondary">Non communiquée</span>}
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

      <p className="mt-3 text-xs leading-relaxed text-secondary">{navExplanation(fund)}</p>
    </li>
  );
}

export default async function FondsPage(): Promise<React.JSX.Element> {
  const [view, funds] = await Promise.all([loadPortfolioView(), listFunds()]);

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
              <FundCard key={fund.instrumentId} fund={fund} />
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
