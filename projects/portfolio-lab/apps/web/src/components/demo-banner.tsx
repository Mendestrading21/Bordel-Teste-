import type { DataMode } from "@/lib/data/mode";

import { Notice } from "./notice";

/**
 * Bandeau permanent du mode démonstration.
 *
 * Il ne peut pas être masqué : un écran de chiffres qui ressemble à un
 * portefeuille réel alors qu'il est fictif est exactement ce que la règle
 * produit interdit.
 *
 * Le mot « fictifs » est dans la ligne toujours visible, pas dans le détail
 * replié. Ce qui se replie n'est que le *pourquoi* — d'où viennent ces chiffres
 * et comment ils sont marqués.
 */
export function DemoBanner({ mode }: Readonly<{ mode: DataMode }>): React.JSX.Element | null {
  if (mode.kind !== "demo") {
    return null;
  }
  return (
    <Notice
      role="note"
      tone="accent"
      icon="🧪"
      label="Mode démonstration"
      summary={
        <>
          Toutes les positions et tous les cours affichés sont <strong>fictifs</strong>.
        </>
      }
      details={
        <>
          Les cours proviennent d&apos;un jeu de test et sont marqués « Manuel » ou « Dernière NAV »
          : aucun n&apos;est un cours de marché. Aucune connexion bancaire n&apos;existe et aucune
          donnée réelle n&apos;est lue.
        </>
      }
    />
  );
}
