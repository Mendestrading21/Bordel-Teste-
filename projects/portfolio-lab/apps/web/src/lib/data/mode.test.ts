import { describe, expect, it } from "vitest";

import { DEMO_USER_ID, DemoModeInProductionError, isDemoMode, resolveDataMode } from "./mode";

describe("resolveDataMode", () => {
  it("refuse le mode démonstration en production plutôt que de dégrader", () => {
    // Servir des données sans authentification serait bien pire qu'un échec au
    // démarrage.
    expect(() =>
      resolveDataMode({ PORTFOLIO_LAB_DEMO_MODE: "true", NODE_ENV: "production" }),
    ).toThrow(DemoModeInProductionError);
  });

  it("active le mode démonstration hors production", () => {
    const mode = resolveDataMode({ PORTFOLIO_LAB_DEMO_MODE: "true", NODE_ENV: "development" });
    expect(mode).toEqual({ kind: "demo", userId: DEMO_USER_ID });
    expect(isDemoMode(mode)).toBe(true);
  });

  it("n'active pas le mode démonstration sur une valeur approchante", () => {
    // Seul le littéral "true" compte : "1", "yes" ou "TRUE" ne suffisent pas.
    for (const value of ["1", "yes", "TRUE", "on", ""]) {
      expect(resolveDataMode({ PORTFOLIO_LAB_DEMO_MODE: value }).kind).not.toBe("demo");
    }
  });

  it("utilise la base quand DATABASE_URL est renseignée", () => {
    expect(resolveDataMode({ DATABASE_URL: "postgresql://localhost/pl" }).kind).toBe("database");
  });

  it("ignore une DATABASE_URL vide", () => {
    expect(resolveDataMode({ DATABASE_URL: "" }).kind).toBe("unavailable");
  });

  it("signale l'absence de configuration avec une consigne exploitable", () => {
    const mode = resolveDataMode({});
    expect(mode.kind).toBe("unavailable");
    expect(mode.kind === "unavailable" && mode.reason).toContain("DATABASE_URL");
    expect(mode.kind === "unavailable" && mode.reason).toContain("PORTFOLIO_LAB_DEMO_MODE");
  });

  it("donne la priorité au mode démonstration sur la base", () => {
    const mode = resolveDataMode({
      PORTFOLIO_LAB_DEMO_MODE: "true",
      DATABASE_URL: "postgresql://localhost/pl",
      NODE_ENV: "test",
    });
    expect(mode.kind).toBe("demo");
  });
});
