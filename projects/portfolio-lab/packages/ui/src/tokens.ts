/**
 * Tokens visuels de PortfolioLab — direction « bleu-nuit premium, accent lime ».
 *
 * Design V2. Trois évolutions par rapport à la direction obsidienne d'origine :
 *
 * 1. le fond passe d'un gris neutre à un **bleu-nuit** : la profondeur vient de
 *    la teinte, pas d'ombres portées, ce qui reste net sur écran OLED ;
 * 2. **trois** niveaux de surface au lieu de deux, pour hiérarchiser sans
 *    empiler des bordures ;
 * 3. l'accent devient une **chartreuse adoucie**. Le cuivre `#C87F4A` était à
 *    une teinte de l'ambre d'avertissement `#E0A458` : deux rôles opposés — «
 *    fais ceci » et « attention » — se ressemblaient.
 *
 * `positive` reste vert, distinct de l'accent : sans quoi un bouton d'action et
 * un gain porteraient la même couleur.
 *
 * Chaque couleur de texte, d'accent et d'état atteint un contraste >= 4.5:1 sur
 * les **quatre** fonds, y compris `backgroundSurface3`, le plus clair. Voir
 * `contrast.test.ts`, qui rejoue le calcul et fait échouer la CI si une valeur
 * dérive.
 */
export const colorTokens = {
  /** Fond de page, bleu-nuit profond. */
  backgroundCanvas: "#060D18",
  /** Surface 1 — cartes et sections posées sur le fond. */
  backgroundSurface: "#0E1725",
  /** Surface 2 — champs, éléments survolés, feuilles modales. */
  backgroundElevated: "#16202F",
  /** Surface 3 — pastilles et éléments posés sur une surface 2. */
  backgroundSurface3: "#1D2839",
  /** Séparateurs discrets ; jamais utilisé pour du texte. */
  borderSubtle: "#1E2836",
  /** Bordure marquée : contour d'un champ actif, carte mise en avant. */
  borderStrong: "#2C3A4D",
  /** Texte principal. */
  textPrimary: "#EEF2F7",
  /** Texte secondaire, labels et métadonnées. */
  textSecondary: "#9FB0C4",
  /** Texte tertiaire : micro-labels, unités, mentions de bas de carte. */
  textTertiary: "#7E90A8",
  /** Accent chartreuse : CTA principal, onglet actif, focus, point clé d'un graphique. */
  accentLime: "#C6F04A",
  /** Texte posé **sur** l'accent. Presque noir : la chartreuse est très claire. */
  accentForeground: "#0A1005",
  /** Performance positive. Volontairement distinct de l'accent. */
  positive: "#63D89A",
  /** Performance négative. */
  negative: "#F2607E",
  /** Information : série secondaire d'un graphique. Jamais un état métier. */
  info: "#4CC9F0",
  /** Avertissement (donnée différée, marché fermé). */
  warning: "#F0B450",
  /** Donnée périmée ou indisponible. */
  stale: "#8290A4",
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
