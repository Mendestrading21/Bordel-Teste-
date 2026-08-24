import type { AssetType } from "@portfolio-lab/domain";

import { ASSET_ICON } from "./asset-icon";
import { cx } from "./ui";

/**
 * Pastille d'identité d'un instrument.
 *
 * Affiche le symbole court, ou l'émoji de la classe d'actifs à défaut.
 *
 * Le symbole est coupé à **quatre** caractères, pas cinq : un `DEMOI` de cinq
 * caractères débordait de la pastille et se retrouvait rogné des deux côtés,
 * ce qui se lit comme un défaut d'affichage. Mieux vaut un symbole
 * volontairement abrégé qu'un symbole cassé — le nom complet est juste à côté.
 *
 * `overflow-hidden` reste par sécurité : un symbole exotique plus large que
 * prévu doit être coupé net, jamais chevaucher le nom.
 */
export function InstrumentAvatar({
  symbol,
  assetType,
  size = "sm",
}: Readonly<{
  symbol: string | null;
  assetType: AssetType;
  size?: "sm" | "md" | undefined;
}>): React.JSX.Element {
  const trimmed = symbol?.trim() ?? "";
  const label = trimmed === "" ? ASSET_ICON[assetType] : trimmed.slice(0, 4);

  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid shrink-0 place-items-center overflow-hidden rounded-token-sm bg-elevated font-medium text-secondary tabular-nums",
        size === "sm" ? "size-9 text-[10px]" : "size-11 text-[11px]",
      )}
    >
      {label}
    </span>
  );
}
