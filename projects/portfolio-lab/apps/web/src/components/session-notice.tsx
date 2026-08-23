import { sessionMessage, type SessionState } from "@/lib/auth/session";

/**
 * Bandeau d'état de session.
 *
 * Chacun des trois cas non authentifiés reçoit un ton distinct : une session
 * expirée est un incident temporaire, une absence de configuration est un
 * problème d'installation, un visiteur anonyme est un état normal.
 */
export function SessionNotice({
  state,
}: Readonly<{ state: SessionState }>): React.JSX.Element | null {
  const message = sessionMessage(state);
  if (message === null) {
    return null;
  }

  const tone =
    state.status === "unconfigured"
      ? { border: "border-warning/40", text: "text-warning", label: "Configuration requise" }
      : state.status === "expired"
        ? { border: "border-warning/40", text: "text-warning", label: "Session expirée" }
        : { border: "border-subtle", text: "text-secondary", label: "Non connecté" };

  return (
    <div
      role="status"
      className={`mb-6 rounded-token-md border ${tone.border} bg-surface px-4 py-3`}
    >
      <p className={`text-xs font-medium tracking-wide uppercase ${tone.text}`}>{tone.label}</p>
      <p className="mt-1 text-sm text-secondary">{message}</p>
    </div>
  );
}
