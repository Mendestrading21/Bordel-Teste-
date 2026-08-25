import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { tokenProtocol } from "./client-protocol";

/**
 * Alignement des deux définitions du protocole.
 *
 * Le client redéfinit le protocole plutôt que d'importer celui de la passerelle,
 * pour que le navigateur ne charge ni `ws` ni `node:crypto`. Le prix de ce choix
 * est le risque de dérive : ce test le rend visible.
 */
const gatewayProtocol = readFileSync(
  fileURLToPath(new URL("../../../../market-gateway/src/live/protocol.ts", import.meta.url)),
  "utf8",
);

const gatewayChannelAuth = readFileSync(
  fileURLToPath(new URL("../../../../market-gateway/src/live/channel-auth.ts", import.meta.url)),
  "utf8",
);

const gatewayTokenRoute = readFileSync(
  fileURLToPath(new URL("../../app/api/live-token/route.ts", import.meta.url)),
  "utf8",
);

const quoteService = readFileSync(
  fileURLToPath(new URL("./quote-service.ts", import.meta.url)),
  "utf8",
);

const gatewayWsServer = readFileSync(
  fileURLToPath(new URL("../../../../market-gateway/src/live/ws-server.ts", import.meta.url)),
  "utf8",
);

/**
 * Cohérence du jeton de canal entre l'émetteur et le vérificateur.
 *
 * L'application web signe le jeton, la passerelle le vérifie, et les deux ne
 * partagent aucun code : la passerelle est déployée séparément et l'application
 * n'en dépend pas. Le prix de ce choix est le risque de dérive — un alphabet ou
 * un séparateur modifié d'un seul côté produirait des jetons rejetés, ou pire,
 * un périmètre découpé différemment de celui qui a été signé.
 */
describe("jeton de canal : émetteur et vérificateur", () => {
  it("partagent le même alphabet de symboles", () => {
    const gateway = /const SYMBOL_PATTERN = (\/.+\/);/.exec(gatewayChannelAuth)?.[1];
    const web = /const SCOPE_SYMBOL_PATTERN = (\/.+\/);/.exec(quoteService)?.[1];

    expect(gateway, "alphabet introuvable côté passerelle").toBeTruthy();
    expect(web, "alphabet introuvable côté application").toBeTruthy();
    expect(web).toBe(gateway);
  });

  it("partagent le même séparateur de périmètre", () => {
    const gateway = /const SCOPE_SEPARATOR = "(.+)";/.exec(gatewayChannelAuth)?.[1];
    expect(gateway, "séparateur introuvable côté passerelle").toBe(",");
    // L'émetteur joint avec cette même virgule.
    expect(gatewayTokenRoute).toContain('.sort().join(",")');
  });

  it("l'émetteur produit bien un jeton à quatre parties", () => {
    /*
     * Le rejet des jetons à trois parties est vérifié par le **comportement**
     * de `verifyChannelToken`, dans la suite de la passerelle : une recherche
     * de chaîne survivrait à un `parts.length !== 3 && parts.length !== 4`, qui
     * rouvrirait pourtant la faille en grand.
     */
    expect(gatewayTokenRoute).toContain("${userId}.${expiresAt}.${encodedScope}");
  });

  it("encodent le périmètre de la même façon", () => {
    expect(gatewayChannelAuth).toContain('toString("base64url")');
    expect(gatewayTokenRoute).toContain('toString("base64url")');
  });

  /*
   * Le point le plus important de cette suite : le périmètre doit venir du
   * serveur. S'il était lu dans la requête, le client choisirait lui-même ce à
   * quoi il a droit et le scellement ne prouverait plus rien.
   */
  it("l'émetteur dérive le périmètre du portefeuille, jamais de la requête", () => {
    expect(gatewayTokenRoute).toContain("portfolioSubscriptionScope()");
    expect(gatewayTokenRoute, "la route ne doit lire aucun corps de requête").not.toMatch(
      /request\.(json|text|formData)\(/,
    );
  });
});

describe("protocole client et passerelle", () => {
  it("partage le même préfixe de sous-protocole", () => {
    const match = /const TOKEN_PROTOCOL_PREFIX = "([^"]+)"/.exec(gatewayWsServer);
    expect(match?.[1], "préfixe introuvable côté passerelle").toBeTruthy();
    expect(tokenProtocol("X")).toBe(`${match?.[1] ?? ""}X`);
  });

  it("couvre les quatre types de messages serveur", () => {
    for (const type of ["welcome", "quotes", "pong", "error"]) {
      expect(gatewayProtocol, `« ${type} » absent de la passerelle`).toContain(
        `z.literal("${type}")`,
      );
    }
  });

  it("couvre les deux types de messages client", () => {
    for (const type of ["subscribe", "ping"]) {
      expect(gatewayProtocol).toContain(`z.literal("${type}")`);
    }
  });

  it("partage les mêmes codes d'erreur", () => {
    for (const code of ["UNAUTHORIZED", "MALFORMED", "RATE_LIMITED", "PROVIDER_DOWN"]) {
      expect(gatewayProtocol, `code ${code} absent`).toContain(code);
    }
  });
});

/**
 * Le canal atteint-il réellement l'écran ?
 *
 * `useLiveQuotes` et `LiveIndicator` sont restés longtemps écrits, testés, et
 * importés par **aucun** écran : du code mort qui ressemblait à une
 * fonctionnalité. C'est la même famille de défaut que celle fermée par
 * `reachability.test.ts` côté fournisseurs — déclaré d'un côté, inatteignable
 * de l'autre, sans que rien ne relie les deux.
 */
describe("le canal temps réel est branché", () => {
  const positionsList = readFileSync(
    fileURLToPath(new URL("../../components/positions-list.tsx", import.meta.url)),
    "utf8",
  );

  it("un écran consomme le flux", () => {
    expect(positionsList).toContain("useLiveQuotes()");
  });

  it("l'état de la connexion est affiché", () => {
    // Une application dont le flux est coupé et qui continue d'afficher les
    // derniers cours sans le dire ment par omission.
    expect(positionsList).toContain("LiveIndicator");
  });

  it("le hook ne reçoit aucune liste de symboles", () => {
    /*
     * Accepter une liste de l'appelant rouvrirait ce que le périmètre du jeton
     * a fermé : un client capable de demander n'importe quel cours sur la clé
     * de l'exploitant.
     */
    const hook = readFileSync(
      fileURLToPath(new URL("./use-live-quotes.ts", import.meta.url)),
      "utf8",
    );
    expect(hook).toContain("export function useLiveQuotes(): UseLiveQuotesResult");
  });

  it("l'émetteur rend les abonnements avec leur instrument", () => {
    // Le flux ne connaît que des symboles, l'écran que des instruments : sans
    // cette table, un cours reçu ne se rattache à aucune ligne.
    expect(gatewayTokenRoute).toContain("subscriptions");
  });
});
