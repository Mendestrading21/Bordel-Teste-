import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { snapshotRepository } from "@portfolio-lab/database";
import { toDecimalString, type DecimalString } from "@portfolio-lab/domain";
import { CALCULATION_VERSION, dailyHistory } from "@portfolio-lab/portfolio-engine";

import {
  ALICE,
  BOB,
  hasTestDatabase,
  setupTestDatabase,
  truncateUserTables,
  type TestDatabase,
} from "../helpers/database.js";

const d = (value: string): DecimalString => toDecimalString(value);

/**
 * Historique du patrimoine, sur PostgreSQL réel.
 *
 * Les points d'historique sont des données utilisateur : ils doivent être aussi
 * cloisonnés que les positions. Un historique lisible par un tiers révélerait
 * l'évolution complète d'un patrimoine sans en montrer une seule ligne.
 */
describe.skipIf(!hasTestDatabase)("portfolio_snapshots", () => {
  let db: TestDatabase;

  const ALICE_PORTFOLIO = "aaaaaaaa-0000-4000-8000-000000000101";
  const BOB_PORTFOLIO = "bbbbbbbb-0000-4000-8000-000000000101";

  const point = (snapshotAt: string, marketValue: string) => ({
    snapshotAt,
    marketValueBase: d(marketValue),
    costBasisBase: d("1000"),
    unrealizedPnlBase: d(`${Number(marketValue) - 1000}`),
    dayPnlBase: null,
    baseCurrency: "CHF" as const,
    calculationVersion: CALCULATION_VERSION,
    componentsHash: "0123456789abcdef",
  });

  beforeAll(async () => {
    db = await setupTestDatabase({ name: "snapshots" });
  });

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await truncateUserTables(db.pool);
    await db.asOwner(async (client) => {
      await client.query(
        `insert into portfolios (id, user_id, name) values ($1, $2, $3), ($4, $5, $6)`,
        [ALICE_PORTFOLIO, ALICE, "Alice", BOB_PORTFOLIO, BOB, "Bob"],
      );
    });
  });

  it("enregistre puis relit un point d'historique", async () => {
    await db.asUser(ALICE, (client) =>
      snapshotRepository.record(client, {
        userId: ALICE,
        portfolioId: ALICE_PORTFOLIO,
        ...point("2026-05-04T17:35:00.000Z", "1200"),
      }),
    );

    const rows = await db.asUser(ALICE, (client) =>
      snapshotRepository.listRecent(client, ALICE_PORTFOLIO, 10),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.market_value_base).toBe("1200.000000000000");
    expect(rows[0]?.calculation_version).toBe(CALCULATION_VERSION);
    expect(rows[0]?.components_hash).toBe("0123456789abcdef");
  });

  it("rend l'historique du plus ancien au plus récent", async () => {
    await db.asUser(ALICE, async (client) => {
      // Insertion volontairement désordonnée.
      await snapshotRepository.record(client, {
        userId: ALICE,
        portfolioId: ALICE_PORTFOLIO,
        ...point("2026-05-06T17:35:00.000Z", "1300"),
      });
      await snapshotRepository.record(client, {
        userId: ALICE,
        portfolioId: ALICE_PORTFOLIO,
        ...point("2026-05-04T17:35:00.000Z", "1200"),
      });
    });

    const rows = await db.asUser(ALICE, (client) =>
      snapshotRepository.listRecent(client, ALICE_PORTFOLIO, 10),
    );
    expect(rows.map((row) => row.market_value_base)).toEqual([
      "1200.000000000000",
      "1300.000000000000",
    ]);
  });

  it("garde les N points les plus récents, pas les N premiers", async () => {
    await db.asUser(ALICE, async (client) => {
      for (const day of ["04", "05", "06", "07"]) {
        await snapshotRepository.record(client, {
          userId: ALICE,
          portfolioId: ALICE_PORTFOLIO,
          ...point(`2026-05-${day}T17:35:00.000Z`, `1${day}0`),
        });
      }
    });

    const rows = await db.asUser(ALICE, (client) =>
      snapshotRepository.listRecent(client, ALICE_PORTFOLIO, 2),
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.snapshot_at.toISOString())).toEqual([
      "2026-05-06T17:35:00.000Z",
      "2026-05-07T17:35:00.000Z",
    ]);
  });

  it("met à jour le point existant plutôt que d'en créer un second au même instant", async () => {
    await db.asUser(ALICE, async (client) => {
      await snapshotRepository.record(client, {
        userId: ALICE,
        portfolioId: ALICE_PORTFOLIO,
        ...point("2026-05-04T17:35:00.000Z", "1200"),
      });
      await snapshotRepository.record(client, {
        userId: ALICE,
        portfolioId: ALICE_PORTFOLIO,
        ...point("2026-05-04T17:35:00.000Z", "1250"),
      });
    });

    const rows = await db.asUser(ALICE, (client) =>
      snapshotRepository.listRecent(client, ALICE_PORTFOLIO, 10),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.market_value_base).toBe("1250.000000000000");
  });

  it("l'historique d'Alice est invisible à Bob", async () => {
    await db.asUser(ALICE, (client) =>
      snapshotRepository.record(client, {
        userId: ALICE,
        portfolioId: ALICE_PORTFOLIO,
        ...point("2026-05-04T17:35:00.000Z", "1200"),
      }),
    );

    const seenByBob = await db.asUser(BOB, (client) =>
      snapshotRepository.listRecent(client, ALICE_PORTFOLIO, 10),
    );
    expect(seenByBob).toEqual([]);
  });

  it("un accès anonyme ne voit aucun historique", async () => {
    await db.asUser(ALICE, (client) =>
      snapshotRepository.record(client, {
        userId: ALICE,
        portfolioId: ALICE_PORTFOLIO,
        ...point("2026-05-04T17:35:00.000Z", "1200"),
      }),
    );

    const seen = await db.asAnonymous((client) =>
      client.query("select * from portfolio_snapshots"),
    );
    expect(seen.rows).toEqual([]);
  });

  it("Bob ne peut pas écrire un point dans le portefeuille d'Alice", async () => {
    await expect(
      db.asUser(BOB, (client) =>
        snapshotRepository.record(client, {
          userId: BOB,
          portfolioId: ALICE_PORTFOLIO,
          ...point("2026-05-04T17:35:00.000Z", "1200"),
        }),
      ),
    ).rejects.toThrow();
  });

  it("un point ne peut pas être attribué à un autre utilisateur que soi", async () => {
    // `user_id` falsifié : le déclencheur d'appartenance et RLS doivent tous
    // deux s'y opposer, indépendamment de l'identité déclarée dans la requête.
    await expect(
      db.asUser(ALICE, (client) =>
        snapshotRepository.record(client, {
          userId: BOB,
          portfolioId: ALICE_PORTFOLIO,
          ...point("2026-05-04T17:35:00.000Z", "1200"),
        }),
      ),
    ).rejects.toThrow();
  });

  it("l'historique quotidien retient le dernier point de chaque journée", async () => {
    await db.asUser(ALICE, async (client) => {
      await snapshotRepository.record(client, {
        userId: ALICE,
        portfolioId: ALICE_PORTFOLIO,
        ...point("2026-05-04T09:00:00.000Z", "1200"),
      });
      await snapshotRepository.record(client, {
        userId: ALICE,
        portfolioId: ALICE_PORTFOLIO,
        ...point("2026-05-04T19:00:00.000Z", "1275"),
      });
    });

    const rows = await db.asUser(ALICE, (client) =>
      snapshotRepository.listRecent(client, ALICE_PORTFOLIO, 10),
    );
    const history = dailyHistory(
      rows.map((row) => ({
        snapshotAt: row.snapshot_at.toISOString(),
        marketValueBase: row.market_value_base,
        costBasisBase: row.cost_basis_base,
        unrealizedPnlBase: row.unrealized_pnl_base,
        baseCurrency: row.base_currency,
        calculationVersion: row.calculation_version,
      })),
    );

    expect(history).toHaveLength(1);
    expect(history[0]?.marketValueBase).toBe("1275.000000000000");
  });
});

