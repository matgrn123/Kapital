"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Resultat = {
  ok: boolean;
  mois_debut?: number;
  mois_fin?: number;
  duree_mois?: number;
  ventes_generees?: number;
  ecritures_inserees?: number;
  error?: string;
};

export function BoutonAvancerMonde() {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  async function declencher() {
    setEnCours(true);
    setResultat(null);
    try {
      const reponse = await fetch("/api/admin/monde/avancer-ui", {
        method: "POST",
      });
      const data = (await reponse.json()) as Resultat;
      setResultat(data);
      if (data.ok) router.refresh();
    } catch (ex) {
      setResultat({
        ok: false,
        error: ex instanceof Error ? ex.message : "Erreur inconnue",
      });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={declencher}
        disabled={enCours}
        className="rounded-md bg-[color:var(--color-noir)] px-4 py-2 text-sm font-medium text-[color:var(--color-blanc)] transition hover:bg-[color:var(--color-g-900)] disabled:opacity-50"
      >
        {enCours ? "En cours..." : "Avancer d'un mois"}
      </button>

      {resultat && (
        <div
          className={`mt-4 rounded-md border p-4 text-sm ${
            resultat.ok
              ? "border-[color:var(--color-g-300)] bg-[color:var(--color-g-100)]"
              : "border-[color:var(--color-erreur)] text-[color:var(--color-erreur)]"
          }`}
        >
          {resultat.ok ? (
            <>
              <p className="font-medium">Monde avancé.</p>
              <p className="chiffre mt-1 text-xs text-[color:var(--color-g-700)]">
                Mois {resultat.mois_debut} → {resultat.mois_fin} ·{" "}
                {resultat.ventes_generees} ventes générées ·{" "}
                {resultat.ecritures_inserees} écritures insérées
              </p>
            </>
          ) : (
            <p>Erreur : {resultat.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
