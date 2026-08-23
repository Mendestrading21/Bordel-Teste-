import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { colorTokens, MIN_TOUCH_TARGET_PX, radiusTokens, spacingTokens } from "./tokens.js";

const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");

/** Lit la valeur d'une variable CSS déclarée dans `:root`. */
function cssVar(name: string): string | undefined {
  const match = new RegExp(`--pl-${name}:\\s*([^;]+);`).exec(css);
  return match?.[1]?.trim();
}

/** `camelCase` -> `kebab-case`, la convention des variables CSS. */
function toKebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

describe("tokens.css reste synchronisé avec tokens.ts", () => {
  it.each(Object.entries(colorTokens))("expose --pl-%s", (name, value) => {
    expect(cssVar(toKebab(name))).toBe(value.toLowerCase());
  });

  it.each(Object.entries(spacingTokens))("expose --pl-space-%s", (name, value) => {
    expect(cssVar(`space-${name}`)).toBe(`${value}px`);
  });

  it.each(Object.entries(radiusTokens))("expose --pl-radius-%s", (name, value) => {
    expect(cssVar(`radius-${name}`)).toBe(`${value}px`);
  });

  it("expose la cible tactile minimale", () => {
    expect(cssVar("touch-target")).toBe(`${MIN_TOUCH_TARGET_PX}px`);
  });

  it("neutralise les transitions sous prefers-reduced-motion", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toMatch(/--pl-transition-base:\s*0ms/);
  });
});
