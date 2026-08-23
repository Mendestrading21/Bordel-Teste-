/**
 * Barre de navigation mobile, conforme à `references/UX_UI.md`.
 *
 * `Ajouter` occupe volontairement la position centrale : c'est l'action que
 * l'utilisateur répète le plus, et la seule qui crée de la donnée.
 */
export type NavItem = {
  readonly href: string;
  readonly label: string;
  /** Décrit l'icône pour les lecteurs d'écran quand le libellé est tronqué. */
  readonly description: string;
};

/*
 * `satisfies` plutôt qu'une annotation de type : la forme est vérifiée contre
 * `NavItem` tout en conservant les chemins comme types littéraux, ce qu'exige
 * `typedRoutes` de Next.js pour valider chaque `<Link href>` à la compilation.
 */
export const NAV_ITEMS = [
  { href: "/", label: "Accueil", description: "Vue d'ensemble du patrimoine" },
  { href: "/positions", label: "Positions", description: "Liste détaillée des positions" },
  { href: "/ajouter", label: "Ajouter", description: "Ajouter un placement" },
  { href: "/analyse", label: "Analyse", description: "Allocation et performance" },
  { href: "/reglages", label: "Réglages", description: "Comptes, données et fournisseurs" },
] as const satisfies readonly NavItem[];

/** Chemin d'un onglet de navigation, exploitable par `typedRoutes`. */
export type NavHref = (typeof NAV_ITEMS)[number]["href"];

/**
 * Détermine l'onglet actif à partir du chemin courant.
 *
 * La racine exige une égalité stricte, sans quoi `/` serait considérée comme
 * active sur toutes les pages.
 */
export function isActiveNav(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
