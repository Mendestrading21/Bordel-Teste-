/**
 * Exécute la matrice de couverture et écrit le rapport.
 *
 * Le rapport est écrit sous deux formes : JSON pour être rejoué et comparé,
 * Markdown pour être lu. Les deux sont versionnés — c'est la trace qui justifie
 * le choix d'un fournisseur, pas une conclusion sans preuve.
 *
 * Usage : pnpm run coverage:matrix
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Le script est exécuté par `tsx` : les packages du workspace sont publiés en
 * TypeScript source et importent avec l'extension `.js`, que le résolveur natif
 * de Node ne réécrit pas vers `.ts`.
 */
import {
  CANDIDATE_PROVIDERS,
  ProviderRegistry,
  createMockProvider,
  runCoverageMatrix,
} from "@portfolio-lab/market-data";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const definition = JSON.parse(
  readFileSync(join(ROOT, "tests/coverage-matrix/instruments.json"), "utf8"),
);

/**
 * Instruments simulés correspondant à la matrice.
 *
 * Le fournisseur simulé connaît volontairement une partie seulement des
 * instruments : une matrice où tout est trouvé ne prouverait pas que le rapport
 * sait signaler une lacune.
 */
const MOCK_KNOWN = [
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    assetType: "STOCK",
    currency: "USD",
    exchangeMic: "XNAS",
    isin: "US0378331005",
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    assetType: "STOCK",
    currency: "USD",
    exchangeMic: "XNAS",
    isin: "US5949181045",
  },
  {
    symbol: "NESN",
    name: "Nestlé SA",
    assetType: "STOCK",
    currency: "CHF",
    exchangeMic: "XSWX",
    isin: "CH0038863350",
  },
  {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    assetType: "ETF",
    currency: "USD",
    exchangeMic: "ARCX",
    isin: "US78462F1030",
  },
  {
    symbol: "IWDA",
    name: "iShares Core MSCI World UCITS ETF",
    assetType: "ETF",
    currency: "USD",
    exchangeMic: "XAMS",
    isin: "IE00B4L5Y983",
  },
  {
    symbol: "PICTET-WATER-P",
    name: "Pictet - Water P EUR",
    assetType: "MUTUAL_FUND",
    currency: "EUR",
    exchangeMic: null,
    isin: "LU0104884860",
  },
  {
    symbol: "AAPL270115C00200000",
    name: "AAPL CALL 200 15/01/2027",
    assetType: "OPTION",
    currency: "USD",
    exchangeMic: "XCBO",
    isin: null,
    optionContract: {
      underlyingSymbol: "AAPL",
      optionType: "CALL",
      expiration: "2027-01-15",
      strike: "200",
      multiplier: "100",
      osiSymbol: "AAPL270115C00200000",
      exerciseStyle: "AMERICAN",
      settlementType: "PHYSICAL",
    },
  },
];

const registry = new ProviderRegistry();
registry.register({
  id: "mock",
  label: "Fournisseur simulé",
  capabilities: createMockProvider({ instruments: [] }).capabilities(),
  verification: "FIXTURE_TESTED",
  blockedBy: "Données simulées : ne remplace aucun fournisseur réel.",
  apiKeyEnvVar: null,
  documentationUrl: "packages/market-data/src/mock-provider.ts",
  create: () =>
    createMockProvider({
      instruments: MOCK_KNOWN,
      fxRates: new Map([
        ["USD/CHF", "0.89"],
        ["EUR/CHF", "0.94"],
      ]),
      now: () => new Date(FIXED_NOW),
    }),
});
for (const candidate of CANDIDATE_PROVIDERS) {
  registry.register(candidate);
}

// Horodatage fixe : le rapport doit être identique d'une exécution à l'autre,
// sans quoi le comparer à la version précédente n'a pas de sens.
const FIXED_NOW = process.env.COVERAGE_MATRIX_NOW ?? "2026-08-23T00:00:00.000Z";

const report = await runCoverageMatrix(
  definition,
  registry.list(),
  process.env,
  () => new Date(FIXED_NOW),
);

