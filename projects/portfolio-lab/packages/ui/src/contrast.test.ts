import { describe, expect, it } from "vitest";

import { contrastRatio, parseHex, relativeLuminance, WCAG_AA_NORMAL_TEXT } from "./contrast.js";
import { colorTokens } from "./tokens.js";

describe("contrastRatio", () => {
  it("vaut 21 entre noir et blanc", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });

  it("vaut 1 pour une couleur avec elle-même", () => {
    expect(contrastRatio("#C6F04A", "#C6F04A")).toBeCloseTo(1, 10);
  });

  it("est symétrique", () => {
    expect(contrastRatio("#060D18", "#EEF2F7")).toBeCloseTo(
      contrastRatio("#EEF2F7", "#060D18"),
      10,
    );
  });

  it("refuse une couleur mal formée", () => {
    expect(() => parseHex("#FFF")).toThrow();
    expect(() => relativeLuminance("rouge")).toThrow();
  });
});

/**
 * Teinte d'une couleur, en degrés sur la roue chromatique.
 *
 * Le ratio de contraste ne mesure qu'une différence de clarté : deux couleurs
 * de teintes voisines mais de clartés différentes obtiennent un bon ratio tout
 * en restant confondables au premier coup d'œil. La teinte complète donc la
 * mesure là où le contraste ne dit rien.
 */
function hue(hex: string): number {
  const [r, g, b] = parseHex(hex).map((channel) => channel / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) {
    return 0;
  }
  const raw =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (raw * 60 + 360) % 360;
}

/** Écart de teinte le plus court entre deux couleurs, de 0 à 180 degrés. */
function hueGap(a: string, b: string): number {
  const raw = Math.abs(hue(a) - hue(b));
  return raw > 180 ? 360 - raw : raw;
}

describe("tokens — accessibilité AA sur les quatre fonds", () => {
  /**
   * Toute couleur susceptible de porter du texte ou un chiffre. Chacune est
   * vérifiée sur les quatre niveaux de fond, y compris `backgroundSurface3`,
   * le plus clair et donc le plus exigeant : c'est lui qui fixe le plancher.
   */
  const readable = [
    "textPrimary",
    "textSecondary",
    "textTertiary",
    "accentLime",
    "positive",
    "negative",
    "info",
    "warning",
    "stale",
  ] as const;

  const grounds = [
    "backgroundCanvas",
    "backgroundSurface",
    "backgroundElevated",
    "backgroundSurface3",
  ] as const;

  const combinations = readable.flatMap((token) =>
    grounds.map((ground) => [token, ground] as const),
  );

  it.each(combinations)("%s atteint AA texte normal sur %s", (token, ground) => {
    const ratio = contrastRatio(colorTokens[token], colorTokens[ground]);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("couvre bien les quatre fonds", () => {
    // Garde-fou contre un test creux : si un fond disparaissait de `grounds`,
    // la matrice rétrécirait sans qu'aucune assertion n'échoue.
    expect(combinations).toHaveLength(readable.length * 4);
  });

  it("garde le texte posé sur l'accent lisible", () => {
    // La chartreuse est claire : le texte d'un bouton principal doit être
    // sombre, pas blanc.
    const ratio = contrastRatio(colorTokens.accentForeground, colorTokens.accentLime);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("distingue positive et negative autrement que par la seule teinte", () => {
    // Garde-fou : les deux couleurs doivent rester nettement différentes pour
    // que le daltonisme rouge/vert ne rende pas la lecture ambiguë. Le signe
    // textuel reste de toute façon obligatoire dans l'interface.
    expect(colorTokens.positive).not.toBe(colorTokens.negative);
    const gap = Math.abs(
      relativeLuminance(colorTokens.positive) - relativeLuminance(colorTokens.negative),
    );
    expect(gap).toBeGreaterThan(0.05);
  });

  it("sépare l'accent de l'avertissement", () => {
    // Le cuivre d'origine (#C87F4A, teinte 25°) était à 12° de l'ambre
    // d'avertissement (#E0A458, 37°) : « fais ceci » et « attention » se
    // ressemblaient. Ce seuil ferme la porte à une dérive du même genre.
    expect(hueGap(colorTokens.accentLime, colorTokens.warning)).toBeGreaterThan(30);
  });

  it("sépare l'accent des couleurs de performance", () => {
    // L'accent ne doit ressembler ni à un gain ni à une perte, sans quoi un
    // bouton d'action se lirait comme un résultat financier.
    expect(hueGap(colorTokens.accentLime, colorTokens.positive)).toBeGreaterThan(30);
    expect(hueGap(colorTokens.accentLime, colorTokens.negative)).toBeGreaterThan(30);
  });
});
