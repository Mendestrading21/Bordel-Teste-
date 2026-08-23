import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig, redactSecrets } from "./config.js";

describe("loadConfig", () => {
  it("applique les valeurs par défaut sûres sur un environnement vide", () => {
    const config = loadConfig({});
    expect(config.port).toBe(4100);
    // Aucun fournisseur réel ne doit être actif par défaut.
    expect(config.provider).toBe("mock");
    expect(config.logLevel).toBe("info");
  });

  it("lit les variables fournies", () => {
    const config = loadConfig({
      MARKET_GATEWAY_PORT: "5000",
      MARKET_DATA_PROVIDER: "twelvedata",
      LOG_LEVEL: "debug",
    });
    expect(config).toEqual({ port: 5000, provider: "twelvedata", logLevel: "debug" });
  });

  it("refuse un port hors plage", () => {
    expect(() => loadConfig({ MARKET_GATEWAY_PORT: "70000" })).toThrow(ConfigError);
    expect(() => loadConfig({ MARKET_GATEWAY_PORT: "0" })).toThrow(ConfigError);
  });

  it("refuse un fournisseur inconnu plutôt que de retomber sur mock", () => {
    expect(() => loadConfig({ MARKET_DATA_PROVIDER: "yolo-finance" })).toThrow(ConfigError);
  });

  it("ne divulgue aucune valeur de secret dans le message d'erreur", () => {
    try {
      loadConfig({ MARKET_GATEWAY_PORT: "-1", TWELVE_DATA_API_KEY: "clef-tres-secrete-1234" });
      expect.unreachable("loadConfig aurait dû échouer");
    } catch (error) {
      expect((error as Error).message).not.toContain("clef-tres-secrete-1234");
    }
  });
});

describe("redactSecrets", () => {
  const env = {
    TWELVE_DATA_API_KEY: "td_live_abcdef123456",
    MASSIVE_API_KEY: "mv_live_zyxwvu987654",
    SHORT: "abc",
  };

  it("expurge une clé recopiée dans un message fournisseur", () => {
    const message = "échec 401 pour apikey=td_live_abcdef123456 sur /quote";
    expect(redactSecrets(message, env)).toBe("échec 401 pour apikey=[expurgé] sur /quote");
  });

  it("expurge plusieurs secrets dans le même texte", () => {
    const message = "td_live_abcdef123456 puis mv_live_zyxwvu987654";
    expect(redactSecrets(message, env)).toBe("[expurgé] puis [expurgé]");
  });

  it("expurge toutes les occurrences d'un même secret", () => {
    const message = "td_live_abcdef123456 / td_live_abcdef123456";
    expect(redactSecrets(message, env)).toBe("[expurgé] / [expurgé]");
  });

  it("laisse intact un texte sans secret", () => {
    expect(redactSecrets("tout va bien", env)).toBe("tout va bien");
  });

  it("ignore les valeurs trop courtes pour éviter les faux positifs", () => {
    expect(redactSecrets("abcdefgh", { SUPABASE_ANON_KEY: "abc" })).toBe("abcdefgh");
  });
});
