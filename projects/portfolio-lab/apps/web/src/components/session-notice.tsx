import { sessionMessage, type SessionState } from "@/lib/auth/session";

import { Notice } from "./notice";

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

  const { tone, label, icon } =
    state.status === "unconfigured"
      ? { tone: "warning" as const, label: "Configuration requise", icon: "⚙️" }
      : state.status === "expired"
        ? { tone: "warning" as const, label: "Session expirée", icon: "⏱️" }
        : { tone: "neutral" as const, label: "Non connecté", icon: "🔒" };

  /*
   * Le message est court et ne se replie pas : contrairement au bandeau de
   * démonstration, il n'a pas d'explication longue à donner, et le replier
   * ajouterait une interaction pour rien.
   */
  return <Notice role="status" tone={tone} icon={icon} label={label} summary={message} />;
}