const OUTCOME_SYMBOL = {
  RESOLVED: "✅",
  RESOLVED_NO_PRICE: "🟡",
  NOT_FOUND: "❌",
  AMBIGUOUS: "❓",
  UNSUPPORTED: "➖",
  ERROR: "🔥",
  NOT_RUN: "⬜",
};

function toMarkdown(report, definition) {
  const lines = [];
  lines.push("# Matrice de couverture — données de marché", "");
  lines.push(`- **Généré le** : ${report.generatedAt}`);
  lines.push(`- **Version de la définition** : ${report.definitionVersion}`);
  lines.push(`- **Instruments testés** : ${report.instrumentCount}`, "");

  lines.push("## Légende", "");
  lines.push("| Symbole | Signification |");
  lines.push("|---|---|");
  lines.push("| ✅ | Instrument résolu et valorisé |");
  lines.push("| 🟡 | Résolu, mais aucun prix disponible |");
  lines.push("| ❌ | Interrogé, instrument introuvable |");
  lines.push("| ❓ | Plusieurs candidats, aucun départage possible |");
  lines.push("| ➖ | Classe d'actifs non prise en charge |");
  lines.push("| 🔥 | Erreur d'appel : réseau, quota ou authentification |");
  lines.push("| ⬜ | **Jamais interrogé** — voir le motif de blocage |");
  lines.push("");
  lines.push(
    "⬜ n'est pas un échec de couverture : c'est l'absence de test. Confondre les",
    "deux transformerait une lacune de vérification en conclusion.",
    "",
  );

  lines.push("## État des fournisseurs", "");
  lines.push("| Fournisseur | Vérification | Bloqué par |");
  lines.push("|---|---|---|");
  for (const provider of report.providers) {
    lines.push(
      `| ${provider.providerLabel} | \`${provider.verification}\` | ${provider.blockedBy ?? "—"} |`,
    );
  }
  lines.push("");

  for (const category of definition.categories) {
    lines.push(`## ${category.label}`, "");
    lines.push(`Priorité ${category.priority}.`, "");
    const header = ["Instrument", "Identifiant", ...report.providers.map((p) => p.providerLabel)];
    lines.push(`| ${header.join(" | ")} |`);
    lines.push(`|${header.map(() => "---").join("|")}|`);

    for (const instrument of category.instruments) {
      const identifier =
        instrument.isin ??
        instrument.ticker ??
        (instrument.base ? `${instrument.base}/${instrument.quote}` : instrument.id);
      const row = [instrument.name, `\`${identifier}\``];
      for (const provider of report.providers) {
        const cell = provider.cells.find((c) => c.instrumentId === instrument.id);
        let text = OUTCOME_SYMBOL[cell?.outcome ?? "NOT_RUN"];
        if (cell?.outcome === "RESOLVED" && cell.freshness) {
          text += ` ${cell.freshness}`;
        }
        if (cell?.multiplierMismatch) {
          text += " ⚠️ multiplicateur";
        }
        row.push(text);
      }
      lines.push(`| ${row.join(" | ")} |`);
    }
    lines.push("");
  }

  lines.push("## Synthèse", "");
  lines.push("| Fournisseur | ✅ | 🟡 | ❌ | ➖ | 🔥 | ⬜ |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const provider of report.providers) {
    const count = (outcome) => provider.cells.filter((c) => c.outcome === outcome).length;
    lines.push(
      `| ${provider.providerLabel} | ${count("RESOLVED")} | ${count("RESOLVED_NO_PRICE")} | ` +
        `${count("NOT_FOUND")} | ${count("UNSUPPORTED")} | ${count("ERROR")} | ${count("NOT_RUN")} |`,
    );
  }
  lines.push("");

  return lines.join("\n");
}

const outDir = join(ROOT, "docs/market-data");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "coverage-matrix.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(outDir, "coverage-matrix.md"), toMarkdown(report, definition));

const summary = report.providers.map((p) => {
  const resolved = p.cells.filter((c) => c.outcome === "RESOLVED").length;
  const notRun = p.cells.filter((c) => c.outcome === "NOT_RUN").length;
  return `${p.providerLabel}: ${resolved} résolus, ${notRun} jamais interrogés`;
});
console.log(summary.join("\n"));
