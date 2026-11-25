"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { capaciteEmprunt, centimes, tauxPret, type ObjetPret, type ReglesPret } from "@kapital/engine";
import {
  BandeauEtape,
  Bouton,
  Carte,
  CLASSE_SAISIE,
  Champ,
  Curseur,
  EcritureComptable,
  Jauge,
  Message,
  Note,
  Options,
  Resultat,
  Tableau,
} from "../../../components/ui";
import { apercuPret, curseurMontant, dureesProposees, extraitEcheancier } from "../../../lib/apercu-lot4";
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
  moisDecouvert = 0,
  regles,
  estrAnnuel,
  moisCourant,
  verrou,
}: {
  tresorerieActuelle: number;
  detteActuelle: number;
  moisDecouvert?: number;
  regles: ReglesPret;
  estrAnnuel: number;
  moisCourant: number;
  verrou: VerrouAffiche | null;
}) {
  const router = useRouter();
  const [objet, setObjet] = useState<ObjetPret>("tresorerie");
  const [duree, setDuree] = useState(String(regles.parObjet.tresorerie.dureeMinMois));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const regle = regles.parObjet[objet];
  const dureeN = Number.parseInt(duree, 10);
  const capacite = useMemo(
    () => capaciteEmprunt({ tresorerie: centimes(tresorerieActuelle), detteEnCours: centimes(detteActuelle) }, objet, regles),
    [tresorerieActuelle, detteActuelle, objet, regles],
  );
  // Curseur : de la plus petite valeur au plus gros prêt que le moteur accepte aujourd'hui.
  const curseur = curseurMontant(capacite.montantMaximal);
  const [montantChoisi, setMontantChoisi] = useState<number | null>(null);
  const milieu = Math.max(curseur.min, Math.floor(curseur.max / 2 / curseur.pas) * curseur.pas);
  const capitalCentimes: number | null =
    curseur.max <= 0 ? null : Math.min(curseur.max, Math.max(curseur.min, montantChoisi ?? milieu));
  const apercu = useMemo(
    () =>
      apercuPret({
        situation: { tresorerie: tresorerieActuelle, detteEnCours: detteActuelle, moisDecouvertConsecutifs: moisDecouvert },
        objet,
        capital: capitalCentimes ?? 0,
        dureeMois: Number.isFinite(dureeN) ? dureeN : 0,
        estrAnnuel,
        mois: moisCourant,
        regles,
      }),
    [tresorerieActuelle, detteActuelle, moisDecouvert, objet, capitalCentimes, dureeN, estrAnnuel, moisCourant, regles],
  );
  const sim = apercu.simulation;
  const refus = capitalCentimes === null ? "Ta capacité d'emprunt est nulle aujourd'hui pour cet objet." : apercu.evaluation.ok ? null : apercu.evaluation.message;

  function choisirObjet(o: ObjetPret) {
    setObjet(o);
    const r = regles.parObjet[o];
    if (!dureesProposees(r.dureeMinMois, r.dureeMaxMois).includes(dureeN)) setDuree(String(r.dureeMinMois));
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

        <Options
          libelle="Objet du prêt"
          valeur={objet}
          onChange={choisirObjet}
          options={OBJETS.map((o) => ({
            id: o.id,
            titre: o.libelle,
            detail: o.aide,
            prix: `Dès ${pourcent(tauxPret(o.id, estrAnnuel, regles))} (plus une prime selon ton risque)`,
          }))}
        />

        <Curseur
          libelle="Montant"
          valeur={capitalCentimes ?? 0}
          min={curseur.min}
          max={curseur.max}
          pas={curseur.pas}
          onChange={setMontantChoisi}
          affichage={`${formaterEuros(capitalCentimes ?? 0)} €`}
          aide={`Jusqu'à ${formaterEuros(capacite.montantMaximal)} € aujourd'hui : le plus gros prêt que la banque accepte pour cet objet.`}
        />

        <Champ libelle="Durée" aide={`De ${regle.dureeMinMois} à ${regle.dureeMaxMois} mois pour cet objet.`}>
          <select value={duree} onChange={(e) => setDuree(e.target.value)} className={CLASSE_SAISIE}>
            {dureesProposees(regle.dureeMinMois, regle.dureeMaxMois).map((d) => (
              <option key={d} value={d}>
                {d} mois{d % 12 === 0 ? ` (${d / 12} an${d > 12 ? "s" : ""})` : ""}
              </option>
            ))}
          </select>
        </Champ>

        <div className="grid gap-3 sm:grid-cols-3">
          <Resultat
            libelle="Taux"
            valeur={pourcent(sim?.taux ?? tauxPret(objet, estrAnnuel, regles))}
            detail={`€STR ${pourcent(Math.max(estrAnnuel, 0))} + marge ${pourcent(regle.margeSurEstr)}${sim ? ` + prime de risque ${pourcent(Math.max(sim.taux - Math.max(estrAnnuel, 0) - regle.margeSurEstr, 0))}` : ""}`}
          />
          <Resultat libelle="Mensualité" valeur={sim ? `${formaterEuros(sim.mensualite)} €` : "—"} />
          <Resultat libelle="Coût total du crédit" valeur={sim ? `${formaterEuros(sim.coutTotal)} €` : "—"} detail="La somme des intérêts" />
        </div>

        {sim && (
          <Tableau
            entetes={[
              { texte: "Échéance" },
              { texte: "Mensualité", droite: true },
              { texte: "Intérêts", droite: true },
              { texte: "Capital", droite: true },
              { texte: "Restant dû", droite: true },
            ]}
          >
            {lignesEcheancier.map((e, i) =>
              e === null ? (
                <tr key={`trou-${i}`} className="text-muted">
                  <td colSpan={5}>…</td>
                </tr>
              ) : (
                <tr key={e.numero}>
                  <td>{e.numero}</td>
                  <td className="text-right">{formaterEuros(e.montant)} €</td>
                  <td className="text-right">{formaterEuros(e.interets)} €</td>
                  <td className="text-right">{formaterEuros(e.amortissement)} €</td>
                  <td className="text-right">{formaterEuros(e.capitalRestantApres)} €</td>
                </tr>
              ),
            )}
          </Tableau>
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
          <Note>
            Le serveur revérifie ta capacité au moment de signer et prend l&apos;€STR du jour.
          </Note>
        </div>
      </form>
    </Carte>
  );
}
