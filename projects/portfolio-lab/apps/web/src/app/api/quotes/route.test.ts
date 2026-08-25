import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Propriétés de sécurité de la route de rafraîchissement.
 *
 * Une route qui parle à des fournisseurs porteurs de clés a trois façons de
 * mal tourner, et aucune ne se voit à l'écran : servir un appelant sans
 * session, laisser une boucle vider le quota, ou renvoyer au navigateur un
 * message d'adaptateur contenant une URL et son jeton.
 *
 * Le service est simulé : ce qui est vérifié ici est la frontière, pas la
 * récupération des cours — couverte par la suite d'intégration sur un vrai
 * PostgreSQL.
 */

const refreshPortfolioQuotes = vi.fn();

vi.mock("@/lib/live/quote-service", () => ({
  refreshPortfolioQuotes: () => refreshPortfolioQuotes(),
  fetchFxRates: vi.fn(),
}));

const DEMO_ENV = {
  PORTFOLIO_LAB_DEMO_MODE: "true",
  NODE_ENV: "test",
} as const;

let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  vi.resetModules();
  refreshPortfolioQuotes.mockReset();
});

afterEach(() => {
  process.env = originalEnv;
});

function useEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function callRoute(): Promise<Response> {
  const { POST } = await import("./route");
  return POST();
}

describe("POST /api/quotes", () => {
  it("refuse un appelant sans session", async () => {
    useEnv({ PORTFOLIO_LAB_DEMO_MODE: undefined, DATABASE_URL: "postgres://x" });

    const response = await callRoute();

    expect(response.status).toBe(401);
    // Aucun appel fournisseur n'a été tenté : l'identité est vérifiée avant.
    expect(refreshPortfolioQuotes).not.toHaveBeenCalled();
  });

  it("sert un appelant identifié", async () => {
    useEnv(DEMO_ENV);
    refreshPortfolioQuotes.mockResolvedValue({
      status: "ok",
      refreshedAt: "2026-08-25T06:41:30.000Z",
      providers: ["finnhub"],
      quotes: [],
      unquoted: [],
    });

    const response = await callRoute();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });

  /*
   * Le point qui compte le plus. Le message d'un adaptateur peut contenir
   * l'URL appelée, et cette URL peut porter une clé. Le renvoyer au navigateur
   * la publierait auprès de toute personne ouvrant les outils de développement.
   */
  it("ne renvoie jamais le message d'erreur du fournisseur", async () => {
    useEnv(DEMO_ENV);
    refreshPortfolioQuotes.mockRejectedValue(
      new Error("ECONNREFUSED https://finnhub.io/api/v1/quote?token=CLE-SECRETE"),
    );

    const response = await callRoute();
    const body = (await response.json()) as { message?: string };

    expect(response.status).toBe(502);
    expect(JSON.stringify(body)).not.toContain("CLE-SECRETE");
    expect(JSON.stringify(body)).not.toContain("finnhub.io");
    expect(body.message).toContain("dernières connues");
  });

  it("limite le débit après un usage anormal, sans appeler le fournisseur", async () => {
    useEnv(DEMO_ENV);
    refreshPortfolioQuotes.mockResolvedValue({
      status: "ok",
      refreshedAt: "2026-08-25T06:41:30.000Z",
      providers: [],
      quotes: [],
      unquoted: [],
    });

    const { POST } = await import("./route");

    let limited: Response | null = null;
    // La limite est de 30 par minute ; 40 appels la franchissent forcément.
    for (let index = 0; index < 40; index += 1) {
      const response = await POST();
      if (response.status === 429) {
        limited = response;
        break;
      }
    }

    expect(limited, "aucune limite de débit n'a été appliquée").not.toBeNull();
    expect(limited?.headers.get("retry-after")).toBeTruthy();

    // Le refus est prononcé sans interroger le fournisseur : une boucle ne doit
    // pas pouvoir vider le quota d'un plan gratuit.
    const callsBeforeLimit = refreshPortfolioQuotes.mock.calls.length;
    await POST();
    expect(refreshPortfolioQuotes.mock.calls.length).toBe(callsBeforeLimit);
  });
});
