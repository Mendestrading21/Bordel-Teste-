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

const gatewayWsServer = readFileSync(
  fileURLToPath(new URL("../../../../market-gateway/src/live/ws-server.ts", import.meta.url)),
  "utf8",
);

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
