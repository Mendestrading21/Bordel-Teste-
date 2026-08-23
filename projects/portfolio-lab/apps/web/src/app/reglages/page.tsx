import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Réglages" };

/** Ligne d'information en lecture seule. */
function SettingRow({
  label,
  value,
}: Readonly<{ label: string; value: string }>): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-subtle py-3 last:border-b-0">
      <dt className="text-sm text-secondary">{label}</dt>
      <dd className="pl-numeric text-sm text-primary">{value}</dd>
    </div>
  );
}

export default function ReglagesPage(): React.JSX.Element {
  return (
    <>
      <PageHeader title="Réglages" subtitle="Devise, comptes, fournisseurs et données." />

      <section className="rounded-token-lg border border-subtle bg-surface p-5">
        <h2 className="mb-2 text-base font-medium text-primary">Configuration</h2>
        <dl>
          <SettingRow label="Devise de consolidation" value="CHF" />
          <SettingRow label="Fournisseur de données actif" value="Aucun" />
          <SettingRow label="Connexions bancaires" value="Aucune, par conception" />
        </dl>
      </section>

      <section className="mt-4 rounded-token-lg border border-subtle bg-surface p-5">
        <h2 className="mb-2 text-base font-medium text-primary">
          Ce que l'application ne fait pas
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
