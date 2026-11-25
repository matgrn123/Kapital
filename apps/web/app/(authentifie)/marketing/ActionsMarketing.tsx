"use client";

import type { CoefficientsMarketing } from "@kapital/engine";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Bouton, Choix, Curseur, EcritureComptable, Jauge, Ligne, Message, Note, Refus, Succes } from "../../../components/ui";
import { apercuMarketing, bornesQuantite, effetsMarketing, type TypeActionMarketing } from "../../../lib/apercus";
import { formaterEuros } from "../../../lib/formatage";
import { confirmationDepense } from "../../../lib/marketing";
import { ACTIONS } from "./actions";

type Marque = { notoriete: number; desirabilite: number };



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
  // Budget en euros (crans d'un euro sur le curseur), du minimum d'un euro à toute la trésorerie disponible.
  const bornes = bornesQuantite({ minimum: 1, plafonds: [tresorerie / 100] });
  const [euros, setEuros] = useState<number>(Math.min(bornes.max, Math.max(bornes.min, Math.floor(bornes.max / 10))));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // Montant pour lequel le joueur a confirmé une grosse dépense (toute autre valeur redemande).
  const [confirmePour, setConfirmePour] = useState<number | null>(null);

  // La saisie directe permet les centimes (12,50 €) : on arrondit au centime entier.
  const montantCentimes = Math.round(Math.min(Math.max(euros, bornes.min), bornes.max) * 100);
  const effets = useMemo(
    () => effetsMarketing({ montant: montantCentimes, marque, coefficients }),
    [montantCentimes, marque, coefficients],
  );
  const apercu = useMemo(
    () => apercuMarketing({ action, montant: montantCentimes, tresorerie, marque, coefficients }),
    [action, montantCentimes, tresorerie, marque, coefficients],
  );
  const libelle = ACTIONS.find((a) => a.type === action)?.libelle ?? "";
  const avertissement = confirmationDepense(montantCentimes, tresorerie);
  const attendConfirmation = avertissement !== null && confirmePour !== montantCentimes;

  async function lancer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setOk(null);
    if (!apercu.ok) {
      setErreur(apercu.message);
      return;
    }
    if (attendConfirmation) return;
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
      setConfirmePour(null);
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
          <Choix
            key={a.type}
            actif={a.type === action}
            onClick={() => setAction(a.type)}
            titre={a.libelle}
            prix={`notoriété ${ecart(marque.notoriete + effets[a.type].notoriete, marque.notoriete)} · désirabilité ${ecart(
              marque.desirabilite + effets[a.type].desirabilite,
              marque.desirabilite,
            )}`}
          >
            {a.desc}
          </Choix>
        ))}
      </div>

      <Curseur
        libelle="Budget"
        valeur={montantCentimes}
        min={bornes.min * 100}
        max={bornes.max * 100}
        pas={100}
        onChange={(c) => setEuros(c / 100)}
        saisie="euros"
        aide={`Trésorerie disponible : ${formaterEuros(tresorerie)} €. L'effet de chaque action au budget choisi s'affiche sur sa tuile.`}
      />

      {apercu.ok ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Jauge libelle="Notoriété aujourd'hui" valeur={marque.notoriete} max={100} texte={arrondi(marque.notoriete)} />
              <Jauge libelle="Après l'action" valeur={apercu.apres.notoriete} max={100} texte={arrondi(apercu.apres.notoriete)} />
            </div>
            <div className="flex flex-col gap-2">
              <Jauge libelle="Désirabilité aujourd'hui" valeur={marque.desirabilite} max={100} ton="or" texte={arrondi(marque.desirabilite)} />
              <Jauge
                libelle="Après l'action"
                valeur={apercu.apres.desirabilite}
                max={100}
                ton={apercu.apres.desirabilite < marque.desirabilite ? "critique" : "or"}
                texte={arrondi(apercu.apres.desirabilite)}
              />
            </div>
          </div>
          <div>
            <Ligne libelle="Notoriété">
              {arrondi(marque.notoriete)} → {arrondi(apercu.apres.notoriete)}
            </Ligne>
            <Ligne libelle="Désirabilité" ton={apercu.apres.desirabilite < marque.desirabilite ? "critique" : undefined}>
              {arrondi(marque.desirabilite)} → {arrondi(apercu.apres.desirabilite)}
            </Ligne>
            <Ligne libelle="Sortie de trésorerie">tout de suite</Ligne>
            <Ligne libelle="Trésorerie après l'action">{formaterEuros(apercu.tresorerieApres)} €</Ligne>
          </div>
          <Note>Cette écriture est passée dès que tu lances l&apos;action :</Note>
          <EcritureComptable libelle={`Marketing : ${libelle.toLowerCase()}`} etiquette="aperçu" lignes={apercu.ecriture} />
        </div>
      ) : (
        <Refus>{apercu.message}</Refus>
      )}

      {erreur && <Refus>{erreur}</Refus>}
      {ok && <Succes>{ok}</Succes>}
      {apercu.ok && avertissement && (
        <Message ton="erreur">
          <p>{avertissement}</p>
          {attendConfirmation && (
            <div className="mt-2">
              <Bouton petit onClick={() => setConfirmePour(montantCentimes)}>
                Je confirme cette dépense
              </Bouton>
            </div>
          )}
        </Message>
      )}
      <div className="flex justify-end">
        <Bouton type="submit" variante="principal" disabled={enCours || !apercu.ok || attendConfirmation}>
          {enCours ? "Lancement…" : `Lancer : ${libelle.toLowerCase()}`}
        </Bouton>
      </div>
    </form>
  );
}
