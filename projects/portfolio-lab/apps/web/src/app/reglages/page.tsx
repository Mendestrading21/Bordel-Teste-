import type { Metadata } from "next";

import { CALCULATION_VERSION } from "@portfolio-lab/portfolio-engine";

import { ArchiveAccountForm, CreateAccountForm } from "@/components/account-forms";
import { DeletionSection, ExportSection } from "@/components/data-management";
import { LogoutSection } from "@/components/logout-section";
import { requireOwner } from "@/lib/auth/owner";
import { DemoBanner } from "@/components/demo-banner";
import { PageHeader } from "@/components/page-header";
import { Card, Chip } from "@/components/ui";
import { loadPortfolioView } from "@/lib/data/portfolio";
import { listProviderStatus } from "@/lib/data/providers";

export const metadata: Metadata = { title: "Réglages" };
export const dynamic = "force-dynamic";

/**
 * Section de réglages.
 *
 * L'émoji est un **marqueur sémantique**, masqué aux lecteurs d'écran : le
 * titre porte déjà le sens. Il sert à retrouver une section d'un coup d'œil
 * dans une page qui en compte sept, là où sept titres gris se confondaient.
 */
function Section({
  id,
  icon,
  title,
  children,
}: Readonly<{
  id: string;
  icon: string;
  title: string;
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <Card as="section" padding="md" className="mt-4" aria-labelledby={id}>
      <h2 id={id} className="flex items-center gap-2 text-base font-medium text-primary">
        <span aria-hidden="true">{icon}</span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

/**
 * Ligne « libellé — valeur » des réglages.
 *
 * Empilée sous 640 px, alignée à droite au-delà. Sur 390 px, une valeur longue
 * comme « Démonstration locale — données fictives » forçait le libellé et la
 * valeur à se replier **tous les deux** sur deux lignes, ce qui donnait quatre
 * fragments désalignés pour une seule information.
 */
function SettingRow({
  label,
  value,
}: Readonly<{ label: string; value: string }>): React.JSX.Element {
  return (
    <div className="border-b border-subtle py-2.5 last:border-b-0 sm:flex sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-secondary">{label}</dt>
      <dd className="pl-numeric mt-0.5 text-sm text-primary sm:mt-0 sm:text-right">{value}</dd>
    </div>
  );
}

const MODE_LABEL = {
  demo: "Démonstration locale — données fictives",
  database: "Base de données PostgreSQL",
  unavailable: "Aucune source de données",
} as const;

export default async function ReglagesPage(): Promise<React.JSX.Element> {
  await requireOwner();
  const view = await loadPortfolioView();
  const providers = listProviderStatus();

  /*
   * Explication commune à plusieurs fournisseurs, énoncée une seule fois.
   *
   * Quatre adaptateurs partagent mot pour mot le même motif de blocage : une
   * clé réelle manquante. Répété quatre fois, un paragraphe de cinq lignes
   * cesse d'être lu, et la seule ligne qui diffère — celle d'OpenFIGI, qui ne
   * fournit jamais de prix — se noyait au milieu.
   */
  const reasonCounts = new Map<string, number>();
  for (const provider of providers) {
    if (provider.blockedBy === null) continue;
    reasonCounts.set(provider.blockedBy, (reasonCounts.get(provider.blockedBy) ?? 0) + 1);
  }
  let sharedReason: string | null = null;
  for (const [reason, count] of reasonCounts) {
    if (count >= 2) sharedReason = reason;
  }

  return (
    <>
      <PageHeader title="Réglages" subtitle="Comptes, devise, données et confidentialité." />
      <DemoBanner mode={view.mode} />

      <Section id="acces" icon="👤" title="Profil et accès">
        <dl className="mt-2">
          <SettingRow label="Source des données" value={MODE_LABEL[view.mode.kind]} />
          <SettingRow
            label="Session"
            value={view.authenticated ? "Établie" : "Aucune identité établie"}
          />
          <SettingRow label="Connexions bancaires" value="Aucune, par conception" />
        </dl>
        {/*
         * Aucun réglage de compte utilisateur n'est proposé ici : il n'en
         * existe pas. Afficher une section « Profil » vide laisserait croire à
         * une fonctionnalité en panne.
         */}
        <p className="mt-2 text-xs leading-relaxed text-tertiary">
          L&apos;application est privée et mono-utilisateur : elle ne gère ni profil public, ni
          partage, ni invitation.
        </p>
      </Section>

      <Section id="comptes" icon="🏷️" title="Comptes">
        <p className="mt-1 text-sm text-secondary">
          Étiquettes d&apos;organisation uniquement. Aucun identifiant, aucun mot de passe, aucune
          connexion à un établissement.
        </p>

        {view.accounts.length === 0 ? (
          <p className="mt-3 border-t border-subtle py-3 text-sm text-stale">
            Aucun compte pour le moment.
          </p>
        ) : (
          <ul className="mt-3">
            {view.accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between gap-4 border-b border-subtle py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-primary">{account.name}</p>
                  {account.institution_label === null ? null : (
                    <p className="truncate text-xs text-tertiary">{account.institution_label}</p>
                  )}
                </div>
                <ArchiveAccountForm accountId={account.id} name={account.name} />
              </li>
            ))}
          </ul>
        )}

        {view.mode.kind === "unavailable" ? (
          <p className="mt-3 text-sm text-stale">{view.mode.reason}</p>
        ) : (
          /*
           * Le formulaire de création est replié : il sert une fois par compte,
           * soit trois ou quatre fois dans la vie de l'application, alors que la
           * liste au-dessus se consulte à chaque passage.
           */
          <details className="group mt-3 border-t border-subtle pt-2">
            <summary className="flex min-h-[var(--pl-touch-target)] cursor-pointer list-none items-center justify-between gap-3 text-sm text-accent">
              <span>Nouveau compte</span>
              <span aria-hidden="true" className="text-xs text-tertiary group-open:hidden">
                Afficher
              </span>
              <span aria-hidden="true" className="hidden text-xs text-tertiary group-open:inline">
                Masquer
              </span>
            </summary>
            <div className="mt-2">
              <CreateAccountForm />
            </div>
          </details>
        )}
      </Section>

      <Section id="donnees-marche" icon="🔄" title="Données de marché">
        <p className="mt-1 text-sm text-secondary">
          L&apos;état réel de chaque fournisseur, y compris ceux qui n&apos;ont jamais été appelés.
          Les masquer donnerait l&apos;impression que la couverture est complète.
        </p>

        {sharedReason === null ? null : (
          <p className="mt-2 rounded-token-sm border border-subtle px-3 py-2 text-xs leading-relaxed text-tertiary">
            {sharedReason}
          </p>
        )}

        <ul className="mt-3" data-pl-providers>
          {providers.map((provider) => (
            <li key={provider.id} className="border-b border-subtle py-2.5 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-primary">{provider.label}</span>
                <Chip tone={provider.usable ? "accent" : "stale"}>
                  {provider.verificationLabel}
                </Chip>
              </div>
              {/* Seul un motif qui lui est propre reste affiché sous le fournisseur. */}
              {provider.blockedBy === null || provider.blockedBy === sharedReason ? null : (
                <p className="mt-1 text-xs leading-relaxed text-tertiary">{provider.blockedBy}</p>
              )}
              {provider.apiKeyEnvVar === null ? null : (
                <p className="mt-1 text-xs text-tertiary">
                  Clé attendue : <code className="pl-numeric">{provider.apiKeyEnvVar}</code> —{" "}
                  {provider.apiKeyPresent ? "présente dans l'environnement" : "absente"}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="devise" icon="💱" title="Devise">
        <dl className="mt-2">
          <SettingRow
            label="Devise de consolidation"
            value={view.portfolio?.base_currency ?? "CHF"}
          />
        </dl>
        <p className="mt-2 text-xs leading-relaxed text-tertiary">
          Toutes les valeurs consolidées sont exprimées dans cette devise. Le taux appliqué à chaque
          position est conservé et reste consultable sur sa fiche.
        </p>
      </Section>

      <ExportSection />

      <Section id="confidentialite" icon="🛡️" title="Confidentialité">
        <p className="mt-1 text-sm text-secondary">Ce que l&apos;application ne fait pas :</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-secondary">
          <li>aucune connexion à une banque ou à un courtier ;</li>
          <li>aucun mot de passe bancaire demandé ou conservé ;</li>
          <li>aucun ordre d&apos;achat ou de vente, sous aucune forme ;</li>
          <li>aucune donnée différée, NAV ou manuelle présentée comme « en direct ».</li>
        </ul>
      </Section>

      <Section id="a-propos" icon="ℹ️" title="À propos">
        <dl className="mt-2">
          <SettingRow label="Moteur de calcul" value={CALCULATION_VERSION} />
          <SettingRow label="Fournisseurs déclarés" value={String(providers.length)} />
          <SettingRow
            label="Fournisseurs réellement interrogeables"
            value={String(providers.filter((provider) => provider.usable).length)}
          />
        </dl>
        <p className="mt-2 text-xs leading-relaxed text-tertiary">
          Un instantané d&apos;historique n&apos;est comparable qu&apos;à un autre produit par la
          même version du moteur.
        </p>
      </Section>

      <LogoutSection />

      {/*
       * Zone irréversible, isolée en bas et séparée du reste.
       *
       * Elle ne partage aucune bordure avec les sections précédentes : une
       * action définitive ne doit pas se trouver à un pouce d'un réglage
       * anodin.
       */}
      <div className="mt-8 border-t border-negative/20 pt-4">
        <h2 className="flex items-center gap-2 text-xs tracking-wide text-negative uppercase">
          <span aria-hidden="true">⚠️</span>
          Zone irréversible
        </h2>
        <DeletionSection />
      </div>
    </>
  );
}
