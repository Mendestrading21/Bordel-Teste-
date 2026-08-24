import { describe, expect, it } from "vitest";

import {
  BUTTON_BASE,
  BUTTON_SIZE,
  BUTTON_VARIANT,
  CARD_PADDING,
  CARD_TONE,
  CHIP_TONE,
  cx,
  STAT_LABEL_SIZE,
  STAT_VALUE_SIZE,
  TEXT_TONE,
  type ButtonSize,
  type ButtonVariant,
  type CardTone,
  type Tone,
} from "./styles";

const TONES: readonly Tone[] = [
  "neutral",
  "positive",
  "negative",
  "warning",
  "stale",
  "accent",
  "info",
];

const BUTTON_VARIANTS: readonly ButtonVariant[] = ["primary", "secondary", "ghost", "danger"];
const BUTTON_SIZES: readonly ButtonSize[] = ["md", "lg"];
const CARD_TONES: readonly CardTone[] = ["surface", "elevated", "raised", "outline", "accent"];

describe("cx", () => {
  it("ignore les valeurs absentes", () => {
    expect(cx("a", undefined, null, false, "", "b")).toBe("a b");
  });

  it("ne produit rien quand tout est absent", () => {
    expect(cx(undefined, false)).toBe("");
  });
});

describe("boutons", () => {
  it.each(BUTTON_SIZES)("la taille %s atteint la cible tactile minimale", (size) => {
    // 44px est le plancher WCAG 2.5.5. `md` lit le token, `lg` le dépasse ;
    // aucune taille ne doit passer dessous, sans quoi la règle deviendrait
    // décorative.
    const declared = BUTTON_SIZE[size];
    const usesToken = declared.includes("min-h-[var(--pl-touch-target)]");
    const explicit = /min-h-\[(\d+)px\]/.exec(declared);
    expect(usesToken || Number(explicit?.[1] ?? 0) >= 44).toBe(true);
  });

  it.each(BUTTON_VARIANTS)("la variante %s définit un traitement visuel", (variant) => {
    expect(BUTTON_VARIANT[variant].trim()).not.toBe("");
  });

  it("réserve l'aplat d'accent à la variante primaire", () => {
    // L'accent plein est le signal « action principale ». S'il apparaissait sur
    // une deuxième variante, il cesserait de désigner quoi que ce soit.
    const filled = BUTTON_VARIANTS.filter((variant) =>
      BUTTON_VARIANT[variant].includes("bg-accent"),
    );
    expect(filled).toEqual(["primary"]);
  });

  it("pose un texte sombre sur l'aplat d'accent", () => {
    // La chartreuse est claire : un texte blanc dessus tomberait sous AA. Le
    // ratio lui-même est vérifié dans `packages/ui/src/contrast.test.ts`.
    expect(BUTTON_VARIANT.primary).toContain("text-accent-foreground");
  });

  it("désactive visiblement un bouton inactif", () => {
    expect(BUTTON_BASE).toContain("disabled:opacity-50");
    expect(BUTTON_BASE).toContain("disabled:cursor-not-allowed");
  });
});

describe("tons", () => {
  it.each(TONES)("le ton %s a une couleur de texte", (tone) => {
    expect(TEXT_TONE[tone].trim()).not.toBe("");
  });

  it.each(TONES)("le ton %s a un style de pastille", (tone) => {
    expect(CHIP_TONE[tone].trim()).not.toBe("");
  });

  it("couvre exactement les tons déclarés", () => {
    // Garde-fou contre un test creux : si un ton était ajouté au type sans
    // entrée dans les tables, les `it.each` ci-dessus ne le verraient pas.
    expect(Object.keys(TEXT_TONE).sort()).toEqual([...TONES].sort());
    expect(Object.keys(CHIP_TONE).sort()).toEqual([...TONES].sort());
  });

  it("distingue le positif du négatif", () => {
    expect(TEXT_TONE.positive).not.toBe(TEXT_TONE.negative);
    expect(CHIP_TONE.positive).not.toBe(CHIP_TONE.negative);
  });
});

describe("cartes", () => {
  it("couvre exactement les tons de carte déclarés", () => {
    expect(Object.keys(CARD_TONE).sort()).toEqual([...CARD_TONES].sort());
  });

  it.each(CARD_TONES)("le ton de carte %s pose un fond ou une bordure", (tone) => {
    expect(/\b(bg|border)-/.test(CARD_TONE[tone])).toBe(true);
  });

  it("laisse `none` sans marge intérieure", () => {
    // Utilisé quand une carte contient un tableau qui doit toucher les bords.
    expect(CARD_PADDING.none).toBe("");
  });
});

describe("échelle des chiffres", () => {
  it("réserve une taille distincte au chiffre dominant", () => {
    // `hero` porte le patrimoine total. S'il partageait la taille de `lg`,
    // l'écran d'accueil n'aurait plus de point d'entrée visuel.
    const sizes = Object.values(STAT_VALUE_SIZE);
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it("décroît de hero à sm", () => {
    expect(STAT_VALUE_SIZE.hero).toContain("2.5rem");
    expect(STAT_VALUE_SIZE.lg).toContain("text-2xl");
    expect(STAT_VALUE_SIZE.md).toContain("text-lg");
    expect(STAT_VALUE_SIZE.sm).toContain("text-sm");
  });

  it("garde le libellé plus discret que la valeur à toutes les tailles", () => {
    for (const size of ["hero", "lg", "md", "sm"] as const) {
      expect(STAT_LABEL_SIZE[size]).toContain("text-xs");
    }
  });
});
