import type { Metadata, Viewport } from "next";

import { BottomNav } from "@/components/bottom-nav";
import { OfflineNotice } from "@/components/offline-notice";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PortfolioLab",
    template: "%s · PortfolioLab",
  },
  description:
    "Suivi patrimonial privé : actions, ETF, options, fonds et liquidités consolidés en CHF.",
  applicationName: "PortfolioLab",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "PortfolioLab",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  // Application privée : aucune indexation ne doit être possible.
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0E11",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // `viewportFit: cover` est nécessaire pour que `env(safe-area-inset-*)`
  // renvoie autre chose que 0 sur iPhone.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  /*
   * Horodatage du rendu, inscrit dans la page.
   *
   * Une page servie depuis le cache du service worker a été rendue à un moment
   * que le client ne peut pas deviner. Sans cette marque, le bandeau hors ligne
   * pourrait dire « vous êtes hors ligne » mais pas « ces chiffres datent
   * d'il y a trois heures » — et c'est la seconde moitié qui compte.
   */
  const renderedAt = new Date().toISOString();

  return (
    <html lang="fr" data-rendered-at={renderedAt}>
      <body>
        <a
          href="#contenu-principal"
          className="sr-only rounded-token-md focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-elevated focus:px-4 focus:py-2 focus:text-primary"
        >
          Aller au contenu principal
        </a>
        <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
          <main id="contenu-principal" className="flex-1 px-4 pt-6 pb-4">
            <OfflineNotice renderedAt={renderedAt} />
            {children}
          </main>
        </div>
        <BottomNav />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
