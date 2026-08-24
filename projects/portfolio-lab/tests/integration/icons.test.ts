import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

// @ts-expect-error — script d'outillage en JavaScript, sans déclaration de types.
import * as generator from "../../scripts/generate-icons.mjs";

const buildIcons = generator.buildIcons as () => unknown[];

type GeneratedIcon = { file: string; size: number; padding: number; data: Buffer };

const icons = buildIcons() as GeneratedIcon[];

/**
 * Décode un PNG RGBA non entrelacé produit par `generate-icons.mjs`.
 *
 * On relit les pixels plutôt que de comparer les octets du fichier : la sortie
 * de `deflate` dépend de la version de zlib, ce qui rendrait une comparaison
 * binaire faussement rouge selon la machine. Le contenu visuel, lui, est
 * strictement déterministe.
 */
function decodePng(buffer: Buffer): {
  width: number;
  height: number;
  pixelAt: (x: number, y: number) => readonly [number, number, number, number];
} {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  expect([...buffer.subarray(0, 8)]).toEqual(signature);

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  expect(buffer[24]).toBe(8); // profondeur 8 bits
  expect(buffer[25]).toBe(6); // RGBA

  // Concatène les chunks IDAT avant décompression.
  const parts: Buffer[] = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") {
      parts.push(buffer.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }

  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * 4 + 1;

  return {
    width,
    height,
    pixelAt(x, y) {
      // Octet 0 de chaque ligne = filtre PNG ; le générateur écrit toujours 0.
      expect(raw[y * stride]).toBe(0);
      const base = y * stride + 1 + x * 4;
      return [raw[base]!, raw[base + 1]!, raw[base + 2]!, raw[base + 3]!];
    },
  };
}

/*
 * Les couleurs attendues viennent du générateur, qui les lit lui-même dans
 * `tokens.css`. Les recopier ici reviendrait à vérifier une constante contre
 * elle-même tout en créant un second endroit à mettre à jour.
 */
const CANVAS = [...(generator.CANVAS as number[]), 0xff];
const ACCENT = [...(generator.ACCENT as number[]), 0xff];

describe("génération des icônes PWA", () => {
  it("produit les quatre fichiers attendus par le manifeste", () => {
    expect(icons.map((icon) => icon.file).sort()).toEqual([
      "apple-touch-icon.png",
      "icon-192.png",
      "icon-512.png",
      "icon-maskable-512.png",
    ]);
  });

  it.each(icons)("$file est un PNG carré de $size px", (icon) => {
    const png = decodePng(icon.data);
    expect(png.width).toBe(icon.size);
    expect(png.height).toBe(icon.size);
  });

  it.each(icons)("$file peint le fond de l'application dans les coins", (icon) => {
    const png = decodePng(icon.data);
    expect([...png.pixelAt(0, 0)]).toEqual(CANVAS);
    expect([...png.pixelAt(icon.size - 1, 0)]).toEqual(CANVAS);
    expect([...png.pixelAt(0, icon.size - 1)]).toEqual(CANVAS);
  });

  it.each(icons)("$file dessine la barre d'accent la plus haute à droite", (icon) => {
    const png = decodePng(icon.data);
    const inset = Math.round(icon.size * icon.padding);
    // Sommet de la troisième barre : elle atteint le haut de la zone utile.
    const x = icon.size - inset - 2;
    expect([...png.pixelAt(x, inset + 2)]).toEqual(ACCENT);
  });

  it.each(icons)("$file laisse la marge de sécurité demandée", (icon) => {
    const png = decodePng(icon.data);
    const inset = Math.round(icon.size * icon.padding);
    // Juste au-dessus de la zone utile : encore du fond, jamais du dessin.
    expect([...png.pixelAt(Math.floor(icon.size / 2), Math.max(0, inset - 3))]).toEqual(CANVAS);
  });

  it("respecte la zone sûre plus large exigée par une icône maskable", () => {
    const standard = icons.find((icon) => icon.file === "icon-512.png");
    const maskable = icons.find((icon) => icon.file === "icon-maskable-512.png");
    expect(maskable?.padding).toBeGreaterThan(standard?.padding ?? 1);
  });

  it("correspond exactement aux fichiers versionnés dans public/icons", () => {
    for (const icon of icons) {
      const onDisk = readFileSync(
        new URL(`../../apps/web/public/icons/${icon.file}`, import.meta.url),
      );
      const expectedPng = decodePng(icon.data);
      const actualPng = decodePng(onDisk);
      expect(actualPng.width).toBe(expectedPng.width);
      // Échantillonne la diagonale plutôt que tous les pixels : suffisant pour
      // détecter une icône obsolète, sans alourdir la suite de tests.
      for (let i = 0; i < icon.size; i += Math.max(1, Math.floor(icon.size / 32))) {
        expect([...actualPng.pixelAt(i, i)], `${icon.file} pixel ${i}`).toEqual([
          ...expectedPng.pixelAt(i, i),
        ]);
      }
    }
  });
});
