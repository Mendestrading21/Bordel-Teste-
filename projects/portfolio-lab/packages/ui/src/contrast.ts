/**
 * Calcul de contraste WCAG 2.1, utilisé par les tests des tokens.
 *
 * Implémenté ici plutôt qu'importé pour que la vérification d'accessibilité ne
 * dépende d'aucun paquet externe et tourne dans la CI la plus minimale.
 */

const HEX_PATTERN = /^#([0-9a-fA-F]{6})$/;

export function parseHex(hex: string): readonly [number, number, number] {
  const match = HEX_PATTERN.exec(hex);
  if (!match?.[1]) {
    throw new Error(`Couleur hexadécimale invalide : ${hex}`);
  }
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Composante linéarisée sRGB, selon la formule WCAG. */
function linearize(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

/** Luminance relative d'une couleur hexadécimale. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** Ratio de contraste entre deux couleurs, de 1 à 21. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Seuil AA pour un texte normal. */
export const WCAG_AA_NORMAL_TEXT = 4.5;
/** Seuil AA pour un texte large ou un composant graphique. */
export const WCAG_AA_LARGE_TEXT = 3;
