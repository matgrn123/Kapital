"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { creerClientNavigateur } from "../../../lib/supabase/client";

export function FormulaireEmbauche({
  companyId,
  etape,
}: {
  companyId: string;
  etape: number;
}) {
  const router = useRouter();
  const [poste, setPoste] = useState<"artisan" | "encadrement">("artisan");
  const [salaire, setSalaire] = useState("1867.02");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function embaucher(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    const centimes = Math.round(parseFloat(salaire) * 100);
    if (!Number.isFinite(centimes) || centimes <= 0) {
      setErreur("Salaire invalide.");
      return;
    }
    if (poste === "encadrement" && etape < 1) {
      setErreur(`L'encadrement est débloqué à partir de l'étape 1 (vous êtes à l'étape ${etape}).`);
      return;
    }
    setEnCours(true);
    try {
      const supabase = creerClientNavigateur();
      const { error } = await supabase.from("employees").insert({
        company_id: companyId,
        poste,
        salaire_brut_mensuel_centimes: centimes,
      });
      if (error) {
        setErreur(error.message);
        return;
      }
      router.refresh();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form
      onSubmit={embaucher}
      className="grid grid-cols-5 gap-4 rounded-md border border-[color:var(--color-g-200)] p-5"
    >
      <div className="col-span-2 space-y-1.5">
        <span className="block text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Poste
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPoste("artisan")}
            className={`flex-1 rounded-md border px-3 py-2 text-sm ${
              poste === "artisan"
                ? "border-[color:var(--color-noir)] bg-[color:var(--color-noir)] text-[color:var(--color-blanc)]"
                : "border-[color:var(--color-g-300)]"
            }`}
          >
            Artisan
          </button>
          <button
            type="button"
            onClick={() => setPoste("encadrement")}
            disabled={etape < 1}
            className={`flex-1 rounded-md border px-3 py-2 text-sm disabled:opacity-40 ${
              poste === "encadrement"
                ? "border-[color:var(--color-noir)] bg-[color:var(--color-noir)] text-[color:var(--color-blanc)]"
                : "border-[color:var(--color-g-300)]"
            }`}
          >
            Encadrement
          </button>
        </div>
      </div>

      <div className="col-span-2 space-y-1.5">
        <span className="block text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Salaire brut mensuel (€)
        </span>
        <input
          type="text"
          value={salaire}
          onChange={(e) => setSalaire(e.target.value)}
          className="chiffre w-full rounded-md border border-[color:var(--color-g-300)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-noir)]"
        />
        <p className="text-xs text-[color:var(--color-g-500)]">SMIC mensuel brut : 1 867,02 €.</p>
      </div>

      {erreur && (
        <p role="alert" className="col-span-5 text-sm text-[color:var(--color-erreur)]">
          {erreur}
        </p>
      )}

      <div className="col-span-5 flex justify-end">
        <button
          type="submit"
          disabled={enCours}
          className="rounded-md bg-[color:var(--color-noir)] px-4 py-2 text-sm font-medium text-[color:var(--color-blanc)] transition hover:bg-[color:var(--color-g-900)] disabled:opacity-50"
        >
          {enCours ? "Embauche..." : "Embaucher"}
        </button>
      </div>
    </form>
  );
}

export function BoutonLicencier({ id }: { id: string }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);

  async function licencier() {
    if (!confirm("Licencier ce salarié ? Les indemnités ne sont pas encore modélisées.")) return;
    setEnCours(true);
    try {
      const supabase = creerClientNavigateur();
      await supabase.from("employees").update({ statut: "licencie" }).eq("id", id);
      router.refresh();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <button
      onClick={licencier}
      disabled={enCours}
      className="text-xs text-[color:var(--color-erreur)] underline disabled:opacity-50"
    >
      {enCours ? "..." : "Licencier"}
    </button>
  );
}
