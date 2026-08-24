/**
 * Tables de classes des primitives d'interface.
 *
 * Elles vivent dans un fichier `.ts` séparé des composants `.tsx` pour une
 * raison pratique : le projet de tests unitaires tourne sous Node sans DOM et
 * ne collecte que les `*.test.ts`. Extraire les classes rend vérifiable ce qui
 * compte vraiment — la cible tactile, la présence d'un ton pour chaque cas —
 * sans monter une pile de rendu React pour l'affirmer.
 */

/** Fusionne des classes en ignorant les valeurs absentes. */
export function cx(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === "string" && part !== "").join(" ");
}

/* ------------------------------------------------------------------ Card */

export type CardTone = "surface" | "elevated" | "raised" | "outline" | "accent";
export type CardPadding = "none" | "sm" | "md" | "lg";

/**
 * Les cartes se distinguent par leur **niveau de surface**, pas par une ombre
 * portée : sur un fond bleu-nuit très sombre, une ombre ne se voit pas, alors
 * qu'un demi-ton de fond se lit immédiatement.
 */
export const CARD_TONE: Readonly<Record<CardTone, string>> = {
  surface: "bg-surface border border-subtle",
  elevated: "bg-elevated border border-subtle",
  raised: "bg-raised border border-strong",
  outline: "border border-subtle",
  accent: "bg-surface border border-accent/40",
};

export const CARD_PADDING: Readonly<Record<CardPadding, string>> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

export const CARD_BASE = "rounded-token-lg";

/* ------------------------------------------------------------------ Stat */

export type StatSize = "hero" | "lg" | "md" | "sm";
export type Tone = "neutral" | "positive" | "negative" | "warning" | "stale" | "accent" | "info";

/**
 * Échelle des chiffres. `hero` est réservé au patrimoine total : un seul par
 * écran, sans quoi plus rien ne domine.
 */
export const STAT_VALUE_SIZE: Readonly<Record<StatSize, string>> = {
  hero: "text-[2.125rem] leading-none font-semibold tracking-tight",
  lg: "text-2xl leading-tight font-semibold tracking-tight",
  md: "text-lg leading-tight font-semibold",
  sm: "text-sm leading-tight font-medium",
};

export const STAT_LABEL_SIZE: Readonly<Record<StatSize, string>> = {
  hero: "text-xs tracking-wide uppercase",
  lg: "text-xs tracking-wide uppercase",
  md: "text-xs",
  sm: "text-xs",
};

/** Couleur du texte selon le ton. Le signe reste toujours écrit à côté. */
export const TEXT_TONE: Readonly<Record<Tone, string>> = {
  neutral: "text-primary",
  positive: "text-positive",
  negative: "text-negative",
  warning: "text-warning",
  stale: "text-stale",
  accent: "text-accent",
  info: "text-info",
};

/* ------------------------------------------------------------------ Chip */

/**
 * Pastilles. La bordure teintée porte le ton sans peindre un aplat : un aplat
 * de couleur pleine sur un écran de chiffres attire l'œil au mauvais endroit.
 */
export const CHIP_TONE: Readonly<Record<Tone, string>> = {
  neutral: "border-subtle text-secondary",
  positive: "border-positive/40 text-positive",
  negative: "border-negative/40 text-negative",
  warning: "border-warning/40 text-warning",
  stale: "border-stale/50 text-stale",
  accent: "border-accent/40 text-accent",
  info: "border-info/40 text-info",
};

export const CHIP_BASE =
  "inline-flex items-center gap-1 rounded-token-sm border px-2 py-0.5 text-[11px] font-medium";

/* ---------------------------------------------------------------- Button */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

/**
 * Un seul bouton `primary` par écran. C'est lui qui porte l'aplat chartreuse ;
 * s'il y en avait deux, l'accent cesserait d'indiquer quoi que ce soit.
 */
export const BUTTON_VARIANT: Readonly<Record<ButtonVariant, string>> = {
  primary: "bg-accent text-accent-foreground hover:opacity-90",
  secondary: "border border-accent text-accent hover:bg-elevated",
  ghost: "border border-subtle text-secondary hover:bg-elevated hover:text-primary",
  danger: "border border-negative text-negative hover:bg-elevated",
};

/**
 * Toute hauteur atteint la cible tactile minimale de 44px (WCAG 2.5.5).
 * `min-h-[var(--pl-touch-target)]` lit la valeur du token plutôt que de la
 * recopier, pour qu'un changement de token se propage.
 */
export const BUTTON_SIZE: Readonly<Record<ButtonSize, string>> = {
  md: "min-h-[var(--pl-touch-target)] px-5 text-sm",
  lg: "min-h-[52px] px-6 text-base",
};

export const BUTTON_BASE = cx(
  "inline-flex items-center justify-center gap-2 rounded-token-md font-medium",
  "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
);

/* --------------------------------------------------------------- Section */

export const SECTION_TITLE = "text-sm font-semibold tracking-wide text-secondary uppercase";
