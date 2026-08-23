/**
 * Génère les icônes PWA de PortfolioLab.
 *
 * Les icônes sont dessinées ici plutôt qu'importées d'un outil graphique pour
 * qu'elles restent reproductibles et vérifiables : `pnpm icons:check` régénère
 * et compare, ce qui empêche un binaire opaque d'entrer dans le dépôt.
 *
 * Encodage PNG minimal (RGBA, non entrelacé) via `zlib`, sans dépendance.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "apps",
  "web",
  "public",
  "icons",
);

const CANVAS = [0x0b, 0x0e, 0x11];
const COPPER = [0xc8, 0x7f, 0x4a];
const COPPER_DIM = [0x8a, 0x59, 0x33];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // profondeur 8 bits
  header[9] = 6; // RGBA
  // Chaque ligne est préfixée par son octet de filtre (0 = None).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Marque PortfolioLab : trois barres cuivre ascendantes sur fond obsidienne.
 *
 * `padding` exprime la marge en fraction de la taille. Les icônes `maskable`
 * en demandent davantage, la zone sûre d'Android n'étant que 80 % du carré.
 */
function drawMark(size, padding) {
  const pixels = Buffer.alloc(size * size * 4);
  const inset = Math.round(size * padding);
  const inner = size - inset * 2;
  const barGap = Math.max(1, Math.round(inner * 0.09));
  const barWidth = Math.floor((inner - barGap * 2) / 3);
  const baseline = inset + inner;
  const heights = [0.42, 0.68, 1.0].map((ratio) => Math.round(inner * ratio));
  const colors = [COPPER_DIM, COPPER_DIM, COPPER];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let color = CANVAS;
      for (let bar = 0; bar < 3; bar += 1) {
        const left = inset + bar * (barWidth + barGap);
        const top = baseline - heights[bar];
        if (x >= left && x < left + barWidth && y >= top && y < baseline) {
          color = colors[bar];
          break;
        }
      }
      const offset = (y * size + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 0xff;
    }
  }
  return encodePng(size, pixels);
}

const ICONS = [
  { file: "icon-192.png", size: 192, padding: 0.2 },
  { file: "icon-512.png", size: 512, padding: 0.2 },
  { file: "icon-maskable-512.png", size: 512, padding: 0.28 },
  { file: "apple-touch-icon.png", size: 180, padding: 0.2 },
];

export function buildIcons() {
  return ICONS.map((icon) => ({ ...icon, data: drawMark(icon.size, icon.padding) }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const icon of buildIcons()) {
    writeFileSync(join(OUT_DIR, icon.file), icon.data);
    console.log(`écrit ${icon.file} (${icon.size}px, ${icon.data.length} octets)`);
  }
}
