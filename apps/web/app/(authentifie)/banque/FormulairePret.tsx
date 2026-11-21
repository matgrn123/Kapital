"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { creerClientNavigateur } from "../../../lib/supabase/client";
import { formaterEuros } from "../../../lib/formatage";

const HEURES_PAR_MOIS_JEU = 24;
const TAUX_ANNUEL = 0.055; // approximation : €STR ~3,5 % + marge 2 %

function mensualite(capital: number, tauxAnnuel: number, dureeMois: number): number {
  if (tauxAnnuel === 0) return Math.round(capital / dureeMois);
  const i = tauxAnnuel / 12;
  return Math.round((capital * i) / (1 - Math.pow(1 + i, -dureeMois)));
}

function genererEcheancier(capital: number, tauxAnnuel: number, dureeMois: number) {
  const mens = mensualite(capital, tauxAnnuel, dureeMois);
  const i = tauxAnnuel / 12;
  const result: Array<{ numero: number; mensualite: number; interets: number; amortissement: number; capitalRestantApres: number }> = [];
  let restant = capital;
  for (let k = 1; k < dureeMois; k++) {
    const interets = Math.round(restant * i);
    const amort = mens - interets;
    restant -= amort;
    result.push({ numero: k, mensualite: mens, interets, amortissement: amort, capitalRestantApres: restant });
  }
  const interetsFinal = Math.round(restant * i);
  result.push({
    numero: dureeMois,
    mensualite: restant + interetsFinal,
    interets: interetsFinal,
    amortissement: restant,
    capitalRestantApres: 0,
  });
  return result;
}

export function FormulairePret({
  companyId,
  tresorerieActuelle,
  detteActuelle,
}: {
  companyId: string;
  tresorerieActuelle: number;
  detteActuelle: number;
}) {
  const router = useRouter();
  const [capital, setCapital] = useState("10000");
  const [duree, setDuree] = useState("60");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const capitalCentimes = Math.round(parseFloat(capital) * 100);
  const dureeN = parseInt(duree, 10);
  const simulation = useMemo(() => {
    if (!Number.isFinite(capitalCentimes) || capitalCentimes <= 0) return null;
    if (!Number.isFinite(dureeN) || dureeN < 12 || dureeN > 240) return null;
    const mens = mensualite(capitalCentimes, TAUX_ANNUEL, dureeN);
    const coutTotal = mens * dureeN - capitalCentimes;
    return { mens, coutTotal };
  }, [capitalCentimes, dureeN]);

  async function demander(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!Number.isFinite(capitalCentimes) || capitalCentimes <= 0) {
      setErreur("Capital invalide.");
      return;
    }
    if (!Number.isFinite(dureeN) || dureeN < 12 || dureeN > 240) {
      setErreur("Durée entre 12 et 240 mois.");
      return;
    }
    const detteApres = detteActuelle + capitalCentimes;
    const plafond = Math.max(tresorerieActuelle, 1) * 5;
    if (detteApres > plafond) {
      setErreur(
        `Dette totale demandée (${formaterEuros(detteApres)} €) dépasse 5× votre trésorerie actuelle (${formaterEuros(tresorerieActuelle)} €).`,
      );
      return;
    }
    setEnCours(true);
    try {
      const supabase = creerClientNavigateur();
      const maintenant = new Date();
      const { data: pret, error: errPret } = await supabase
        .from("loans")
        .insert({
          company_id: companyId,
          capital_initial_centimes: capitalCentimes,
          capital_restant_centimes: capitalCentimes,
          taux_annuel: TAUX_ANNUEL,
          duree_mois: dureeN,
          instant_debut: maintenant.toISOString(),
        })
        .select("id")
        .single();
      if (errPret || !pret) {
        setErreur(errPret?.message ?? "Erreur création");
        return;
      }
      const echeancier = genererEcheancier(capitalCentimes, TAUX_ANNUEL, dureeN);
      const lignes = echeancier.map((ech) => ({
        loan_id: pret.id,
        numero: ech.numero,
        mensualite_centimes: ech.mensualite,
        interets_centimes: ech.interets,
        amortissement_centimes: ech.amortissement,
        capital_restant_apres_centimes: ech.capitalRestantApres,
        instant_prevu: new Date(
          maintenant.getTime() + ech.numero * HEURES_PAR_MOIS_JEU * 3600 * 1000,
        ).toISOString(),
      }));
      const { error: errSched } = await supabase.from("loan_schedules").insert(lignes);
      if (errSched) {
        setErreur(errSched.message);
        return;
      }
      // Crédite la trésorerie
      await supabase
        .from("companies")
        .update({ tresorerie_centimes: tresorerieActuelle + capitalCentimes })
        .eq("id", companyId);
      router.refresh();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={demander} className="grid grid-cols-5 gap-4 rounded-md border border-[color:var(--color-g-200)] p-5">
      <div className="col-span-2 space-y-1.5">
        <span className="block text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Capital demandé (€)
        </span>
        <input
          type="text"
          value={capital}
          onChange={(e) => setCapital(e.target.value)}
          className="chiffre w-full rounded-md border border-[color:var(--color-g-300)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-noir)]"
        />
      </div>
      <div className="col-span-2 space-y-1.5">
        <span className="block text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Durée (mois)
        </span>
        <input
          type="text"
          value={duree}
          onChange={(e) => setDuree(e.target.value)}
          className="chiffre w-full rounded-md border border-[color:var(--color-g-300)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-noir)]"
        />
      </div>
      <div className="space-y-1.5">
        <span className="block text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Taux annuel
        </span>
        <p className="chiffre pt-2 text-sm">{(TAUX_ANNUEL * 100).toFixed(2)} %</p>
      </div>

      {simulation && (
        <p className="col-span-5 chiffre text-xs text-[color:var(--color-g-500)]">
          Mensualité : {formaterEuros(simulation.mens)} € · Coût total du crédit :
          {" "}
          {formaterEuros(simulation.coutTotal)} €
        </p>
      )}

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
          {enCours ? "Demande..." : "Demander le prêt"}
        </button>
      </div>
    </form>
  );
}
