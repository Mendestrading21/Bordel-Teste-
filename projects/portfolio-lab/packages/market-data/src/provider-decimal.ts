import { Decimal, fromDecimal, type DecimalString } from "@portfolio-lab/domain";

import { ProviderError } from "./contract.js";

/**
 * Convertit une valeur numérique de fournisseur en `DecimalString` canonique.
 *
 * Les fournisseurs n'écrivent pas les nombres de la même façon : Twelve Data
 * renvoie `"227.31000"`, EODHD `227.31`, CoinGecko un `number` JSON. Laisser
 * passer ces formes telles quelles ferait que **le même prix, chez deux
 * fournisseurs, produirait deux chaînes différentes** — comparaisons faussées,
 * déduplication inopérante et zéros parasites à l'écran.
 *
 * La conversion passe par `Decimal` plutôt que par `toDecimalString`, et c'est
 * délibéré. `toDecimalString` refuse la notation exponentielle, ce qui est la
 * bonne règle **à l'intérieur** de l'application : une `DecimalString` stockée
 * ou transportée doit être lisible sans interprétation. Mais à la frontière
 * d'un fournisseur, refuser `1e-7` reviendrait à rejeter silencieusement les
 * jetons à très petit prix — `String(1e-7)` vaut `"1e-7"` en JavaScript, et
 * c'est exactement la forme que produit un `number` JSON de CoinGecko. Le rôle
 * de cette fonction est justement de traduire ces formes vers la forme
 * canonique, pas de les rejeter.
 *
 * La valeur n'est **jamais arrondie** : un fournisseur qui envoie dix-huit
 * décimales les garde toutes, c'est la couche d'affichage qui décide combien en
 * montrer.
 *
 * Une valeur illisible lève une `ProviderError` typée plutôt qu'une erreur
 * générique, pour que le routeur puisse basculer sur un autre fournisseur au
 * lieu de faire tomber la requête entière.
 */
export function providerDecimal(value: unknown, providerId: string, field: string): DecimalString {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      providerId,
      `Champ numérique absent ou de type inattendu : ${field}`,
    );
  }

  /*
   * `String(value)` sur un `number` JSON donne la représentation la plus courte
   * qui revient au même flottant. C'est le mieux disponible à cette frontière :
   * `JSON.parse` a déjà transformé le texte en flottant avant qu'on le voie.
   * Les fournisseurs qui renvoient des chaînes — le cas le plus courant —
   * n'ont pas ce détour.
   */
  const raw = String(value).trim();
  if (raw === "") {
    throw new ProviderError("MALFORMED_RESPONSE", providerId, `Champ numérique vide : ${field}`);
  }

  let parsed: Decimal;
  try {
    parsed = new Decimal(raw);
  } catch {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      providerId,
      `Champ numérique illisible : ${field}`,
    );
  }

  if (!parsed.isFinite()) {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      providerId,
      `Champ numérique non fini : ${field}`,
    );
  }

  return fromDecimal(parsed);
}