/**
 * Historique de démonstration.
 *
 * Le seed fournit une courbe pour que l'écran d'analyse ait quelque chose à
 * montrer. Sa version de moteur doit rester celle du code : sinon la série
 * devient « non comparable » et la courbe disparaît sans erreur — exactement le
 * genre de régression qu'un test doit rendre bruyante.
 */
describe.skipIf(!hasTestDatabase)("historique de démonstration", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await setupTestDatabase({ name: "snapshots_seed", seed: true });
  });

  afterAll(async () => {
    await db?.close();
  });

  it("porte la version courante du moteur de calcul", async () => {
    const { rows } = await db.asOwner((client) =>
      client.query<{ calculation_version: string }>(
        "select distinct calculation_version from portfolio_snapshots",
      ),
    );
    expect(rows.map((row) => row.calculation_version)).toEqual([CALCULATION_VERSION]);
  });

  it("contient deux points le même jour, réduits à un seul dans l'historique quotidien", async () => {
    const { rows } = await db.asOwner((client) =>
      client.query<{
        snapshot_at: Date;
        market_value_base: DecimalString;
        cost_basis_base: DecimalString;
        unrealized_pnl_base: DecimalString;
        base_currency: "CHF";
        calculation_version: string;
      }>("select * from portfolio_snapshots order by snapshot_at asc"),
    );

    const history = dailyHistory(
      rows.map((row) => ({
        snapshotAt: row.snapshot_at.toISOString(),
        marketValueBase: row.market_value_base,
        costBasisBase: row.cost_basis_base,
        unrealizedPnlBase: row.unrealized_pnl_base,
        baseCurrency: row.base_currency,
        calculationVersion: row.calculation_version,
      })),
    );

    expect(rows).toHaveLength(6);
    expect(history).toHaveLength(5);
    // Le 6 mai porte deux points ; c'est celui de 20 h 10 qui est retenu.
    const sixth = history.find((entry) => entry.date === "2026-05-06");
    expect(sixth?.marketValueBase).toBe("19365.000000000000");
  });
});
