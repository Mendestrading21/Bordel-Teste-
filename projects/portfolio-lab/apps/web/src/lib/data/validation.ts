import { ASSET_TYPES, currencyCodeSchema } from "@portfolio-lab/domain";
import { z } from "zod";

/**
 * Validation des saisies utilisateur.
 *
 * Les montants sont validés **en chaîne** et jamais convertis en `number` :
 * `z.coerce.number()` sur « 0.1 » produirait déjà un flottant avant même
 * d'atteindre la couche métier.
 */

/** Décimale saisie : virgule ou point accepté, notation exponentielle refusée. */
const decimalInput = z
  .string()
  .trim()
  .min(1, "Valeur requise")
  .transform((value) => value.replace(",", "."))
  .refine((value) => /^-?\d+(\.\d+)?$/.test(value), "Nombre attendu, sans notation exponentielle");

const positiveDecimal = decimalInput.refine(
  (value) => Number.parseFloat(value) > 0,
  "La valeur doit être strictement positive",
);

const nonNegativeDecimal = decimalInput.refine(
  (value) => Number.parseFloat(value) >= 0,
  "La valeur ne peut pas être négative",
);

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(80, "Nom trop long"),
  institutionLabel: z
    .string()
    .trim()
    .max(80, "Libellé trop long")
    .optional()
    .transform((value) => (value === undefined || value === "" ? null : value)),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;

/**
 * Types d'identifiant que l'utilisateur peut saisir.
 *
 * `OSI` et `FIGI` en sont absents : le premier se déduit du contrat d'option et
 * n'a pas à être tapé à la main, le second n'est consommé par aucun adaptateur
 * aujourd'hui. Les proposer laisserait croire qu'ils servent à quelque chose.
 */
export const IDENTIFIER_KINDS = ["TICKER", "ISIN", "PROVIDER_SYMBOL"] as const;

/**
 * Alphabet d'un symbole.
 *
 * Le même que celui du périmètre du jeton temps réel : un symbole qui sortirait
 * de cet alphabet serait accepté ici puis silencieusement écarté du canal, et
 * la ligne ne serait jamais cotée sans que rien ne le dise.
 */
const SYMBOL_PATTERN = /^[A-Za-z0-9._:-]{1,32}$/u;

/** ISIN : deux lettres de pays, neuf caractères, une clé. */
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/u;

export const createInstrumentSchema = z
  .object({
    name: z.string().trim().min(1, "Nom requis").max(120, "Nom trop long"),
    shortName: z
      .string()
      .trim()
      .max(12, "Symbole court trop long")
      .optional()
      .transform((value) => (value === undefined || value === "" ? null : value)),
    assetType: z.enum(ASSET_TYPES, { message: "Classe d'actif inconnue" }),
    currency: currencyCodeSchema,
    exchangeMic: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .transform((value) => (value === undefined || value === "" ? null : value))
      .refine(
        (value) => value === null || /^[A-Z0-9]{4}$/u.test(value),
        "Le code de place doit compter quatre caractères (ex. XSWX, XNAS)",
      ),
    identifierType: z.enum(IDENTIFIER_KINDS).optional(),
    identifierValue: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value === undefined || value === "" ? null : value)),
    identifierProvider: z
      .string()
      .trim()
      .max(40, "Nom de fournisseur trop long")
      .optional()
      .transform((value) => (value === undefined || value === "" ? null : value)),
  })
  /*
   * L'identifiant est facultatif, mais **incomplet il est refusé**.
   *
   * Un type sans valeur, ou une valeur sans type, produirait une ligne
   * d'identifiant inutilisable : l'instrument paraîtrait coté automatiquement
   * et resterait muet. Mieux vaut un instrument franchement manuel.
   */
  .superRefine((value, ctx) => {
    const hasType = value.identifierType !== undefined;
    const hasValue = value.identifierValue !== null;

    if (hasType !== hasValue) {
      ctx.addIssue({
        code: "custom",
        path: [hasValue ? "identifierType" : "identifierValue"],
        message: "Renseignez le type et la valeur de l'identifiant, ou aucun des deux",
      });
      return;
    }
    if (!hasValue) return;

    const raw = value.identifierValue as string;

    if (value.identifierType === "ISIN" && !ISIN_PATTERN.test(raw.toUpperCase())) {
      ctx.addIssue({
        code: "custom",
        path: ["identifierValue"],
        // Un ISIN mal formé serait envoyé tel quel au fournisseur et pourrait
        // résoudre un autre titre.
        message: "ISIN invalide : deux lettres de pays, puis dix caractères (ex. US0378331005)",
      });
    }

    if (value.identifierType !== "ISIN" && !SYMBOL_PATTERN.test(raw)) {
      ctx.addIssue({
        code: "custom",
        path: ["identifierValue"],
        message: "Symbole invalide : lettres, chiffres, point, tiret ou deux-points seulement",
      });
    }

    if (value.identifierType === "PROVIDER_SYMBOL" && value.identifierProvider === null) {
      ctx.addIssue({
        code: "custom",
        path: ["identifierProvider"],
        // Un symbole propriétaire n'existe que dans le référentiel de celui qui
        // l'a émis : sans son nom, il ne désigne rien.
        message: "Un symbole fournisseur exige le nom du fournisseur",
      });
    }
  });

