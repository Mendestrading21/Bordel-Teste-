import { describe, expect, it } from "vitest";

import { createOpenFigiResolver } from "./openfigi-resolver.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("OpenFIGI resolver", () => {
  it("mappe un ISIN sans utiliser OpenFIGI comme source de prix", async () => {
    const resolver = createOpenFigiResolver({
      fetchImpl: async () => response([{ data: [{ figi: "BBG000B9XRY4", ticker: "AAPL", name: "APPLE INC", exchCode: "US", securityType: "Common Stock", securityType2: "Common Stock", marketSector: "Equity", compositeFIGI: "BBG000B9XRY4", shareClassFIGI: "BBG001S5N8V8" }] }]),
    });
    const matches = await resolver.byIsin("US0378331005");
    expect(matches[0]).toMatchObject({ figi: "BBG000B9XRY4", ticker: "AAPL", marketSector: "Equity" });
  });

  it("conserve l'ordre des jobs batch", async () => {
    const resolver = createOpenFigiResolver({
      fetchImpl: async () => response([
        { data: [{ figi: "FIGI1", ticker: "AAA" }] },
        { warning: "No identifier found." },
      ]),
    });
    const result = await resolver.map([
      { idType: "TICKER", idValue: "AAA" },
      { idType: "TICKER", idValue: "UNKNOWN" },
    ]);
    expect(result[0]?.[0]?.figi).toBe("FIGI1");
    expect(result[1]).toEqual([]);
  });

  it("respecte la limite sans clé", async () => {
    const resolver = createOpenFigiResolver();
    await expect(resolver.map(Array.from({ length: 6 }, (_, i) => ({ idType: "TICKER" as const, idValue: `T${i}` })))).rejects.toMatchObject({ kind: "UNSUPPORTED" });
  });
});
