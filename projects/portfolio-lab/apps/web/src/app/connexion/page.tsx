import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { resolveCaller } from "@/lib/auth/owner";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

export default async function ConnexionPage(): Promise<React.JSX.Element> {
  // Déjà connecté : rester sur cet écran n'aurait aucun sens.
  const caller = await resolveCaller();
  if (caller.kind !== "anonymous") {
    redirect("/");
  }

  return (
    <>
      <PageHeader
        title="Connexion"
        subtitle="Votre patrimoine est privé. Une phrase secrète en ouvre l'accès."
      />
      <div className="mt-6">
        <LoginForm />
      </div>
    </>
  );
}
