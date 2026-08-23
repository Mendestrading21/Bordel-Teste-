import { z } from "zod";

/**
 * Configuration Supabase de l'application web.
 *
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` est publique par construction : elle part
 * dans le bundle du navigateur. Ce n'est pas un secret — c'est précisément
 * pourquoi RLS est obligatoire sur toutes les tables. La clé `service_role`,
 * elle, ne doit jamais être préfixée `NEXT_PUBLIC_` : elle contourne RLS.
 */
const supabaseConfigSchema = z.object({
  url: z.string().url("NEXT_PUBLIC_SUPABASE_URL doit être une URL valide"),
  anonKey: z.string().min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY semble incomplète"),
});

export type SupabaseConfig = z.infer<typeof supabaseConfigSchema>;

/**
 * Vue en lecture seule de l'environnement.
 *
 * Volontairement plus simple que `NodeJS.ProcessEnv` : ce module est compilé
 * pour le navigateur autant que pour le serveur et ne doit pas dépendre des
 * types Node.
 */
export type EnvRecord = Readonly<Record<string, string | undefined>>;

export type SupabaseConfigResult =
  | { readonly configured: true; readonly config: SupabaseConfig }
  | { readonly configured: false; readonly reason: string };

/**
 * Lit la configuration sans lever d'exception.
 *
 * L'application doit rester démarrable sans Supabase — c'est l'état du dépôt
 * tant qu'aucun projet n'est créé. Une absence de configuration produit un
 * écran explicite, jamais un plantage au build.
 */
export function readSupabaseConfig(env: EnvRecord = process.env): SupabaseConfigResult {
  const url = env["NEXT_PUBLIC_SUPABASE_URL"];
  const anonKey = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  if (!url && !anonKey) {
    return {
      configured: false,
      reason:
        "Supabase n'est pas configuré. Renseigner NEXT_PUBLIC_SUPABASE_URL et " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY dans .env.local.",
    };
  }

  const result = supabaseConfigSchema.safeParse({ url, anonKey });
  if (!result.success) {
    return {
      configured: false,
      // Les valeurs reçues ne sont jamais reprises dans le message.
      reason: `Configuration Supabase incomplète : ${result.error.issues
        .map((issue) => issue.message)
        .join(" ; ")}`,
    };
  }

  return { configured: true, config: result.data };
}

/**
 * Détecte une clé `service_role` exposée côté client.
 *
 * Un JWT Supabase encode son rôle dans sa charge utile. Si la clé publiée au
 * navigateur porte le rôle `service_role`, toutes les politiques RLS sont
 * contournables par quiconque lit le bundle. Le cas est assez grave pour
 * mériter une détection explicite plutôt qu'un commentaire dans la
 * documentation.
 */
export function looksLikeServiceRoleKey(key: string): boolean {
  const segments = key.split(".");
  if (segments.length !== 3) {
    return false;
  }
  try {
    const payloadSegment = segments[1] ?? "";
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const payload: unknown = JSON.parse(decoded);
    return (
      typeof payload === "object" &&
      payload !== null &&
      "role" in payload &&
      (payload as { role: unknown }).role === "service_role"
    );
  } catch {
    // Une clé illisible n'est pas une preuve de service_role.
    return false;
  }
}
