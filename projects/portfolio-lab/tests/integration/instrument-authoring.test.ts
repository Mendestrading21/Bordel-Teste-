import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildQuoteRequests, type IdentifierRow, type InstrumentRow } from "@portfolio-lab/market-data";
import type { AssetType } from "@portfolio-lab/domain";

import { ALICE, hasTestDatabase, setupTestDatabase, type TestDatabase } from "../helpers/database.js";

/**
 * Un utilisateur peut-il enregistrer un instrument, et sera-t-il coté ?
 *
 * Le référentiel `instruments` n'avait qu'une politique de lecture. Sur une
 * base neuve — le cas de toute installation réelle — la table est vide, le
 * sélecteur du formulaire d'ajout ne propose rien, et aucune position ne peut
 * être saisie. L'application était inutilisable dès la première prise en main,
 * sans qu'aucune erreur ne l'explique : le champ était simplement vide.
 *
 * Cette suite vérifie les deux moitiés de la réparation : l'écriture passe bien
 * les politiques, et l'identifiant saisi débouche réellement sur une requête de
 * cours.
 */
describe.skipIf(!hasTestDatabase)("saisie d'un instrument", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await setupTestDatabase({ name: "instrument_authoring", seed: false });
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  async function createInstrument(
    name: string,
    identifier: { type: string; value: string; provider: string | null } | null,
  ): Promise<string> {
    return db.asUser(ALICE, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into instruments (asset_type, name, short_name, primary_currency, exchange_mic)
         values ('STOCK'::asset_type, $1, null, 'USD', null)
         returning id`,
        [name],
      );
      const id = rows[0]?.id as string;

      if (identifier !== null) {
        await client.query(
          `insert into instrument_identifiers
             (instrument_id, identifier_type, identifier_value, provider, exchange_mic)
           values ($1, $2::identifier_type, $3, $4, null)`,
          [id, identifier.type, identifier.value, identifier.provider],
        );
      }
      return id;
    });
  }

  it("un utilisateur authentifié peut créer un instrument", async () => {
    const id = await createInstrument("Apple Inc", null);
    expect(id).toBeTruthy();

    const found = await db.asUser(ALICE, async (client) => {
      const { rows } = await client.query<{ name: string }>(
        "select name from instruments where id = $1",
        [id],
      );
      return rows[0]?.name;
    });
    expect(found).toBe("Apple Inc");
  });

  /*
   * Le référentiel est **partagé** : ce n'est pas une donnée par utilisateur.
   * Un instrument créé par le propriétaire doit rester lisible par lui, et rien
   * dans les politiques ne doit le cacher à sa propre session suivante.
   */
  it("l'instrument créé reste lisible", async () => {
    await createInstrument("Nestlé SA", null);
    const count = await db.asUser(ALICE, async (client) => {
      const { rows } = await client.query<{ count: string }>(
        "select count(*)::text from instruments",
      );
      return Number(rows[0]?.count ?? "0");
    });
    expect(count).toBeGreaterThan(0);
  });

  it("un visiteur anonyme ne peut rien créer", async () => {
    await expect(
      db.asAnonymous(async (client) =>
        client.query(
          `insert into instruments (asset_type, name, primary_currency)
           values ('STOCK'::asset_type, 'Intrus', 'USD')`,
        ),
      ),
    ).rejects.toThrow();
  });

  it("un ISIN mal formé est refusé par la base elle-même", async () => {
    const id = await createInstrument("Titre douteux", null);
    await expect(
      db.asUser(ALICE, async (client) =>
        client.query(
          `insert into instrument_identifiers (instrument_id, identifier_type, identifier_value)
           values ($1, 'ISIN'::identifier_type, 'PAS-UN-ISIN')`,
          [id],
        ),
      ),
    ).rejects.toThrow();
  });

  /*
   * La moitié qui compte vraiment : l'identifiant saisi doit produire une
   * requête de cours. Sans cela l'utilisateur aurait rempli un champ pour rien,
   * et sa ligne resterait muette sans explication.
   */
  it("l'identifiant saisi débouche sur une requête de cours", async () => {
    const id = await createInstrument("Microsoft", {
      type: "TICKER",
      value: "MSFT",
      provider: null,
    });

    const { instruments, identifiers } = await db.asUser(ALICE, async (client) => {
      const inst = await client.query<{ id: string; asset_type: string; exchange_mic: string | null }>(
        "select id, asset_type::text as asset_type, exchange_mic from instruments where id = $1",
        [id],
      );
      const ident = await client.query<{
        instrument_id: string;
        identifier_type: string;
        identifier_value: string;
        provider: string | null;
        exchange_mic: string | null;
      }>(
        `select instrument_id, identifier_type::text as identifier_type, identifier_value,
                provider, exchange_mic
           from instrument_identifiers where instrument_id = $1`,
        [id],
      );
      return {
        instruments: inst.rows.map(
          (row): InstrumentRow => ({
            instrumentId: row.id,
            assetType: row.asset_type as AssetType,
            exchangeMic: row.exchange_mic,
          }),
        ),
        identifiers: ident.rows.map(
          (row): IdentifierRow => ({
            instrumentId: row.instrument_id,
            identifierType: row.identifier_type as IdentifierRow["identifierType"],
            identifierValue: row.identifier_value,
            provider: row.provider,
            exchangeMic: row.exchange_mic,
          }),
        ),
      };
    });

    const { requests, unidentified } = buildQuoteRequests(instruments, identifiers);

    expect(unidentified).toEqual([]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.reference).toEqual({ kind: "TICKER", ticker: "MSFT" });
  });

  it("un instrument sans identifiant est déclaré non identifiable, pas deviné", async () => {
    const id = await createInstrument("Titre sans identifiant", null);

    const instruments: InstrumentRow[] = [
      { instrumentId: id, assetType: "STOCK", exchangeMic: null },
    ];
    const { requests, unidentified } = buildQuoteRequests(instruments, []);

    expect(requests).toEqual([]);
    expect(unidentified[0]?.reason).toContain("Aucun identifiant fournisseur");
  });
});
