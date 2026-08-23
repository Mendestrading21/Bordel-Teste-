import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Politique de sécurité du contenu.
 *
 * `'unsafe-inline'` sur `script-src` reste nécessaire : Next.js injecte des
 * scripts inline pour l'hydratation, et passer à une politique par nonce
 * demande un middleware dédié. Limite assumée, consignée comme dette.
 *
 * `'unsafe-eval'` est ajouté **en développement uniquement**. Ce n'est pas un
 * confort : `next dev` compile avec des source maps en `eval()`, et sans cette
 * autorisation le navigateur refuse tout le bundle client. L'application
 * s'affichait alors correctement — le rendu serveur suffit — mais **aucun
 * composant client n'était hydraté**. Les formulaires continuaient de
 * fonctionner par soumission native, ce qui masquait complètement le problème,
 * y compris dans les parcours E2E de la voie démonstration, qui tournent sur
 * `next dev`.
 *
 * La politique de production, elle, n'autorise jamais `eval` — un test le
 * vérifie.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  // Aucune ressource tierce, aucun cadre : l'application est autonome.
  "frame-src 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/**
 * En-têtes de sécurité appliqués à toutes les réponses.
 *
 * Restreindre dès le premier lot est un choix délibéré : élargir une politique
 * pour une intégration précise reste simple, alors que resserrer une politique
 * permissive une fois l'application écrite ne se fait jamais.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Les packages du workspace sont publiés en TypeScript source, pas compilés.
  transpilePackages: [
    "@portfolio-lab/domain",
    "@portfolio-lab/ui",
    "@portfolio-lab/database",
    "@portfolio-lab/portfolio-engine",
    "@portfolio-lab/market-data",
    "@portfolio-lab/security",
  ],
  typedRoutes: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  /*
   * Les packages du workspace importent avec l'extension `.js`, exigée par
   * `verbatimModuleSyntax` pour produire de l'ESM valide. Webpack doit donc
   * savoir qu'un spécificateur `.js` peut être servi par un fichier `.ts`.
   *
   * Sans cet alias, `import "./errors.js"` depuis un package TypeScript source
   * échoue à la compilation de l'application.
   */
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