export type CreateInstrumentInput = z.infer<typeof createInstrumentSchema>;

export const createPositionSchema = z.object({
  accountId: z.string().uuid("Compte invalide"),
  instrumentId: z.string().uuid("Instrument invalide"),
  quantity: decimalInput.refine(
    (value) => Number.parseFloat(value) !== 0,
    "Une position active ne peut pas avoir une quantité nulle",
  ),
  averageCost: nonNegativeDecimal,
  costCurrency: currencyCodeSchema,
  notes: z
    .string()
    .trim()
    .max(2000, "Notes trop longues")
    .optional()
    .transform((value) => (value === undefined || value === "" ? null : value)),
});

export type CreatePositionInput = z.infer<typeof createPositionSchema>;

/**
 * Modification d'une position.
 *
 * Ni l'instrument ni le compte n'y figurent. Changer l'instrument reviendrait à
 * réécrire le passé : les points d'historique déjà enregistrés auraient été
 * calculés sur un autre titre.
 */
export const updatePositionSchema = z.object({
  id: z.string().uuid("Identifiant invalide"),
  quantity: decimalInput.refine(
    (value) => Number.parseFloat(value) !== 0,
    "Une position active ne peut pas avoir une quantité nulle",
  ),
  averageCost: nonNegativeDecimal,
  costCurrency: currencyCodeSchema,
  notes: z
    .string()
    .trim()
    .max(2000, "Notes trop longues")
    .optional()
    .transform((value) => (value === undefined || value === "" ? null : value)),
});

export const deleteByIdSchema = z.object({ id: z.string().uuid("Identifiant invalide") });

/** Résultat d'une action de formulaire, rendu tel quel par l'interface. */
export type ActionResult =
  | { readonly status: "idle" }
  | { readonly status: "success"; readonly message: string }
  | {
      readonly status: "error";
      readonly message: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

/** Convertit une erreur Zod en messages par champ, exploitables par le formulaire. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    fields[key] ??= issue.message;
  }
  return fields;
}

export { positiveDecimal };

/**
 * Mot que l'utilisateur doit recopier pour supprimer toutes ses données.
 *
 * Une case à cocher se coche sans lire. Recopier un mot oblige à traverser la
 * phrase qui l'annonce, et c'est la dernière barrière avant une suppression
 * définitive et sans sauvegarde automatique.
 */
export const DELETION_CONFIRMATION = "SUPPRIMER";

export const deleteEverythingSchema = z.object({
  confirmation: z.literal(DELETION_CONFIRMATION, {
    errorMap: () => ({
      message: `Recopiez exactement « ${DELETION_CONFIRMATION} » pour confirmer.`,
    }),
  }),
});
