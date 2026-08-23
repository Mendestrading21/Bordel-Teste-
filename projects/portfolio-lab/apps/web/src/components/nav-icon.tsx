/**
 * Pictogrammes de la navigation basse.
 *
 * Dessinés en SVG inline plutôt qu'importés depuis une librairie d'icônes :
 * cinq glyphes ne justifient pas une dépendance supplémentaire dans le bundle
 * d'une application installée sur téléphone.
 */
const PATHS: Readonly<Record<string, string>> = {
  Accueil: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  Positions: "M4 19V5m0 14h16M8 15V9m4 6V6m4 9v-4",
  Ajouter: "M12 5v14M5 12h14",
  Analyse: "M4 19h16M7 16V8m5 8v-5m5 5V6",
  Réglages: "M4 7h16M4 12h16M4 17h10",
};

export function NavIcon({
  name,
  active,
}: Readonly<{ name: string; active: boolean }>): React.JSX.Element {
  const path = PATHS[name] ?? PATHS["Réglages"];
  const isAdd = name === "Ajouter";

  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth={active || isAdd ? 2.2 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {isAdd ? <circle cx="12" cy="12" r="9" strokeWidth={1.7} /> : null}
      <path d={path} />
    </svg>
  );
}
