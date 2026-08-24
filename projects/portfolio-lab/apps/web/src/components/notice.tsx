import { cx, type Tone } from "./ui";

/**
 * Bandeau d'information compact.
 *
 * Les bandeaux de l'application — mode démonstration, hors ligne, état de
 * session — occupaient chacun un pavé de quatre lignes, répété en haut des neuf
 * écrans. Sur un iPhone, cela poussait le patrimoine total hors du premier
 * écran : l'utilisateur ouvrait l'application et devait faire défiler pour voir
 * le chiffre pour lequel il l'avait ouverte.
 *
 * La forme retenue garde **l'essentiel toujours visible** — un titre et une
 * phrase courte — et replie l'explication dans un `<details>` natif. Rien n'est
 * masqué par JavaScript : le contenu reste dans le document, lisible par un
 * lecteur d'écran, et présent même quand le script n'aboutit pas — ce qui est
 * précisément le cas d'une page servie hors ligne.
 *
 * Ce qui est replié n'est jamais l'avertissement, seulement son explication.
 * « Mode démonstration — chiffres fictifs » reste lisible sans aucune
 * interaction : un bandeau qu'il faudrait déplier pour comprendre qu'on regarde
 * de faux chiffres ne respecterait pas la règle produit.
 *
 * La ligne visible est elle-même le déclencheur du dépliage. Elle atteint donc
 * la cible tactile de 44 px sans ajouter de second bouton, là où un lien
 * « en savoir plus » séparé aurait coûté une rangée de plus sur chaque écran.
 */

const TONE_TEXT: Readonly<Record<Tone, string>> = {
  neutral: "text-secondary",
  positive: "text-positive",
  negative: "text-negative",
  warning: "text-warning",
  stale: "text-stale",
  accent: "text-accent",
  info: "text-info",
};

const TONE_BORDER: Readonly<Record<Tone, string>> = {
  neutral: "border-subtle",
  positive: "border-positive/40",
  negative: "border-negative/40",
  warning: "border-warning/50",
  stale: "border-stale/50",
  accent: "border-accent/40",
  info: "border-info/40",
};

export function Notice({
  tone,
  label,
  summary,
  details,
  icon,
  role,
  className,
}: Readonly<{
  tone: Tone;
  /** Titre court, rendu comme un vrai `h2`. */
  label: string;
  /** Une phrase, toujours visible. */
  summary: React.ReactNode;
  /** Explication complète, repliée par défaut. */
  details?: React.ReactNode | undefined;
  icon?: string | undefined;
  role?: "note" | "status" | "alert" | undefined;
  className?: string | undefined;
}>): React.JSX.Element {
  /*
   * Les enfants sont posés directement dans le `<summary>`, sans conteneur
   * intermédiaire : le modèle de contenu d'un `summary` accepte du contenu de
   * phrasé et **un** titre, mais pas un `div` ou un `span` enveloppant un `h2`.
   * Le libellé reste donc un vrai `h2`, ce qui le rend atteignable par la
   * navigation par titres d'un lecteur d'écran.
   */
  const head = (
    <>
      {icon === undefined ? null : (
        <span aria-hidden="true" className="shrink-0 text-sm leading-none">
          {icon}
        </span>
      )}
      <h2 className={cx("shrink-0 text-xs font-semibold tracking-wide uppercase", TONE_TEXT[tone])}>
        {label}
      </h2>
      {/*
       * `basis-56` plutôt que `flex-1` : avec un conteneur `flex-wrap`, un
       * élément dont la base dépasse la place restante bascule sur la ligne
       * suivante au lieu d'être comprimé. Sans cette base, la phrase se tassait
       * en une colonne de quatre mots à droite du libellé sur iPhone.
       */}
      <span className="min-w-0 grow basis-56 text-sm leading-snug text-secondary">{summary}</span>
    </>
  );

  const row = "flex min-h-[var(--pl-touch-target)] flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5";

  return (
    <div
      role={role}
      {...(role === "status" ? { "aria-live": "polite" as const } : {})}
      className={cx("mb-3 rounded-token-lg border px-3", TONE_BORDER[tone], className)}
    >
      {details === undefined ? (
        <div className={row}>{head}</div>
      ) : (
        <details className="group">
          <summary
            className={cx(row, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}
          >
            {head}
            <span
              aria-hidden="true"
              className="shrink-0 text-xs text-tertiary transition-transform group-open:rotate-180"
            >
              ⌄
            </span>
          </summary>
          <div className="pb-3 text-sm leading-relaxed text-secondary">{details}</div>
        </details>
      )}
    </div>
  );
}
