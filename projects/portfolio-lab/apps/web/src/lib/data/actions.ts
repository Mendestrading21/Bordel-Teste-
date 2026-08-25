"use server";

import { revalidatePath } from "next/cache";

import {
  ConflictError,
  accountRepository,
  createDatabase,
  loadDatabaseConfig,
  portfolioRepository,
  positionRepository,
  type Database,
} from "@portfolio-lab/database";
import { toDecimalString, type CurrencyCode } from "@portfolio-lab/domain";

import { recordSnapshot } from "./analytics";
import { deleteAllUserData } from "./export";
import { loadPortfolioView } from "./portfolio";
import {
  createAccountSchema,
  createInstrumentSchema,
  createPositionSchema,
  deleteByIdSchema,
  deleteEverythingSchema,
  toFieldErrors,
  updatePositionSchema,
  type ActionResult,
} from "./validation";
import { deletionLimiter, logger, mutationLimiter } from "../security/limits";
import { currentUserId } from "@/lib/auth/owner";

/**
 * Actions serveur du portefeuille.
 *
 * Chaque action revalide son identité par `resolveDataMode` plutôt que de faire
 * confiance à un identifiant transmis par le formulaire : une action serveur
 * est une route HTTP publique, et son entrée est aussi manipulable que
 * n'importe quel corps de requête.
 */

let cachedDatabase: Database | null = null;

function database(): Database {
  cachedDatabase ??= createDatabase(loadDatabaseConfig());
  return cachedDatabase;
}

/**
 * Identité de l'utilisateur courant, ou `null` si aucune n'est établie.
 *
 * Réexportée sous un nom local pour que les actions ci-dessous restent
 * lisibles, mais la résolution est **unique** et vit dans `@/lib/auth/owner` :
 * treize copies de cette logique existaient auparavant, toutes limitées au mode
 * démonstration, et l'application était vide partout ailleurs.
 */
async function callerId(): Promise<string | null> {
  return currentUserId();
}

const NOT_AUTHENTICATED: ActionResult = {
  status: "error",
  message: "Aucune session active. Impossible de modifier les données.",
};

/**
 * Valeur textuelle d'un champ, ou `undefined` s'il est absent.
 *
 * `FormData.get` renvoie `null` pour un champ qui n'existe pas dans le
 * document — et les champs d'identifiant du formulaire d'instrument ne sont
 * rendus que si un type est choisi. Un schéma `.optional()` reçoit alors
 * `null` au lieu de `undefined` et rejette la saisie, avec un message qui parle
 * de type et non de ce que l'utilisateur a fait.
 */
function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

/**
 * Crée un instrument dans le référentiel local.
 *
 * Sans cette action, l'application était **inutilisable dès la première prise
 * en main** : le sélecteur du formulaire d'ajout lit la table `instruments`,
 * vide sur toute base neuve. L'utilisateur se connectait, cliquait
 * « Ajouter », et trouvait une liste sans aucune entrée — sans qu'aucune
 * erreur ne l'explique.
 *
 * L'identifiant est saisi dans la **même transaction** que l'instrument :
 * séparer les deux laisserait, en cas d'échec du second appel, un instrument
 * définitivement non cotable dont rien ne dirait pourquoi.
 */
