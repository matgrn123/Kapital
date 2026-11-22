"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BoutonApprovisionner({ productId }: { productId: string }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function approvisionner() {
    setErreur(null);
    setEnCours(true);
    try {
      const reponse = await fetch("/api/produits/approvisionner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, quantite: 100 }),
      });
      const data = (await reponse.json()) as { error?: string };
      if (data.error) {
        setErreur(data.error);
        return;
      }
      router.refresh();
    } catch (ex) {
      setErreur(ex instanceof Error ? ex.message : "Erreur inconnue");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {erreur && (
        <span className="text-xs text-[color:var(--color-erreur)]">{erreur}</span>
      )}
      <button
        type="button"
        onClick={approvisionner}
        disabled={enCours}
        className="rounded-md border border-[color:var(--color-g-300)] px-3 py-1 text-xs font-medium hover:bg-[color:var(--color-blanc)] disabled:opacity-50"
      >
        {enCours ? "..." : "+ 100 (recette)"}
      </button>
    </div>
  );
}
