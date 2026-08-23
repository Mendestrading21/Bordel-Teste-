import { currencyCodeSchema } from "@portfolio-lab/domain";
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
