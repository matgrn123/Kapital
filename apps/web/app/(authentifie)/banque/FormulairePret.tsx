"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { capaciteEmprunt, centimes, tauxPret, type ObjetPret, type ReglesPret } from "@kapital/engine";
import { Bouton, Carte, EcritureComptable, Jauge } from "../../../components/ui";
import {
  BandeauEtape,
  classeChamp,
  classeEtiquette,
  Message,
  NoteMoteur,
  Options,
  Resultat,
} from "../../../components/ui/lot4";
import { apercuPret, extraitEcheancier, lireEuros } from "../../../lib/apercu-lot4";
import { formaterEuros } from "../../../lib/formatage";
import { appelerAction } from "../_partage/reponses";
import type { VerrouAffiche } from "../_partage/verrou";

const OBJETS: ReadonlyArray<{ id: ObjetPret; libelle: string; aide: string }> = [
  { id: "tresorerie", libelle: "Trésorerie", aide: "Passer un cap de caisse : court, plafond bas." },
  { id: "equipement", libelle: "Équipement", aide: "Acheter des machines : durée moyenne." },
  { id: "immobilier", libelle: "Immobilier", aide: "Un local : longue durée, taux le plus bas." },
];

const pourcent = (x: number) => `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;

export function FormulairePret({
  tresorerieActuelle,
  detteActuelle,
  regles,
  estrAnnuel,
  moisCourant,
  verrou,
}: {
  tresorerieActuelle: number;
  detteActuelle: number;
  regles: ReglesPret;
  estrAnnuel: number;
  moisCourant: number;
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
  const capitalCentimes = lireEuros(capital);
  const dureeN = Number.parseInt(duree, 10);
  const capacite = useMemo(
    () => capaciteEmprunt({ tresorerie: centimes(tresorerieActuelle), detteEnCours: centimes(detteActuelle) }, objet, regles),
    [tresorerieActuelle, detteActuelle, objet, regles],
  );
  const apercu = useMemo(
    () =>
      apercuPret({
        situation: { tresorerie: tresorerieActuelle, detteEnCours: detteActuelle },
        objet,
        capital: capitalCentimes ?? 0,
        dureeMois: Number.isFinite(dureeN) ? dureeN : 0,
        estrAnnuel,
        mois: moisCourant,
        regles,
      }),
    [tresorerieActuelle, detteActuelle, objet, capitalCentimes, dureeN, estrAnnuel, moisCourant, regles],
  );
  const sim = apercu.simulation;
  const refus = capitalCentimes === null ? "Indique un montant en euros, supérieur à zéro." : apercu.evaluation.ok ? null : apercu.evaluation.message;

  function choisirObjet(o: ObjetPret) {
    setObjet(o);
    const r = regles.parObjet[o];
    if (!(dureeN >= r.dureeMinMois && dureeN <= r.dureeMaxMois)) setDuree(String(r.dureeMinMois));
  }

  async function demander(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);
    if (refus || capitalCentimes === null) {
      setErreur(refus ?? "Montant invalide.");
      return;
    }
    setEnCours(true);
    const r = await appelerAction("/api/actions/demander-pret", { capitalCentimes, dureeMois: dureeN, objet });
    setEnCours(false);
    if (!r.ok) {
      setErreur(r.message);
      return;
    }
    const tauxObtenu = typeof r.data["tauxAnnuel"] === "number" ? r.data["tauxAnnuel"] : sim?.taux ?? 0;
    setSucces(`Prêt accordé : ${formaterEuros(capitalCentimes)} € à ${pourcent(tauxObtenu)}. L'argent est sur ton compte.`);
    router.refresh();
  }

  const lignesEcheancier = sim ? extraitEcheancier(sim.echeancier) : [];
  const detteApres = sim ? sim.detteApres : detteActuelle;

  return (
    <Carte titre="Simuler un prêt professionnel">
      <form onSubmit={demander} className="flex flex-col gap-4">
        {verrou && <BandeauEtape verrou={verrou} action="L'emprunt" />}

        <div className="flex flex-col gap-1.5">
          <span className={classeEtiquette}>Objet du prêt</span>
          <Options
            libelle="Objet du prêt"
            valeur={objet}
            onChange={choisirObjet}
            options={OBJETS.map((o) => ({
              id: o.id,
              titre: `${o.libelle} · ${pourcent(tauxPret(o.id, estrAnnuel, regles))}`,
              detail: o.aide,
            }))}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5" htmlFor="pret-capital">
            <span className={classeEtiquette}>Montant (€)</span>
            <input id="pret-capital" type="text" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} className={classeChamp} />
            <span className="text-[0.78rem] text-muted">Au plus {formaterEuros(capacite.montantMaximal)} € aujourd&apos;hui.</span>
          </label>
          <label className="flex flex-col gap-1.5" htmlFor="pret-duree">
            <span className={classeEtiquette}>Durée (mois)</span>
            <input id="pret-duree" type="number" min={regle.dureeMinMois} max={regle.dureeMaxMois} value={duree} onChange={(e) => setDuree(e.target.value)} className={classeChamp} />
            <span className="text-[0.78rem] text-muted">De {regle.dureeMinMois} à {regle.dureeMaxMois} mois pour cet objet.</span>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Resultat
            libelle="Taux"
            valeur={pourcent(tauxPret(objet, estrAnnuel, regles))}
            detail={`€STR ${pourcent(Math.max(estrAnnuel, 0))} + marge ${pourcent(regle.margeSurEstr)}`}
          />
          <Resultat libelle="Mensualité" valeur={sim ? `${formaterEuros(sim.mensualite)} €` : "—"} />
          <Resultat libelle="Coût total du crédit" valeur={sim ? `${formaterEuros(sim.coutTotal)} €` : "—"} detail="La somme des intérêts" />
        </div>

        {sim && (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.86rem]">
              <thead className="text-[0.7rem] uppercase tracking-[0.06em] text-muted">
                <tr>
                  <th className="py-1 text-left font-semibold">Échéance</th>
                  <th className="py-1 text-right font-semibold">Mensualité</th>
                  <th className="py-1 text-right font-semibold">Intérêts</th>
                  <th className="py-1 text-right font-semibold">Capital</th>
                  <th className="py-1 text-right font-semibold">Restant dû</th>
                </tr>
              </thead>
              <tbody>
                {lignesEcheancier.map((e, i) =>
                  e === null ? (
                    <tr key={`trou-${i}`} className="border-t border-line text-muted">
                      <td colSpan={5} className="py-1">…</td>
                    </tr>
                  ) : (
                    <tr key={e.numero} className="border-t border-line tabular-nums">
                      <td className="py-1.5">{e.numero}</td>
                      <td className="py-1.5 text-right">{formaterEuros(e.montant)} €</td>
                      <td className="py-1.5 text-right">{formaterEuros(e.interets)} €</td>
                      <td className="py-1.5 text-right">{formaterEuros(e.amortissement)} €</td>
                      <td className="py-1.5 text-right">{formaterEuros(e.capitalRestantApres)} €</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}

        <Jauge
          libelle={`Endettement après ce prêt (plafond : ${regle.plafondEndettementMultipleTresorerie} fois ta trésorerie)`}
          valeur={detteApres}
          max={Math.max(1, capacite.plafondEndettement)}
          texte={`${formaterEuros(detteApres)} € / ${formaterEuros(capacite.plafondEndettement)} €`}
          ton={refus ? "critique" : "accent"}
        />

        {refus ? (
          <Message ton="erreur">La banque refuserait : {refus}</Message>
        ) : sim ? (
          <Message ton="succes">
            Demande recevable. Ta trésorerie passerait de {formaterEuros(tresorerieActuelle)} € à{" "}
            {formaterEuros(sim.tresorerieApres)} €, et tu rembourseras {formaterEuros(sim.mensualite)} € chaque mois de jeu.
          </Message>
        ) : null}

        {sim && (
          <EcritureComptable libelle={sim.ecriture.libelle} etiquette="aperçu" lignes={sim.ecriture.lignes} />
        )}

        {erreur && <Message ton="erreur">{erreur}</Message>}
        {succes && <Message ton="succes">{succes}</Message>}

        <div className="flex flex-wrap items-center gap-3">
          <Bouton type="submit" variante="principal" disabled={enCours || verrou !== null || refus !== null}>
            {enCours ? "Signature…" : "Signer l'offre de prêt"}
          </Bouton>
          <NoteMoteur>
            Le serveur revérifie ta capacité au moment de signer et prend l&apos;€STR du jour.
          </NoteMoteur>
        </div>
      </form>
    </Carte>
  );
}
