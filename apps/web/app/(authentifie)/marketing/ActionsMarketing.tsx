"use client";

import type { CoefficientsMarketing } from "@kapital/engine";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Bouton, EcritureComptable, Jauge } from "../../../components/ui";
import { CLASSE_SAISIE, Champ, Choix, Ligne, NoteEcriture, Refus, Succes } from "../../../components/apercu/elements";
import { apercuMarketing, type TypeActionMarketing } from "../../../lib/apercus";
import { formaterEuros } from "../../../lib/formatage";
import { ACTIONS } from "./actions";

type Marque = { notoriete: number; desirabilite: number };


function enCentimes(saisie: string): number {
  const n = Number(saisie.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

function arrondi(x: number): string {
  return x.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

function ecart(apres: number, avant: number): string {
  const d = apres - avant;
  return `${d >= 0 ? "+" : "−"}${arrondi(Math.abs(d))}`;
}

export function ActionsMarketing({
  tresorerie,
  marque,
  coefficients,
}: {
  tresorerie: number;
  marque: Marque;
  coefficients: CoefficientsMarketing;
}) {
  const router = useRouter();
  const [action, setAction] = useState<TypeActionMarketing>("publicite");
  const [montant, setMontant] = useState("500");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const montantCentimes = enCentimes(montant);
  const apercu = useMemo(
    () => apercuMarketing({ action, montant: montantCentimes, tresorerie, marque, coefficients }),
    [action, montantCentimes, tresorerie, marque, coefficients],
  );
  const libelle = ACTIONS.find((a) => a.type === action)?.libelle ?? "";

  async function lancer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setOk(null);
    if (!apercu.ok) {
      setErreur(apercu.message);
      return;
    }
    setEnCours(true);
    try {
      const reponse = await fetch("/api/actions/action-marketing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: action, montantCentimes }),
      });
      const data = (await reponse.json().catch(() => ({}))) as { error?: string };
      if (!reponse.ok || data.error) {
        setErreur(data.error ?? `Action impossible (erreur ${reponse.status}).`);
        return;
      }
      setOk(`${libelle} lancée pour ${formaterEuros(montantCentimes)} €.`);
      router.refresh();
    } catch {
      setErreur("Impossible de joindre le serveur. Vérifie ta connexion et réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={lancer} className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {ACTIONS.map((a) => (
          <Choix key={a.type} actif={a.type === action} onClick={() => setAction(a.type)} titre={a.libelle}>
            {a.desc}
          </Choix>
        ))}
      </div>

      <div className="max-w-[220px]">
        <Champ libelle="Budget (€)" aide={`Trésorerie disponible : ${formaterEuros(tresorerie)} €`}>
          <input inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} className={CLASSE_SAISIE} />
        </Champ>
      </div>

      {apercu.ok ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-[10px] border border-line p-3">
              <Jauge libelle="Notoriété aujourd'hui" valeur={marque.notoriete} max={100} texte={arrondi(marque.notoriete)} />
              <Jauge
                libelle="Après l'action"
                valeur={apercu.apres.notoriete}
                max={100}
                texte={`${arrondi(apercu.apres.notoriete)} (${ecart(apercu.apres.notoriete, marque.notoriete)})`}
              />
            </div>
            <div className="flex flex-col gap-2 rounded-[10px] border border-line p-3">
              <Jauge libelle="Désirabilité aujourd'hui" valeur={marque.desirabilite} max={100} ton="or" texte={arrondi(marque.desirabilite)} />
              <Jauge
                libelle="Après l'action"
                valeur={apercu.apres.desirabilite}
                max={100}
                ton={apercu.apres.desirabilite < marque.desirabilite ? "critique" : "or"}
                texte={`${arrondi(apercu.apres.desirabilite)} (${ecart(apercu.apres.desirabilite, marque.desirabilite)})`}
              />
            </div>
          </div>
          <div>
            <Ligne libelle="Sortie de trésorerie">tout de suite</Ligne>
            <Ligne libelle="Trésorerie après l'action">{formaterEuros(apercu.tresorerieApres)} €</Ligne>
          </div>
          <NoteEcriture>Cette écriture est passée dès que tu lances l&apos;action :</NoteEcriture>
          <EcritureComptable libelle={`Marketing : ${libelle.toLowerCase()}`} etiquette="aperçu" lignes={apercu.ecriture} />
        </div>
      ) : (
        <Refus>{apercu.message}</Refus>
      )}

      {erreur && <Refus>{erreur}</Refus>}
      {ok && <Succes>{ok}</Succes>}
      <div className="flex justify-end">
        <Bouton type="submit" variante="principal" disabled={enCours || !apercu.ok}>
          {enCours ? "Lancement…" : `Lancer : ${libelle.toLowerCase()}`}
        </Bouton>
      </div>
    </form>
  );
}
