import { cx, SECTION_TITLE } from "./styles";

/**
 * Bloc titré d'un écran.
 *
 * Le titre est un `h2` : la hiérarchie des titres est ce sur quoi s'appuie la
 * navigation par lecteur d'écran, elle ne peut pas être seulement visuelle.
 * `action` reçoit un lien optionnel aligné à droite du titre.
 */
export function Section({
  title,
  action,
  className,
  children,
}: Readonly<{
  title: string;
  action?: React.ReactNode | undefined;
  className?: string | undefined;
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <section className={cx("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={SECTION_TITLE}>{title}</h2>
        {action ?? null}
      </div>
      {children}
    </section>
  );
}
