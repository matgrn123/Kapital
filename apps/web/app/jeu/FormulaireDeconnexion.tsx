"use client";

import { useRouter } from "next/navigation";
import { creerClientNavigateur } from "../../lib/supabase/client";

export function FormulaireDeconnexion() {
  const router = useRouter();

  async function deconnecter() {
    const supabase = creerClientNavigateur();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={deconnecter}
      className="mt-1 text-xs underline hover:text-[color:var(--color-noir)]"
    >
      Déconnexion
    </button>
  );
}