export async function createInstrumentAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await callerId();
  if (userId === null) {
    return NOT_AUTHENTICATED;
  }

  const parsed = createInstrumentSchema.safeParse({
    name: text(formData, "name"),
    shortName: text(formData, "shortName"),
    assetType: text(formData, "assetType"),
    currency: text(formData, "currency"),
    exchangeMic: text(formData, "exchangeMic"),
    // Chaîne vide = « aucun identifiant », le choix par défaut du sélecteur.
    identifierType: text(formData, "identifierType") || undefined,
    identifierValue: text(formData, "identifierValue"),
    identifierProvider: text(formData, "identifierProvider"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "L'instrument n'a pas pu être créé.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const input = parsed.data;

  try {
    await database().withUser(userId, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into instruments (asset_type, name, short_name, primary_currency, exchange_mic)
         values ($1::asset_type, $2, $3, $4, $5)
         returning id`,
        [input.assetType, input.name, input.shortName, input.currency, input.exchangeMic],
      );

      const instrumentId = rows[0]?.id;
      if (instrumentId === undefined) {
        throw new ConflictError("L'instrument n'a pas pu être enregistré");
      }

      if (input.identifierType === undefined || input.identifierValue === null) return;

      /*
       * Un ISIN est normalisé en majuscules avant insertion : la contrainte de
       * la base le valide sous cette forme, et un ISIN saisi en minuscules
       * serait rejeté par une erreur qui ne dirait pas pourquoi.
       */
      const value =
        input.identifierType === "ISIN"
          ? input.identifierValue.toUpperCase()
          : input.identifierValue;

      await client.query(
        `insert into instrument_identifiers
           (instrument_id, identifier_type, identifier_value, provider, exchange_mic)
         values ($1, $2::identifier_type, $3, $4, $5)`,
        [instrumentId, input.identifierType, value, input.identifierProvider, input.exchangeMic],
      );
    });
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/ajouter");
  return {
    status: "success",
    message:
      input.identifierType === undefined
        ? "Instrument créé. Sans identifiant, son cours restera en saisie manuelle."
        : "Instrument créé. Son cours sera cherché au prochain rafraîchissement.",
  };
}

/**
 * Traduit une erreur en message utilisateur.
 *
 * Le détail interne n'est jamais exposé : il peut contenir des noms de colonnes
 * et des identifiants.
 */
function toActionError(error: unknown): ActionResult {
  if (error instanceof ConflictError) {
    return { status: "error", message: error.message };
  }
  return {
    status: "error",
    message: "L'opération a échoué. Vérifiez les données saisies et réessayez.",
  };
}

export async function createAccountAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await callerId();
  if (userId === null) {
    return NOT_AUTHENTICATED;
  }

  const parsed = createAccountSchema.safeParse({
    name: formData.get("name"),
    institutionLabel: formData.get("institutionLabel"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Le compte n'a pas pu être créé.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  try {
    await database().withUser(userId, async (client) => {
      const portfolios = await portfolioRepository.list(client);
      const portfolio = portfolios[0];
      if (portfolio === undefined) {
        throw new ConflictError("Aucun portefeuille n'existe pour cet utilisateur");
      }
      await accountRepository.create(client, {
        userId,
        portfolioId: portfolio.id,
        name: parsed.data.name,
        institutionLabel: parsed.data.institutionLabel,
        displayOrder: 0,
      });
    });
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/reglages");
  revalidatePath("/positions");
  return { status: "success", message: `Compte « ${parsed.data.name} » créé.` };
}

export async function createPositionAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await callerId();
  if (userId === null) {
    return NOT_AUTHENTICATED;
  }

  const parsed = createPositionSchema.safeParse({
    accountId: formData.get("accountId"),
    instrumentId: formData.get("instrumentId"),
    quantity: formData.get("quantity"),
    averageCost: formData.get("averageCost"),
    costCurrency: formData.get("costCurrency"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "La position n'a pas pu être enregistrée.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  try {
    await database().withUser(userId, async (client) => {
      const portfolios = await portfolioRepository.list(client);
      const portfolio = portfolios[0];
      if (portfolio === undefined) {
        throw new ConflictError("Aucun portefeuille n'existe pour cet utilisateur");
      }
      await positionRepository.create(client, {
        userId,
        portfolioId: portfolio.id,
        accountId: parsed.data.accountId,
        instrumentId: parsed.data.instrumentId,
        quantity: toDecimalString(parsed.data.quantity),
        averageCost: toDecimalString(parsed.data.averageCost),
        costCurrency: parsed.data.costCurrency as CurrencyCode,
        notes: parsed.data.notes,
      });
    });
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/");
  revalidatePath("/positions");
  revalidatePath("/analyse");
  return { status: "success", message: "Position enregistrée." };
}

/**
 * Modifie une position existante.
 *
 * Seuls la quantité, le coût moyen, sa devise et les notes sont modifiables.
 * L'instrument et le compte ne le sont pas : les changer réécrirait le passé de
 * la position, dont les points d'historique ont été calculés sur l'instrument
 * d'origine.
 */
export async function updatePositionAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await callerId();
  if (userId === null) {
    return NOT_AUTHENTICATED;
  }

  const parsed = updatePositionSchema.safeParse({
    id: formData.get("id"),
    quantity: formData.get("quantity"),
    averageCost: formData.get("averageCost"),
    costCurrency: formData.get("costCurrency"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "La position n'a pas pu être modifiée.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const decision = mutationLimiter.check(userId, Date.now());
  if (!decision.allowed) {
    return { status: "error", message: "Trop de modifications. Réessayez dans un instant." };
  }

  try {
    const updated = await database().withUser(userId, (client) =>
      positionRepository.update(client, parsed.data.id, {
        quantity: toDecimalString(parsed.data.quantity),
        averageCost: toDecimalString(parsed.data.averageCost),
        costCurrency: parsed.data.costCurrency as CurrencyCode,
        notes: parsed.data.notes,
      }),
    );
    if (updated === null) {
      // RLS rend invisible la ligne d'un tiers : « introuvable » est donc aussi
      // la réponse à une tentative sur la position d'autrui.
      return { status: "error", message: "Position introuvable." };
    }
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/");
  revalidatePath("/positions");
  revalidatePath("/analyse");
  revalidatePath(`/positions/${parsed.data.id}`);
  return { status: "success", message: "Position modifiée." };
}

export async function deletePositionAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await callerId();
  if (userId === null) {
    return NOT_AUTHENTICATED;
  }

  const parsed = deleteByIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { status: "error", message: "Position introuvable." };
  }

  try {
    const removed = await database().withUser(userId, (client) =>
      positionRepository.delete(client, parsed.data.id),
    );
    if (!removed) {
      // RLS rend invisible la ligne d'un tiers : « rien supprimé » est donc
      // aussi la réponse à une tentative sur la position d'autrui.
      return { status: "error", message: "Position introuvable." };
    }
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/");
  revalidatePath("/positions");
  revalidatePath("/analyse");
  return { status: "success", message: "Position supprimée." };
}

export async function archiveAccountAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await callerId();
  if (userId === null) {
    return NOT_AUTHENTICATED;
  }

  const parsed = deleteByIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { status: "error", message: "Compte introuvable." };
  }

  try {
    // Archivage et non suppression : supprimer emporterait les positions en
    // cascade.
    const archived = await database().withUser(userId, (client) =>
      accountRepository.archive(client, parsed.data.id),
    );
    if (!archived) {
      return { status: "error", message: "Compte introuvable ou déjà archivé." };
    }
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/reglages");
  revalidatePath("/positions");
  return { status: "success", message: "Compte archivé." };
}

/**
 * Enregistre un point d'historique du patrimoine.
 *
 * L'action est **explicite** plutôt que déclenchée par l'affichage d'une page :
 * un enregistrement à chaque rendu multiplierait les points sans qu'aucun
 * n'apporte d'information, et écrirait en base sur une simple lecture.
 *
 * `DATA_MODEL.md` prévoit par ailleurs un snapshot quotidien automatique après
 * publication des données attendues ; il dépend d'un ordonnanceur, absent tant
 * qu'aucun fournisseur réel n'alimente les cours.
 */
export async function recordSnapshotAction(
  _previous: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  const userId = await callerId();
  if (userId === null) {
    return NOT_AUTHENTICATED;
  }

  try {
    const view = await loadPortfolioView();
    if (view.valuation === null) {
      return { status: "error", message: "Aucun portefeuille à enregistrer." };
    }

    const result = await recordSnapshot(view, view.valuation, new Date());
    if (!result.recorded) {
      return { status: "error", message: result.reason ?? "Point d'historique non enregistré." };
    }
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/analyse");
  return { status: "success", message: "Point d'historique enregistré." };
}

/**
 * Supprime définitivement toutes les données de l'utilisateur.
 *
 * `§11` de la commande exige une « suppression complète des données
 * utilisateur ». Trois protections l'encadrent, et aucune n'est décorative :
 *
 * 1. **un mot à recopier** — une case à cocher se coche sans lire ;
 * 2. **une limite de débit** — pour qu'un script ne puisse pas la marteler ;
 * 3. **une vérification a posteriori** — les lignes restantes sont comptées
 *    table par table, et une suppression incomplète est signalée comme un
 *    échec. Annoncer « données supprimées » alors qu'il en reste serait le pire
 *    résultat possible de cet écran.
 */
export async function deleteEverythingAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await callerId();
  if (userId === null) {
    return NOT_AUTHENTICATED;
  }

  const parsed = deleteEverythingSchema.safeParse({
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Suppression annulée : la confirmation ne correspond pas.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const decision = deletionLimiter.check(userId, Date.now());
  if (!decision.allowed) {
    return {
      status: "error",
      message: "Trop de tentatives. Réessayez dans quelques minutes.",
    };
  }

  let report: Awaited<ReturnType<typeof deleteAllUserData>>;
  try {
    report = await deleteAllUserData();
  } catch (error) {
    logger.error("suppression des données impossible", { userId });
    return toActionError(error);
  }

  if (report === null) {
    return NOT_AUTHENTICATED;
  }

  const leftovers = Object.keys(report.remaining);
  if (leftovers.length > 0) {
    logger.error("suppression incomplète", { userId, tables: leftovers.join(",") });
    return {
      status: "error",
      message:
        "La suppression est incomplète : certaines données subsistent. " +
        "Rien n'est confirmé tant que ce n'est pas résolu.",
    };
  }

  logger.info("données utilisateur supprimées", {
    userId,
    portfolios: report.deletedPortfolios,
  });

  revalidatePath("/");
  revalidatePath("/positions");
  revalidatePath("/analyse");
  revalidatePath("/reglages");

  return {
    status: "success",
    message: "Toutes vos données ont été supprimées. Il n'en reste aucune trace en base.",
  };
}
