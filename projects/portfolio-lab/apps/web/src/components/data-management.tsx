"use client";

import { useActionState, useState } from "react";

import { deleteEverythingAction } from "@/lib/data/actions";
import { DELETION_CONFIRMATION, type ActionResult } from "@/lib/data/validation";

import { FieldError, FormMessage, SubmitButton } from "./form-status";

const INITIAL: ActionResult = { status: "idle" };

/**
 * Sauvegarde des données.
 *
 * Un lien, pas un bouton d'action : le fichier est produit par une route qui
 * répond avec un `Content-Disposition`. Passer par une action serveur
 * obligerait à reconstruire le fichier dans l'onglet, donc à charger tout le
 * patrimoine en mémoire côté navigateur pour rien.
 */
export function ExportSection(): React.JSX.Element {
  return (
    <section className="mt-4 rounded-token-lg border border-subtle bg-surface p-5">
      <h2 className="mb-1 text-base font-medium text-primary">Sauvegarde</h2>
      <p className="mb-3 text-sm leading-relaxed text-secondary">
        Le fichier contient vos comptes, vos positions et votre historique patrimonial. Les cours
        n&apos;y figurent pas : ce sont des données de marché, différentes au prochain chargement,
        et les inclure ferait croire que la sauvegarde fige une valorisation.
      </p>
      <p className="mb-4 text-sm leading-relaxed text-secondary">
        Il est lisible en clair. Conservez-le comme vous conserveriez un relevé.
      </p>
      <a
        href="/api/export"
        download
        className="inline-flex min-h-[var(--pl-touch-target)] items-center justify-center rounded-token-md border border-copper px-5 text-sm font-medium text-copper transition-colors hover:bg-elevated"
        style={{ transitionDuration: "var(--pl-transition-fast)" }}
      >
        Télécharger ma sauvegarde
      </a>
    </section>
  );
}

/**
 * Suppression définitive.
 *
 * Le bouton reste inactif tant que le mot de confirmation n'est pas recopié
 * exactement. Le serveur revérifie ce mot : une garde purement visuelle se
 * contourne en une requête.
 */
export function DeletionSection(): React.JSX.Element {
  const [result, action] = useActionState(deleteEverythingAction, INITIAL);
  /*
   * Le champ est **non contrôlé** : le DOM porte la valeur, l'état ne sert
   * qu'à armer le bouton.
   *
   * Avec `value={...}`, une saisie qui n'est pas une frappe caractère par
   * caractère — un collage, un remplissage automatique — peut désynchroniser
   * l'état React de la valeur affichée : le champ montre le bon mot et le
   * bouton reste inactif. Or coller le mot depuis le libellé juste au-dessus
   * est exactement ce qu'un utilisateur fera.
   */
  const [armed, setArmed] = useState(false);

  return (
    <section className="mt-4 rounded-token-lg border border-negative/30 bg-surface p-5">
      <h2 className="mb-1 text-base font-medium text-negative">Supprimer toutes mes données</h2>
      <p className="mb-3 text-sm leading-relaxed text-secondary">
        Comptes, positions, contrats d&apos;option et historique patrimonial sont effacés
        définitivement. Cette action ne peut pas être annulée et aucune sauvegarde n&apos;est
        conservée : téléchargez la vôtre d&apos;abord si vous en voulez une.
      </p>

      <form action={action}>
        <label htmlFor="confirmation" className="block text-sm text-primary">
          Recopiez <span className="pl-numeric font-semibold">{DELETION_CONFIRMATION}</span> pour
          confirmer
        </label>
        <input
          id="confirmation"
          name="confirmation"
          type="text"
          autoComplete="off"
          defaultValue=""
          onChange={(event) => setArmed(event.target.value === DELETION_CONFIRMATION)}
          aria-describedby="confirmation-error"
          className="mt-2 mb-3 min-h-[var(--pl-touch-target)] w-full rounded-token-md border border-subtle bg-canvas px-3 text-primary"
        />
        <FieldError result={result} field="confirmation" />

        <fieldset disabled={!armed} className="disabled:opacity-50">
          <SubmitButton>Supprimer définitivement</SubmitButton>
        </fieldset>
        <FormMessage result={result} />
      </form>
    </section>
  );
}
