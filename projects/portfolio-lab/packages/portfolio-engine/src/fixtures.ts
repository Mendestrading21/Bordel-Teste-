import {
  currencyCodeSchema,
  priceTypeSchema,
  quoteFreshnessSchema,
  toDecimalString,
  type CurrencyCode,
} from "@portfolio-lab/domain";
import { z } from "zod";

import { buildFxTable, type FxRate, type FxTable, type Mark } from "./valuation.js";

/**
 * Chargement de cours de démonstration.
 *
 * Ces cours sont **fictifs et saisis à la main**. Le schéma impose donc que
 * chaque entrée porte son `freshness` réel : le chargeur ne réécrit rien et ne
 * peut pas transformer une valeur inventée en donnée « en direct ».
 *
 * Le fournisseur déclaré est `fixture`, visible dans l'interface au même titre
 * que n'importe quel fournisseur réel.
 */

export const FIXTURE_PROVIDER = "fixture";

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/, "décimale attendue sous forme de chaîne");

const markSchema = z.object({
  instrumentId: z.string().uuid(),
  label: z.string().min(1),
  price: decimalString,
  previousClose: decimalString.optional(),
  currency: currencyCodeSchema,
  priceType: priceTypeSchema,
  freshness: quoteFreshnessSchema,
});

const fxSchema = z.object({
  from: currencyCodeSchema,
  to: currencyCodeSchema,
  rate: decimalString,
  freshness: quoteFreshnessSchema,
});

const fixtureSchema = z.object({
  asOf: z.string().datetime(),
  marks: z.array(markSchema).min(1),
  fxRates: z.array(fxSchema),
});

export type MarkFixture = {
  readonly marks: ReadonlyMap<string, Mark>;
  readonly fx: FxTable;
  readonly asOf: string;
  /** Libellés lisibles, utiles aux messages de test et à l'écran de réglages. */
  readonly labels: ReadonlyMap<string, string>;
};

export class FixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixtureError";
  }
}

/**
 * Valide et convertit un jeu de cours de démonstration.
 *
 * La validation est stricte : une fixture mal formée doit échouer bruyamment
 * plutôt que produire un portefeuille aux chiffres silencieusement faux.
 */
export function loadMarkFixture(raw: unknown): MarkFixture {
  const parsed = fixtureSchema.safeParse(raw);
  if (!parsed.success) {
    throw new FixtureError(
      `Fixture de cours invalide : ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join(" ; ")}`,
    );
  }

  const { asOf, marks, fxRates } = parsed.data;

  const markMap = new Map<string, Mark>();
  const labels = new Map<string, string>();

  for (const entry of marks) {
    if (markMap.has(entry.instrumentId)) {
      throw new FixtureError(`Instrument en double dans la fixture : ${entry.instrumentId}`);
    }
    markMap.set(entry.instrumentId, {
      price: toDecimalString(entry.price),
      currency: entry.currency,
      priceType: entry.priceType,
      freshness: entry.freshness,
      asOf,
      provider: FIXTURE_PROVIDER,
      ...(entry.previousClose === undefined
        ? {}
        : { previousClose: toDecimalString(entry.previousClose) }),
    });
    labels.set(entry.instrumentId, entry.label);
  }

  const rates: FxRate[] = fxRates.map((entry) => ({
    from: entry.from as CurrencyCode,
    to: entry.to as CurrencyCode,
    rate: toDecimalString(entry.rate),
    asOf,
    provider: FIXTURE_PROVIDER,
    freshness: entry.freshness,
  }));

  return { marks: markMap, fx: buildFxTable(rates), asOf, labels };
}
