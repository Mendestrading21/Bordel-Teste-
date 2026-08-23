/**
 * Tokens visuels de PortfolioLab — direction « obsidienne sombre, cuivre discret ».
 *
 * Chaque couleur de texte, d'accent et d'état a été vérifiée à un contraste
 * >= 4.5:1 sur `backgroundCanvas` (WCAG AA texte normal). Voir
 * `contrast.test.ts` qui rejoue le calcul et fait échouer la CI si une valeur
 * dérive.
 */
export const colorTokens = {
  /** Fond de page, l'obsidienne de référence. */
  backgroundCanvas: "#0B0E11",
  /** Fond des cartes et sections. */
  backgroundSurface: "#12161B",
  /** Fond des éléments survolés, menus et feuilles modales. */
  backgroundElevated: "#1A2027",
  /** Séparateurs discrets ; jamais utilisé pour du texte. */
  borderSubtle: "#262E37",
  /** Texte principal. */
  textPrimary: "#ECEFF3",
  /** Texte secondaire, labels et métadonnées. */
  textSecondary: "#9AA6B2",
  /** Accent cuivre : titres courts, actifs de navigation, focus. Jamais de long paragraphe. */
  accentCopper: "#C87F4A",
  /** Performance positive. */
  positive: "#4FB286",
  /** Performance négative. */
  negative: "#E06C68",
  /** Avertissement (donnée différée, marché fermé). */
  warning: "#E0A458",
  /** Donnée périmée ou indisponible. */
  stale: "#8C93A1",
} as const;

export type ColorToken = keyof typeof colorTokens;

/** Échelle d'espacement en pixels, base 4. */
export const spacingTokens = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const;

export const radiusTokens = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

/**
 * Taille minimale d'une cible tactile, en pixels.
 *
 * Référence WCAG 2.5.5 / Apple HIG : 44px. Toute zone interactive de
 * l'interface doit atteindre cette dimension sur mobile.
 */
export const MIN_TOUCH_TARGET_PX = 44;

/** Points de rupture vérifiés à chaque revue visuelle. */
export const viewportTargets = [
  { name: "iPhone 12/13/14", width: 390, height: 844 },
  { name: "iPhone 14/15 Pro Max", width: 430, height: 932 },
  { name: "Tablette", width: 768, height: 1024 },
  { name: "Desktop", width: 1280, height: 900 },
] as const;
