import { cx } from "./ui";

/**
 * En-tête d'écran.
 *
 * L'ancienne version empilait un titre de 24 px et un sous-titre sur deux
 * lignes, soit près de 90 px consommés en haut de chacun des neuf écrans avant
 * la moindre donnée. Sur un iPhone 390×844, ce bloc plus le bandeau de
 * démonstration repoussaient le patrimoine total sous la ligne de flottaison.
 *
 * Le titre reste un `h1` de taille franche — c'est le repère de la page — mais
 * le sous-titre devient une ligne de méta discrète, et `action` permet de poser
 * un état ou un lien sur la même rangée plutôt qu'en dessous.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: Readonly<{
  title: string;
  subtitle?: string | undefined;
  /** Contenu aligné à droite du titre : statut des données, lien secondaire. */
  action?: React.ReactNode | undefined;
  className?: string | undefined;
}>): React.JSX.Element {
  return (
    <header className={cx("mb-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[1.625rem] leading-tight font-semibold tracking-tight text-primary">
          {title}
        </h1>
        {action ?? null}
      </div>
      {subtitle === undefined ? null : (
        <p className="mt-0.5 text-[13px] leading-snug text-tertiary">{subtitle}</p>
      )}
    </header>
  );
}
