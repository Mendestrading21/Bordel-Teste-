import type { Metadata } from "next";

import { ArchiveAccountForm, CreateAccountForm } from "@/components/account-forms";
import { DemoBanner } from "@/components/demo-banner";
import { PageHeader } from "@/components/page-header";
import { loadPortfolioView } from "@/lib/data/portfolio";

export const metadata: Metadata = { title: "Réglages" };
export const dynamic = "force-dynamic";

function SettingRow({
  label,
  value,
}: Readonly<{ label: string; value: string }>): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-subtle py-3 last:border-b-0">
      <dt className="text-sm text-secondary">{label}</dt>
      <dd className="pl-numeric text-right text-sm text-primary">{value}</dd>
    </div>
  );
}

const MODE_LABEL = {
  demo: "Démonstration locale — données fictives",
  database: "Base de données PostgreSQL",
  unavailable: "Aucune source de données",
} as const;

export default async function ReglagesPage(): Promise<React.JSX.Element> {
  const view = await loadPortfolioView();

  return (
    <>
      <PageHeader title="Réglages" subtitle="Devise, comptes, fournisseurs et données." />
      <DemoBanner mode={view.mode} />

      <section className="rounded-token-lg border border-subtle bg-surface p-5">
        <h2 className="mb-2 text-base font-medium text-primary">Configuration</h2>
        <dl>
          <SettingRow
            label="Devise de consolidation"
            value={view.portfolio?.base_currency ?? "CHF"}
          />
          <SettingRow label="Source des données" value={MODE_LABEL[view.mode.kind]} />
          <SettingRow label="Fournisseur de cours actif" value="Aucun — fixtures de test" />
          <SettingRow label="Connexions bancaires" value="Aucune, par conception" />
        </dl>
      </section>

      <section className="mt-4 rounded-token-lg border border-subtle bg-surface p-5">
        <h2 className="mb-1 text-base font-medium text-primary">Comptes</h2>
        <p className="mb-3 text-sm text-secondary">
          Étiquettes d&apos;organisation uniquement. Aucun identifiant, aucun mot de passe, aucune
          connexion à un établissement.
        </p>

        {view.accounts.length === 0 ? (
          <p className="border-t border-subtle py-3 text-sm text-secondary">
            Aucun compte pour le moment.
          </p>
        ) : (
          <ul className="mb-4">
            {view.accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between gap-4 border-b border-subtle py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-primary">{account.name}</p>
                  {account.institution_label === null ? null : (
                    <p className="truncate text-xs text-secondary">{account.institution_label}</p>
                  )}
                </div>
                <ArchiveAccountForm accountId={account.id} name={account.name} />
              </li>
            ))}
          </ul>
        )}

        {view.mode.kind === "unavailable" ? (
          <p className="text-sm text-stale">{view.mode.reason}</p>
        ) : (
          <div className="border-t border-subtle pt-4">
            <h3 className="mb-3 text-sm font-medium text-primary">Nouveau compte</h3>
            <CreateAccountForm />
          </div>
        )}
      </section>

      <section className="mt-4 rounded-token-lg border border-subtle bg-surface p-5">
        <h2 className="mb-2 text-base font-medium text-primary">
          Ce que l&apos;application ne fait pas
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-secondary">
          <li>aucune connexion à une banque ou à un courtier ;</li>
          <li>aucun mot de passe bancaire demandé ou conservé ;</li>
          <li>aucun ordre d&apos;achat ou de vente, sous aucune forme ;</li>
          <li>aucune donnée différée, NAV ou manuelle présentée comme « en direct ».</li>
        </ul>
      </section>
    </>
  );
}
