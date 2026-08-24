import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const CSS = readFileSync(fileURLToPath(new URL("./globals.css", import.meta.url)), "utf8");

/**
 * Le réglage système « animations réduites » doit valoir pour **tout** l'écran.
 *
 * Les tokens `--pl-transition-*` passent à zéro sous
 * `prefers-reduced-motion: reduce`, mais les utilitaires Tailwind retombent
 * sinon sur leurs 150 ms codés en dur : seuls les composants qui pensaient à
 * réécrire la durée en style inline respectaient le réglage. Les autres
 * continuaient d'animer, et rien ne le signalait.
 */
describe("durée de transition par défaut", () => {
  it("est rattachée au token, jamais recopiée en dur", () => {
    const match = /--default-transition-duration:\s*([^;]+);/.exec(CSS);
    expect(match?.[1]?.trim()).toBe("var(--pl-transition-fast)");
  });

  it("n'est pas contournée par une durée écrite en dur dans le thème", () => {
    // Une valeur en millisecondes ici rendrait le réglage système inopérant
    // pour toute l'application d'un seul coup.
    expect(CSS).not.toMatch(/--default-transition-duration:\s*\d+m?s/);
  });
});
