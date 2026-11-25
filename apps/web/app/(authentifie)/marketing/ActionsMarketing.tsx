"use client";

import type { CoefficientsMarketing } from "@kapital/engine";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Bouton,
  Choix,
  Curseur,
  EcritureComptable,
  Jauge,
  Ligne,
  Message,
  Note,
  Refus,
  Succes,
  SurTitre,
} from "../../../components/ui";
import {
  apercuMarketing,
  bornesQuantite,
  effetsMarketing,
  type EffetTuileMarketing,
  type TypeActionMarketing,
} from "../../../lib/apercus";
import { formaterEuros } from "../../../lib/formatage";
import { confirmationDepense } from "../../../lib/marketing";
import { ACTIONS, FAMILLES } from "./actions";

type Marque = { notoriete: number; desirabilite: number };

function arrondi(x: number): string {
  return x.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

function signe(d: number): string {
  return `${d >= 0 ? "+" : "−"}${arrondi(Math.abs(d))}`;
}

function facteur(x: number): string {
  return `×${x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Ligne d'effet d'une tuile : écart moyen, ou fourchette pour un influenceur. */
function texteEffet(e: EffetTuileMarketing): string {
  if (e.fourchette) {
    const [nb, nh] = e.fourchette.notoriete;
    const [db, dh] = e.fourchette.desirabilite;
    return `notoriété ${signe(nb)} à ${signe(nh)} · désirabilité ${signe(db)} à ${signe(dh)}`;
  }
  return `notoriété ${signe(e.notoriete)} · désirabilité ${signe(e.desirabilite)}`;
}

/** Budget minimum d'une action, en euros entiers (au moins 1 €). */
function minimumEuros(c: CoefficientsMarketing, action: TypeActionMarketing): number {
  return Math.max(1, Math.ceil(c.actions[action].montantMinimum / 100));
}

export function ActionsMarketing({
  tresorerie,
  marque,
  coefficients,
  etape,
}: {
  tresorerie: number;
  marque: Marque;
  coefficients: CoefficientsMarketing;
  /** Étape effective de la société : l'affichage dans le métro en dépend. */
  etape: number;
}) {
  const router = useRouter();
  const [action, setAction] = useState<TypeActionMarketing>("publicite");
  // Budget en euros entiers, du minimum de l'action à toute la trésorerie disponible.
  const bornes = bornesQuantite({ minimum: minimumEuros(coefficients, action), plafonds: [tresorerie / 100] });
  const [euros, setEuros] = useState<number>(() => {
    const b = bornesQuantite({ minimum: 1, plafonds: [tresorerie / 100] });
    return Math.min(b.max, Math.max(b.min, Math.floor(b.max / 10)));
  });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // Montant pour lequel le joueur a confirmé une grosse dépense (toute autre valeur redemande).
  const [confirmePour, setConfirmePour] = useState<number | null>(null);

  const montantCentimes = Math.min(Math.max(euros, bornes.min), bornes.max) * 100;
  const effets = useMemo(
    () => effetsMarketing({ montant: montantCentimes, marque, coefficients }),
    [montantCentimes, marque, coefficients],
  );
  const apercu = useMemo(
    () => apercuMarketing({ action, montant: montantCentimes, tresorerie, marque, coefficients, etape }),
    [action, montantCentimes, tresorerie, marque, coefficients, etape],
  );
  const libelle = ACTIONS.find((a) => a.type === action)?.libelle ?? "";
  const avertissement = confirmationDepense(montantCentimes, tresorerie);
  const attendConfirmation = avertissement !== null && confirmePour !== montantCentimes;
  const incertain = apercu.ok && apercu.alea.min < apercu.alea.max;

  function choisir(type: TypeActionMarketing) {
    setAction(type);
    setErreur(null);
    setOk(null);
    // Le budget remonte au minimum de la nouvelle action s'il était en dessous.
    setEuros((e) => Math.max(e, minimumEuros(coefficients, type)));
  }

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
      const data = (await reponse.json().catch(() => ({}))) as {
        error?: string;
        alea?: number;
        notoriete?: number;
        desirabilite?: number;
      };
      if (!reponse.ok || data.error) {
        setErreur(data.error ?? `Action impossible (erreur ${reponse.status}).`);
        return;
      }
      let texte = `${libelle} : action lancée pour ${formaterEuros(montantCentimes)} €.`;
      if (incertain && typeof data.alea === "number") {
        const sens = data.alea >= 1 ? "mieux" : "moins bien";
        texte +=
          ` La publication a marché ${sens} que la moyenne (${facteur(data.alea)}) :` +
          ` notoriété ${signe(data.notoriete ?? 0)}, désirabilité ${signe(data.desirabilite ?? 0)}.`;
      }
      setOk(texte);
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
      {FAMILLES.map((f) => (
        <section key={f.id} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <SurTitre>{f.titre}</SurTitre>
            <span className="text-[0.76rem] text-muted">{f.desc}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {ACTIONS.filter((a) => a.famille === f.id).map((a) => {
              const regles = coefficients.actions[a.type];
              const verrouillee = regles.etapeMinimum !== undefined && etape < regles.etapeMinimum;
              const effet = effets[a.type];
              const minimum = regles.montantMinimum > 1 ? `dès ${formaterEuros(regles.montantMinimum)} € · ` : "";
              return (
                <Choix
                  key={a.type}
                  actif={a.type === action}
                  onClick={() => choisir(a.type)}
                  desactive={verrouillee}
                  titre={a.libelle}
                  prix={
                    verrouillee
                      ? `se débloque à l'étape ${regles.etapeMinimum}`
                      : `${minimum}${texteEffet(effet)}${effet.sousMinimum ? " (au minimum)" : ""}`
                  }
                >
                  {a.desc}
                </Choix>
              );
            })}
          </div>
        </section>
      ))}

      <Curseur
        libelle="Budget"
        valeur={montantCentimes / 100}
        min={bornes.min}
        max={bornes.max}
        onChange={setEuros}
        affichage={`${formaterEuros(montantCentimes)} €`}
        aide={`Trésorerie disponible : ${formaterEuros(tresorerie)} €. L'effet de chaque action au budget choisi s'affiche sur sa tuile.`}
      />

      {apercu.ok ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Jauge libelle="Notoriété aujourd'hui" valeur={marque.notoriete} max={100} texte={arrondi(marque.notoriete)} />
              <Jauge
                libelle={incertain ? "Après l'action (en moyenne)" : "Après l'action"}
                valeur={apercu.apres.notoriete}
                max={100}
                texte={arrondi(apercu.apres.notoriete)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Jauge libelle="Désirabilité aujourd'hui" valeur={marque.desirabilite} max={100} ton="or" texte={arrondi(marque.desirabilite)} />
              <Jauge
                libelle={incertain ? "Après l'action (en moyenne)" : "Après l'action"}
                valeur={apercu.apres.desirabilite}
                max={100}
                ton={apercu.apres.desirabilite < marque.desirabilite ? "critique" : "or"}
                texte={arrondi(apercu.apres.desirabilite)}
              />
            </div>
          </div>
          <div>
            <Ligne libelle="Notoriété">
              {arrondi(marque.notoriete)} →{" "}
              {incertain
                ? `entre ${arrondi(apercu.apresMin.notoriete)} et ${arrondi(apercu.apresMax.notoriete)}`
                : arrondi(apercu.apres.notoriete)}
            </Ligne>
            <Ligne libelle="Désirabilité" ton={apercu.apres.desirabilite < marque.desirabilite ? "critique" : undefined}>
              {arrondi(marque.desirabilite)} →{" "}
              {incertain
                ? `entre ${arrondi(apercu.apresMin.desirabilite)} et ${arrondi(apercu.apresMax.desirabilite)}`
                : arrondi(apercu.apres.desirabilite)}
            </Ligne>
            {incertain && (
              <Ligne libelle="Effet incertain">
                de {facteur(apercu.alea.min)} à {facteur(apercu.alea.max)} l&apos;effet moyen
              </Ligne>
            )}
            {apercu.honoraires > 0 && (
              <>
                <Ligne libelle="Honoraires de l'agence">{formaterEuros(apercu.honoraires)} €</Ligne>
                <Ligne libelle="Budget qui travaille pour ta marque">
                  {formaterEuros(montantCentimes - apercu.honoraires)} €
                </Ligne>
              </>
            )}
            {apercu.affichages !== null && (
              <Ligne libelle="Affichages achetés">environ {apercu.affichages.toLocaleString("fr-FR")}</Ligne>
            )}
            <Ligne libelle="Sortie de trésorerie">tout de suite</Ligne>
            <Ligne libelle="Trésorerie après l'action">{formaterEuros(apercu.tresorerieApres)} €</Ligne>
          </div>
          <Note>
            Cette écriture est passée dès que tu lances l&apos;action
            {incertain ? ", quel que soit le résultat de la publication" : ""}
            {apercu.honoraires > 0 ? " ; les honoraires de l'agence sont compris dans la charge" : ""} :
          </Note>
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
