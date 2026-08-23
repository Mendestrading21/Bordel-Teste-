import type { NextConfig } from "next";

/**
 * Politique de sécurité du contenu.
 *
 * `'unsafe-inline'` sur `script-src` est aujourd'hui nécessaire : Next.js
 * injecte des scripts inline pour l'hydratation et le passage à une politique
 * par nonce demande un middleware dédié. C'est une limite assumée du Lot 01,
 * inscrite au périmètre du Lot 09 (sécurité).
 *
 * `connect-src` sera élargi au Lot 05 pour autoriser le canal WebSocket de la
 * passerelle de marché — et à elle seule.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
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
  transpilePackages: ["@portfolio-lab/domain", "@portfolio-lab/ui"],
  typedRoutes: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
