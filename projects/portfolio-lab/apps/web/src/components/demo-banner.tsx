import type { DataMode } from "@/lib/data/mode";

/**
 * Bandeau permanent du mode démonstration.
 *
 * Il ne peut pas être masqué et n'est pas discret : un écran de chiffres qui
 * ressemble à un portefeuille réel alors qu'il est fictif est exactement ce que
 * la règle produit interdit.
 */
export function DemoBanner({ mode }: Readonly<{ mode: DataMode }>): React.JSX.Element | null {
  if (mode.kind !== "demo") {
    return null;
  }
  return (
    <div
      role="note"
      className="mb-4 rounded-token-md border border-accent/50 bg-elevated px-4 py-3"
    >
      <p className="text-xs font-semibold tracking-wide text-accent uppercase">
        Mode démonstration
      </p>
      <p className="mt-1 text-sm leading-relaxed text-secondary">
        Toutes les positions et tous les cours affichés sont <strong>fictifs</strong>. Les cours
        proviennent d&apos;un jeu de test et sont marqués « Manuel » ou « Dernière NAV » : aucun
        n&apos;est un cours de marché.
      </p>
    </div>
  );
}
