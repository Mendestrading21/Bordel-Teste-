import type { CurrencyCode } from "@portfolio-lab/domain";
import type { ReconciliationResult } from "@portfolio-lab/portfolio-engine";

import { Money } from "./money";

/**
 * Réconciliation des agrégats.
 *
 * Le critère d'acceptation du lot est que « tous les agrégats se réconcilient
 * avec les positions et les taux stockés ». Vérifier cette identité en test
 * seulement laisserait l'utilisateur sans moyen de le constater : elle est donc
 * recalculée à chaque rendu et affichée.
 *
 * La comparaison est en **égalité décimale stricte**. Les montants sont exacts
 * de bout en bout ; tolérer un écart d'un centime reviendrait à masquer un
 * défaut réel du moteur derrière une marge d'arrondi imaginaire.
 */
export function Reconciliation({
  result,
  fingerprint,
  currency,
}: Readonly<{
  result: ReconciliationResult;
  fingerprint: string;
  currency: CurrencyCode;
}>): React.JSX.Element {
  if (result.consistent) {
    return (
      /*
       * Pas de `role="status"` ici : le panneau est du contenu statique, pas
       * une notification. Le déclarer région vivante le ferait annoncer à
       * chaque chargement, et diluerait l'alerte qui compte réellement — celle
       * de la branche ci-dessous.
       */
      <section className="mt-4 rounded-token-md border border-subtle bg-surface px-4 py-3">
        <h2 className="text-xs tracking-wide text-secondary uppercase">Réconciliation</h2>
        <p className="mt-1 text-sm text-secondary">
          La somme des positions correspond exactement aux totaux affichés, au centième de centime
          près.
        </p>
        <p className="mt-2 text-xs text-secondary">
          Empreinte des composants :{" "}
          <span className="pl-numeric" title="Identifie les cours et taux ayant produit ce calcul">
            {fingerprint}
          </span>
        </p>
      </section>
    );
  }

  return (
    <section
      role="alert"
      className="mt-4 rounded-token-md border border-negative/40 bg-surface px-4 py-3"
    >
      <h2 className="text-xs font-semibold tracking-wide text-negative uppercase">
        Écart de réconciliation
      </h2>
      <p className="mt-1 text-sm text-secondary">
        Les totaux ne correspondent pas à la somme des positions. Les chiffres affichés ne peuvent
        pas être considérés comme fiables tant que cet écart subsiste.
      </p>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-secondary">Valeur de marché</dt>
          <dd>
            <Money value={result.marketValueDelta} currency={currency} colored />
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-secondary">Capital investi</dt>
          <dd>
            <Money value={result.costBasisDelta} currency={currency} colored />
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-secondary">P&amp;L latent</dt>
          <dd>
            <Money value={result.pnlDelta} currency={currency} colored />
          </dd>
        </div>
      </dl>
    </section>
  );
}
