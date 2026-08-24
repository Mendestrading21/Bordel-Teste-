import type { Metadata } from "next";
import Link from "next/link";

import {
  CONTRACT_WARNING_LABEL,
  MARK_METHOD_LABEL,
  MARK_REJECTION_LABEL,
  markOption,
  presentGreeks,
  DEFAULT_MARK_OPTIONS,
  type OptionType,
} from "@portfolio-lab/market-data";
import { toDecimalString, type DecimalString } from "@portfolio-lab/domain";
import { formatMoney, formatQuantity } from "@portfolio-lab/ui";

import { DemoBanner } from "@/components/demo-banner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { chainNavigation, selectContract } from "@/lib/data/options";
import { loadPortfolioView } from "@/lib/data/portfolio";

export const metadata: Metadata = { title: "Ajouter une option" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  underlying?: string;
  type?: string;
  expiration?: string;
  strike?: string;
}>;

/**
 * Étape du parcours guidé.
 *
 * Le parcours est en cinq temps — sous-jacent, call/put, échéance, strike,
 * vérification — plutôt qu'une saisie libre de symbole. Un symbole OSI mal tapé
 * désigne un **autre** contrat existant, pas une erreur, et la position serait
 * durablement fausse.
 */
function Step({
  number,
  title,
  done,
  children,
}: Readonly<{
  number: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <section className="rounded-token-lg border border-subtle bg-surface p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <span
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-token-pill border text-xs ${
            done ? "border-accent text-accent" : "border-subtle text-secondary"
          }`}
        >
          {number}
        </span>
        <span className={done ? "text-primary" : "text-secondary"}>{title}</span>
      </h2>
      {children}
    </section>
  );
}

function Choice({
  href,
  label,
  selected,
}: Readonly<{ href: string; label: string; selected: boolean }>): React.JSX.Element {
  return (
    <Link
      href={href as never}
      className={`inline-flex min-h-[var(--pl-touch-target)] items-center justify-center rounded-token-md border px-4 text-sm transition-colors ${
        selected
          ? "border-accent bg-elevated text-accent"
          : "border-subtle text-secondary hover:text-primary"
      }`}
      style={{ transitionDuration: "var(--pl-transition-fast)" }}
    >
      {label}
    </Link>
  );
}

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

export default async function AjouterOptionPage({
  searchParams,
}: Readonly<{ searchParams: SearchParams }>): Promise<React.JSX.Element> {
  const params = await searchParams;
  const view = await loadPortfolioView();

  const underlying = params.underlying ?? null;
  const optionType =
    params.type === "CALL" || params.type === "PUT" ? (params.type as OptionType) : null;
  const expiration = params.expiration ?? null;
  const strike = params.strike ?? null;

  const navigation = await chainNavigation(underlying, optionType, expiration);

  const now = new Date();
  const selection =
    underlying !== null && optionType !== null && expiration !== null && strike !== null
      ? await selectContract(
          underlying,
          { optionType, expiration, strike: toDecimalString(strike) },
          now,
        )
      : null;

  const query = (next: Record<string, string | null>): string => {
    const search = new URLSearchParams();
    const merged = { underlying, type: optionType, expiration, strike, ...next };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== null && value !== undefined) {
        search.set(key, value);
      }
    }
    return `/ajouter/option?${search.toString()}`;
  };

  if (navigation.underlyings.length === 0) {
    return (
      <>
        <PageHeader title="Ajouter une option" subtitle="Sélection guidée du contrat exact." />
        <DemoBanner mode={view.mode} />
        <EmptyState
          title="Aucune chaîne d'options disponible"
          lines={[
            "Aucun fournisseur de chaînes d'options n'est intégré : ni clé d'API ni accès réseau ne sont disponibles.",
            "Le parcours de sélection est en place et testé ; il servira dès qu'un adaptateur existera.",
          ]}
        />
      </>
    );
  }

  const mark =
    selection === null
      ? null
      : markOption(
          {
            instrumentId: selection.contract.providerSymbol,
            provider: "fixture",
            providerSymbol: selection.contract.providerSymbol,
            currency: selection.contract.currency as never,
            price: (selection.contract.last ?? "0") as DecimalString,
            priceType: "LAST_TRADE",
            freshness: "MANUAL",
            asOf: new Date().toISOString(),
            receivedAt: new Date().toISOString(),
            ...(selection.contract.bid === undefined ? {} : { bid: selection.contract.bid }),
            ...(selection.contract.ask === undefined ? {} : { ask: selection.contract.ask }),
          },
          { ...DEFAULT_MARK_OPTIONS, now },
        );

  return (
    <>
      <Link href="/ajouter" className="mb-4 inline-block text-sm text-accent hover:underline">
        ← Retour à l&apos;ajout
      </Link>
      <PageHeader
        title="Ajouter une option"
        subtitle="Sélection guidée : sous-jacent, sens, échéance, strike, puis vérification."
      />
      <DemoBanner mode={view.mode} />

      <div className="space-y-4">
        <Step number={1} title="Sous-jacent" done={underlying !== null}>
          <div className="flex flex-wrap gap-2">
            {navigation.underlyings.map((symbol) => (
              <Choice
                key={symbol}
                href={`/ajouter/option?underlying=${symbol}`}
                label={symbol}
                selected={underlying === symbol}
              />
            ))}
          </div>
        </Step>

        {underlying === null ? null : (
          <Step number={2} title="Sens du contrat" done={optionType !== null}>
            <div className="flex flex-wrap gap-2">
              <Choice
                href={query({ type: "CALL", expiration: null, strike: null })}
                label="Call"
                selected={optionType === "CALL"}
              />
              <Choice
                href={query({ type: "PUT", expiration: null, strike: null })}
                label="Put"
                selected={optionType === "PUT"}
              />
            </div>
          </Step>
        )}

        {optionType === null ? null : (
          <Step number={3} title="Échéance" done={expiration !== null}>
            <div className="flex flex-wrap gap-2">
              {navigation.expirations.map((date) => (
                <Choice
                  key={date}
                  href={query({ expiration: date, strike: null })}
                  label={new Date(`${date}T00:00:00Z`).toLocaleDateString("fr-CH", {
                    timeZone: "UTC",
                  })}
                  selected={expiration === date}
                />
              ))}
            </div>
          </Step>
        )}

        {expiration === null ? null : (
          <Step number={4} title="Strike" done={strike !== null}>
            {navigation.strikes.length === 0 ? (
              <p className="text-sm text-secondary">
                Aucun strike disponible pour cette échéance et ce sens.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {navigation.strikes.map((value) => (
                  <Choice
                    key={value}
                    href={query({ strike: value })}
                    label={formatQuantity(value)}
                    selected={strike !== null && Number(strike) === Number(value)}
                  />
                ))}
              </div>
            )}
          </Step>
        )}

        {strike === null ? null : (
          <Step number={5} title="Vérification du contrat" done={selection !== null}>
            {selection === null ? (
              <p className="text-sm text-negative">
                Aucun contrat ne correspond exactement à cette combinaison. Aucun contrat approchant
                n&apos;est proposé : ce serait un autre contrat, pas celui voulu.
              </p>
            ) : (
              <>
                <dl>
                  <Row label="Symbole canonique">
                    <span className="pl-numeric">
                      {selection.contract.osiSymbol ?? "non publié"}
                    </span>
                  </Row>
                  <Row label="Multiplicateur">
                    <span className="pl-numeric">
                      {formatQuantity(selection.contract.multiplier)}
                    </span>
                  </Row>
                  <Row label="Devise">
                    <span className="pl-numeric">{selection.contract.currency}</span>
                  </Row>
                  <Row label="Jours avant échéance">
                    <span className="pl-numeric">{selection.daysRemaining}</span>
                  </Row>
                  <Row label="Bid">
                    {selection.contract.bid === undefined ? (
                      <span className="text-stale">—</span>
                    ) : (
                      <span className="pl-numeric">
                        {formatMoney(selection.contract.bid, "USD")}
                      </span>
                    )}
                  </Row>
                  <Row label="Ask">
                    {selection.contract.ask === undefined ? (
                      <span className="text-stale">—</span>
                    ) : (
                      <span className="pl-numeric">
                        {formatMoney(selection.contract.ask, "USD")}
                      </span>
                    )}
                  </Row>
                  <Row label="Dernier échange">
                    {selection.contract.last === undefined ? (
                      <span className="text-stale">—</span>
                    ) : (
                      <span className="pl-numeric">
                        {formatMoney(selection.contract.last, "USD")}
                      </span>
                    )}
                  </Row>
                  <Row label="Prix de valorisation retenu">
                    {mark === null || !mark.ok ? (
                      <span className="text-stale">Aucun prix exploitable</span>
                    ) : (
                      <span className="pl-numeric">{formatMoney(mark.mark.price, "USD")}</span>
                    )}
                  </Row>
                  <Row label="Méthode de valorisation">
                    {mark === null || !mark.ok ? (
                      <span className="text-stale">—</span>
                    ) : (
                      MARK_METHOD_LABEL[mark.mark.method]
                    )}
                  </Row>
                </dl>

                {mark !== null && mark.ok && mark.mark.rejections.length > 0 ? (
                  <p className="mt-3 text-xs leading-relaxed text-secondary">
                    {/*
                      Les motifs sont traduits : afficher l'identifiant interne
                      SPREAD_TOO_WIDE n'apprendrait rien à l'utilisateur.
                    */}
                    Le milieu de fourchette n&apos;a pas été retenu —{" "}
                    {mark.mark.rejections
                      .map((rejection) => MARK_REJECTION_LABEL[rejection])
                      .join(" ; ")}
                    .
                  </p>
                ) : null}

                {selection.warnings.length > 0 ? (
                  <ul className="mt-3 space-y-2" role="status">
                    {selection.warnings.map((warning) => (
                      <li
                        key={warning.kind}
                        className="rounded-token-sm border border-warning/40 px-3 py-2 text-xs leading-relaxed text-warning"
                      >
                        {CONTRACT_WARNING_LABEL[warning.kind]}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <p className="mt-4 text-xs leading-relaxed text-secondary">
                  {presentGreeks(null).available
                    ? ""
                    : "Aucune sensibilité (delta, gamma, thêta) n'est affichée : PortfolioLab n'en calcule aucune, et le fournisseur simulé n'en publie pas."}
                </p>

                <p className="mt-4 rounded-token-md border border-subtle px-3 py-2 text-xs leading-relaxed text-secondary">
                  L&apos;enregistrement d&apos;une position d&apos;option depuis cet écran arrive
                  avec le premier fournisseur réel. En attendant, la position peut être saisie
                  manuellement depuis{" "}
                  <Link href="/ajouter" className="text-accent hover:underline">
                    l&apos;ajout standard
                  </Link>
                  .
                </p>
              </>
            )}
          </Step>
        )}
      </div>
    </>
  );
}
