import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { colorTokens } from "@portfolio-lab/ui";
import { describe, expect, it } from "vitest";

/**
 * Les couleurs du chrome PWA doivent suivre la palette.
 *
 * `theme_color` peint la barre d'état iOS et le chrome Android ;
 * `background_color` peint l'écran de démarrage avant que le premier pixel de
 * l'application ne s'affiche. Ce sont les deux seuls endroits où une couleur
 * obsolète reste visible **sans** qu'aucune capture d'écran de l'application
 * ne la montre : la bande apparaît autour de la page, pas dedans.
 */
const manifest = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../public/manifest.webmanifest", import.meta.url)),
    "utf8",
  ),
) as Record<string, unknown>;

const layout = readFileSync(fileURLToPath(new URL("./layout.tsx", import.meta.url)), "utf8");

describe("chrome PWA", () => {
  it("le manifeste peint le fond de l'application", () => {
    expect(manifest["theme_color"]).toBe(colorTokens.backgroundCanvas);
    expect(manifest["background_color"]).toBe(colorTokens.backgroundCanvas);
  });

  it("la barre d'état suit la même couleur", () => {
    const declared = /themeColor:\s*"(#[0-9A-Fa-f]{6})"/.exec(layout)?.[1];
    expect(declared).toBe(colorTokens.backgroundCanvas);
  });

  it("le manifeste reste celui d'une application privée installable", () => {
    // Garde-fou : ce fichier est édité à la main, et une refonte visuelle est
    // exactement le moment où l'on casse une clé sans s'en apercevoir.
    expect(manifest["display"]).toBe("standalone");
    expect(manifest["start_url"]).toBe("/");
    expect(Array.isArray(manifest["icons"])).toBe(true);
  });
});
