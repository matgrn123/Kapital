"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  capaciteEmprunt,
  centimes,
  genererEcheancier,
  mensualite,
  tauxPret,
  type ObjetPret,
  type ReglesPret,
} from "@kapital/engine";
import { formaterEuros } from "../../../lib/formatage";
import { appelerAction } from "../_partage/reponses";
import type { VerrouAffiche } from "../_partage/verrou";
import { BandeauVerrou } from "../_partage/BandeauVerrou";

const OBJETS: ReadonlyArray<{ id: ObjetPret; libelle: string; aide: string }> = [
  { id: "tresorerie", libelle: "Trésorerie", aide: "Pour passer un cap de caisse : court, plafond bas." },
  { id: "equipement", libelle: "Équipement", aide: "Pour acheter des machines : durée moyenne." },
  { id: "immobilier", libelle: "Immobilier", aide: "Pour un local : longue durée, taux le plus bas." },
];

function pourcent(x: number): string {
  return `${(x * 100).toFixed(2).replace(".", ",")} %`;
}

export function FormulairePret({
  tresorerieActuelle,
  detteActuelle,
  regles,
  estrAnnuel,
  verrou,
}: {
  tresorerieActuelle: number;
  detteActuelle: number;
  regles: ReglesPret;
  estrAnnuel: number;
  verrou: VerrouAffiche | null;
}) {
  const router = useRouter();
  const [objet, setObjet] = useState<ObjetPret>("tresorerie");
  const [capital, setCapital] = useState("10000");
  const [duree, setDuree] = useState(String(regles.parObjet.tresorerie.dureeMinMois));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const regle = regles.parObjet[objet];
  const taux = tauxPret(objet, estrAnnuel, regles);
  const capacite = useMemo(
    () => capaciteEmprunt({ tresorerie: centimes(tresorerieActuelle), detteEnCours: centimes(detteActuelle) }, objet, regles),
    [tresorerieActuelle, detteActuelle, objet, regles],
  );

  const capitalCentimes = Math.round(parseFloat(capital.replace(",", ".")) * 100);
  const dureeN = parseInt(duree, 10);
  const capitalValide = Number.isFinite(capitalCentimes) && capitalCentimes > 0;
  const dureeValide = Number.isFinite(dureeN) && dureeN >= regle.dureeMinMois && dureeN <= regle.dureeMaxMois;

  const simulation = useMemo(() => {
    if (!capitalValide || !dureeValide) return null;
    const mens = mensualite(centimes(capitalCentimes), taux, dureeN);
    const echeancier = genererEcheancier(centimes(capitalCentimes), taux, dureeN);
    const total = echeancier.reduce((s, e) => s + e.montant, 0);
    return { mens, coutTotal: total - capitalCentimes };
  }, [capitalValide, dureeValide, capitalCentimes, dureeN, taux]);

  function choisirObjet(o: ObjetPret) {
    setObjet(o);
    const r = regles.parObjet[o];
    const courante = parseInt(duree, 10);
    if (!Number.isFinite(courante) || courante < r.dureeMinMois || courante > r.dureeMaxMois) {
      setDuree(String(r.dureeMinMois));
    }
  }

  async function demander(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);
    if (!capitalValide) {
      setErreur("Indiquez un montant en euros, supérieur à zéro.");
      return;
    }
    if (!dureeValide) {
      setErreur(`La durée d'un prêt ${OBJETS.find((o) => o.id === objet)?.libelle.toLowerCase()} est de ${regle.dureeMinMois} à ${regle.dureeMaxMois} mois.`);
      return;
    }
    setEnCours(true);
    const r = await appelerAction("/api/actions/demander-pret", {
      capitalCentimes,
      dureeMois: dureeN,
      objet,
    });
    setEnCours(false);
    if (!r.ok) {
      setErreur(r.message);
      return;
    }
    const tauxObtenu = typeof r.data["tauxAnnuel"] === "number" ? r.data["tauxAnnuel"] : taux;
    setSucces(`Prêt accordé de ${formaterEuros(capitalCentimes)} € à ${pourcent(tauxObtenu)}.`);
    router.refresh();
  }

  const champ =
    "chiffre w-full rounded-md border border-[color:var(--color-g-300)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-noir)]";
  const etiquette = "block text-xs uppercase tracking-wider text-[color:var(--color-g-500)]";

  return (
    <div className="space-y-4">
      {verrou && <BandeauVerrou verrou={verrou} action="L'emprunt" />}

      <div className="rounded-md border border-[color:var(--color-g-200)] p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider">Votre capacité d'emprunt</h3>
        <p className="mt-1 text-xs text-[color:var(--color-g-500)]">
          La banque limite votre dette totale à {regle.plafondEndettementMultipleTresorerie} fois votre
          trésorerie, pour un prêt {OBJETS.find((o) => o.id === objet)?.libelle.toLowerCase()}.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className={etiquette}>Dette actuelle</dt>
            <dd className="chiffre mt-1">{formaterEuros(capacite.detteEnCours)} €</dd>
          </div>
          <div>
            <dt className={etiquette}>Dette maximale</dt>
            <dd className="chiffre mt-1">{formaterEuros(capacite.plafondEndettement)} €</dd>
          </div>
          <div>
            <dt className={etiquette}>Marge restante</dt>
            <dd className="chiffre mt-1">{formaterEuros(capacite.margeEndettement)} €</dd>
          </div>
          <div>
            <dt className={etiquette}>Plus gros prêt possible</dt>
            <dd className="chiffre mt-1">{formaterEuros(capacite.montantMaximal)} €</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-[color:var(--color-g-500)]">
          Un seul prêt de ce type est limité à {formaterEuros(capacite.plafondMontantParPret)} €.
        </p>
      </div>

      <form onSubmit={demander} className="grid grid-cols-1 gap-4 rounded-md border border-[color:var(--color-g-200)] p-5 sm:grid-cols-6">
        <div className="space-y-1.5 sm:col-span-6">
          <span className={etiquette}>Objet du prêt</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {OBJETS.map((o) => {
              const actif = objet === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={actif}
                  onClick={() => choisirObjet(o.id)}
                  className={`rounded-md border px-3 py-2 text-left text-sm ${
                    actif
                      ? "border-[color:var(--color-noir)] bg-[color:var(--color-noir)] text-[color:var(--color-blanc)]"
                      : "border-[color:var(--color-g-300)]"
                  }`}
                >
                  <span className="block font-medium">{o.libelle}</span>
                  <span className={`block text-xs ${actif ? "opacity-80" : "text-[color:var(--color-g-500)]"}`}>
                    {o.aide} Taux {pourcent(tauxPret(o.id, estrAnnuel, regles))}.
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="pret-capital" className={etiquette}>Capital demandé (€)</label>
          <input id="pret-capital" type="text" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} className={champ} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="pret-duree" className={etiquette}>
            Durée (mois, de {regle.dureeMinMois} à {regle.dureeMaxMois})
          </label>
          <input id="pret-duree" type="text" inputMode="numeric" value={duree} onChange={(e) => setDuree(e.target.value)} className={champ} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <span className={etiquette}>Taux annuel</span>
          <p className="chiffre pt-2 text-sm">{pourcent(taux)}</p>
          <p className="text-xs text-[color:var(--color-g-500)]">
            Taux du marché ({pourcent(Math.max(estrAnnuel, 0))}) + marge de la banque ({pourcent(regle.margeSurEstr)}).
          </p>
        </div>

        {simulation && (
          <p className="chiffre text-xs text-[color:var(--color-g-500)] sm:col-span-6">
            Mensualité : {formaterEuros(simulation.mens)} € · Coût total du crédit : {formaterEuros(simulation.coutTotal)} €
          </p>
        )}

        {erreur && (
          <p role="alert" className="text-sm text-[color:var(--color-erreur)] sm:col-span-6">
            {erreur}
          </p>
        )}
        {succes && (
          <p role="status" className="text-sm text-[color:var(--color-succes)] sm:col-span-6">
            {succes}
          </p>
        )}

        <div className="flex justify-end sm:col-span-6">
          <button
            type="submit"
            disabled={enCours}
            className="rounded-md bg-[color:var(--color-noir)] px-4 py-2 text-sm font-medium text-[color:var(--color-blanc)] transition hover:bg-[color:var(--color-g-900)] disabled:opacity-50"
          >
            {enCours ? "Demande..." : "Demander le prêt"}
          </button>
        </div>
      </form>
    </div>
  );
}
