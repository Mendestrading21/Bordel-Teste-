import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Configuration ESLint plate du workspace.
 *
 * Le typage strict est déjà assuré par `tsc` ; ESLint sert ici aux règles que
 * le compilateur ne couvre pas, et notamment aux garde-fous propres au produit.
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      // Régénéré par `next build` à chaque compilation.
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      // Garde-fou financier : les montants passent par decimal.js, jamais par
      // les fonctions numériques natives approximatives.
      "no-restricted-globals": [
        "error",
        {
          name: "parseFloat",
          message: "Utiliser decimal() du package @portfolio-lab/domain pour les montants.",
        },
      ],
    },
  },
  {
    // Scripts d'outillage exécutés directement par Node : globals Node
    // disponibles et sortie stdout légitime.
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
    rules: { "no-console": "off" },
  },
  {
    // Point d'entrée du processus : journalise son démarrage.
    files: ["apps/market-gateway/src/main.ts"],
    rules: { "no-console": "off" },
  },
  {
    // Le service worker s'exécute dans un contexte worker, pas dans le DOM.
    files: ["apps/web/public/sw.js"],
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.browser },
      sourceType: "script",
    },
  },
  {
    // Règles propres à Next.js sur l'application web uniquement.
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      // App Router exclusivement : il n'existe pas de répertoire `pages/`.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
