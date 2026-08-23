import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Hors ligne" };

/**
 * Page de secours hors ligne.
 *
 * Elle n'apparaît que dans un cas précis : le réseau manque **et** la page
 * demandée n'a jamais été consultée. Une page déjà visitée est servie depuis le
 * cache, avec son bandeau d'âge.
 *
 * Elle est volontairement statique : elle doit pouvoir être précachée à
 * l'installation du service worker, donc ne dépendre d'aucune session ni
 * d'aucune donnée.
 */
export default function HorsLignePage(): React.JSX.Element {
  return (
    <>
      <PageHeader title="Hors ligne" subtitle="Cet écran n'a pas encore été consulté." />
      <EmptyState
        title="Aucune version enregistrée de cette page"
        lines={[
          "PortfolioLab conserve les écrans que vous avez déjà ouverts, pour vous les remontrer sans réseau — avec la date à laquelle ils ont été chargés.",
          "Celui-ci n'a jamais été affiché sur cet appareil : il n'y a donc rien à montrer, et inventer des chiffres serait pire que cet écran.",
          "Les écrans déjà consultés restent accessibles depuis la navigation ci-dessous.",
        ]}
      />
    </>
  );
}
