import { describe, expect, it } from "vitest";

import { radiusTokens } from "./tokens.js";

/**
 * Plages du système de design V2, en pixels.
 *
 * Elles sont recopiées ici pour que le test dise **pourquoi** une valeur est
 * refusée. Une échelle de rayons dérive facilement : une carte à 10px et un
 * bouton à 16px donnent une interface qui paraît bâclée sans qu'aucune ligne de
 * code ne semble fautive.
 */
const RANGES = {
  sm: [8, 12],
  md: [14, 18],
  lg: [18, 22],
  xl: [24, 28],
} as const;

describe("échelle des rayons", () => {
  it.each(Object.entries(RANGES))("%s reste dans la plage du système", (name, [min, max]) => {
    const value = radiusTokens[name as keyof typeof RANGES];
    expect(value).toBeGreaterThanOrEqual(min);
    expect(value).toBeLessThanOrEqual(max);
  });

  it("croît strictement du plus petit au plus grand", () => {
    // Sans quoi deux rôles différents obtiendraient le même arrondi et la
    // hiérarchie visuelle disparaîtrait.
    const ordered = [radiusTokens.sm, radiusTokens.md, radiusTokens.lg, radiusTokens.xl];
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i]).toBeGreaterThan(ordered[i - 1] as number);
    }
  });

  it("garde une pastille complètement arrondie", () => {
    expect(radiusTokens.pill).toBeGreaterThanOrEqual(999);
  });
});
