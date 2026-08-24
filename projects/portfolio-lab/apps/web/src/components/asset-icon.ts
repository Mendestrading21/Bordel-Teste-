import type { AssetType } from "@portfolio-lab/domain";

/**
 * Émoji par classe d'actifs.
 *
 * La table est **totale** : `Record<AssetType, string>` et non `Partial`. Une
 * classe ajoutée au domaine casse alors la compilation ici, au lieu de
 * s'afficher silencieusement avec une puce générique dans deux écrans.
 *
 * Ces émojis sont des marqueurs sémantiques, jamais de la décoration : ils
 * accompagnent toujours un libellé texte et restent `aria-hidden`.
 */
export const ASSET_ICON: Readonly<Record<AssetType, string>> = {
  STOCK: "📈",
  ETF: "🧺",
  OPTION: "🎯",
  MUTUAL_FUND: "🏦",
  BOND: "📜",
  CRYPTO: "🪙",
  FX: "💱",
  INDEX: "📊",
  FUTURE: "⏳",
  COMMODITY: "🛢️",
  STRUCTURED_PRODUCT: "🧩",
  PRIVATE_ASSET: "🔒",
  CASH: "💵",
  OTHER: "✏️",
};
