"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formaterEuros } from "../../../lib/formatage";
import { appelerAction } from "../_partage/reponses";

export function FormulaireEmbauche({
  smicMensuelBrut,
  verrouille,
}: {
  smicMensuelBrut: number;
  /** Embauche pas encore débloquée par l'étape : le bandeau de la page l'explique. */
  verrouille: boolean;
}) {
  const router = useRouter();
  const [poste, setPoste] = useState<"artisan" | "encadrement">("artisan");
  const [salaire, setSalaire] = useState((smicMensuelBrut / 100).toFixed(2));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  async function embaucher(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setAvertissement(null);
    setSucces(null);
    const centimes = Math.round(parseFloat(salaire.replace(",", ".")) * 100);
    if (!Number.isFinite(centimes) || centimes <= 0) {
      setErreur("Salaire invalide.");
      return;
    }
    setEnCours(true);
    const r = await appelerAction("/api/actions/embaucher", {
      poste,
      salaireBrutMensuelCentimes: centimes,
    });
    setEnCours(false);
    if (!r.ok) {
      setErreur(r.message);
      return;
    }
    setSucces("Salarié embauché.");
    if (r.data["sansPosteLibre"] === true) {
      setAvertissement(
        "Ce salarié n'a pas de poste : il ne produira pas tant qu'un poste n'est pas libre. Son salaire est dû dès maintenant.",
      );
    }
    router.refresh();
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
          {(["artisan", "encadrement"] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={poste === p}
              onClick={() => setPoste(p)}
              className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                poste === p
                  ? "border-[color:var(--color-noir)] bg-[color:var(--color-noir)] text-[color:var(--color-blanc)]"
                  : "border-[color:var(--color-g-300)]"
              }`}
            >
              {p === "artisan" ? "Artisan" : "Encadrement"}
            </button>
          ))}
        </div>
      </div>

      <div className="col-span-2 space-y-1.5">
        <label
          htmlFor="salaire-embauche"
          className="block text-xs uppercase tracking-wider text-[color:var(--color-g-500)]"
        >
          Salaire brut mensuel (€)
        </label>
        <input
          id="salaire-embauche"
          type="text"
          inputMode="decimal"
          value={salaire}
          onChange={(e) => setSalaire(e.target.value)}
          className="chiffre w-full rounded-md border border-[color:var(--color-g-300)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-noir)]"
        />
        <p className="text-xs text-[color:var(--color-g-500)]">
          SMIC mensuel brut : {formaterEuros(smicMensuelBrut)} €.
        </p>
      </div>

      {erreur && (
        <p role="alert" className="col-span-5 text-sm text-[color:var(--color-erreur)]">
          {erreur}
        </p>
      )}
      {succes && (
        <p role="status" className="col-span-5 text-sm text-[color:var(--color-succes)]">
          {succes}
        </p>
      )}
      {avertissement && (
        <p role="status" className="col-span-5 text-sm text-[color:var(--color-g-700)]">
          Attention : {avertissement}
        </p>
      )}

      <div className="col-span-5 flex justify-end">
        <button
          type="submit"
          disabled={enCours || verrouille}
          className="rounded-md bg-[color:var(--color-noir)] px-4 py-2 text-sm font-medium text-[color:var(--color-blanc)] transition hover:bg-[color:var(--color-g-900)] disabled:opacity-50"
        >
          {enCours ? "Embauche..." : "Embaucher"}
        </button>
      </div>
    </form>
  );
}

export function BoutonLicencier({ id, indemniteCentimes }: { id: string; indemniteCentimes: number }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function licencier() {
    const annonce =
      indemniteCentimes > 0
        ? `Licencier ce salarié ? L'indemnité légale de licenciement est de ${formaterEuros(indemniteCentimes)} €, payée tout de suite.`
        : "Licencier ce salarié ? Il n'a pas encore assez d'ancienneté : aucune indemnité n'est due.";
    if (!confirm(annonce)) return;
    setErreur(null);
    setEnCours(true);
    const r = await appelerAction("/api/actions/licencier", { employeeId: id });
    setEnCours(false);
    if (!r.ok) {
      setErreur(r.message);
      return;
    }
    const versee = typeof r.data["indemniteCentimes"] === "number" ? r.data["indemniteCentimes"] : 0;
    alert(
      versee > 0
        ? `Salarié licencié. Indemnité versée : ${formaterEuros(versee)} €.`
        : "Salarié licencié. Aucune indemnité n'était due.",
    );
    router.refresh();
  }

  return (
    <div className="text-right">
      <button
        onClick={licencier}
        disabled={enCours}
        className="text-xs text-[color:var(--color-erreur)] underline disabled:opacity-50"
      >
        {enCours ? "..." : "Licencier"}
      </button>
      {erreur && (
        <p role="alert" className="mt-1 max-w-xs text-xs text-[color:var(--color-erreur)]">
          {erreur}
        </p>
      )}
    </div>
  );
}
