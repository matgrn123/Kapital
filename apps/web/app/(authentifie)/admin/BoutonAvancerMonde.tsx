"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Resultat = {
  ok: boolean;
  pasCible?: number;
  moisCourant?: number;
  erreurs?: number;
  entreprises?: { etat: string }[];
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
        {enCours ? "En cours..." : "Mettre le monde à jour maintenant"}
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
              <p className="font-medium">Monde à jour.</p>
              <p className="chiffre mt-1 text-xs text-[color:var(--color-g-700)]">
                Mois de jeu {resultat.moisCourant} · pas {resultat.pasCible} ·{" "}
                {resultat.entreprises?.filter((e) => e.etat === "avancee").length ?? 0}{" "}
                entreprise(s) rattrapée(s)
              </p>
            </>
          ) : (
            <p>
              Erreur : {resultat.error ?? `${resultat.erreurs} entreprise(s) en erreur (voir les journaux)`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
