"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CoefficientsSalaires } from "@kapital/engine";
import { Bouton, Carte, EcritureComptable } from "../../../components/ui";
import {
  classeChamp,
  classeEtiquette,
  LigneValeur,
  Message,
  NoteMoteur,
  Options,
  Resultat,
} from "../../../components/ui/lot4";
import { apercuEmbauche, lireEuros, type EcritureAffichee } from "../../../lib/apercu-lot4";
import { formaterEuros } from "../../../lib/formatage";
import { appelerAction } from "../_partage/reponses";

type Poste = "artisan" | "encadrement";

export function FormulaireEmbauche({
  coefficients,
  moisCourant,
  tresorerie,
  postesLibres,
  verrouille,
}: {
  coefficients: CoefficientsSalaires;
  moisCourant: number;
  tresorerie: number;
  postesLibres: number;
  /** Embauche pas encore débloquée par l'étape : le bandeau de la page l'explique. */
  verrouille: boolean;
}) {
  const router = useRouter();
  const [poste, setPoste] = useState<Poste>("artisan");
  const [salaire, setSalaire] = useState((coefficients.smicMensuelBrut / 100).toFixed(2).replace(".", ","));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const brut = lireEuros(salaire);
  const apercu = useMemo(
    () => (brut === null ? null : apercuEmbauche({ salaireBrut: brut, coefficients, mois: moisCourant })),
    [brut, coefficients, moisCourant],
  );
  const sousSmic = brut !== null && brut < coefficients.smicMensuelBrut;
  const sansPoste = poste === "artisan" && postesLibres === 0;

  async function embaucher(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setAvertissement(null);
    setSucces(null);
    if (brut === null) return setErreur("Indique un salaire brut mensuel en euros.");
    setEnCours(true);
    const r = await appelerAction("/api/actions/embaucher", { poste, salaireBrutMensuelCentimes: brut });
    setEnCours(false);
    if (!r.ok) return setErreur(r.message);
    setSucces("Salarié embauché. Son premier salaire tombera à la fin du mois de jeu.");
    if (r.data["sansPosteLibre"] === true) {
      setAvertissement("Ce salarié n'a pas de poste : il ne produira pas tant qu'un poste n'est pas libre. Son salaire est dû quand même.");
    }
    router.refresh();
  }

  return (
    <Carte titre="Embaucher">
      <form onSubmit={embaucher} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className={classeEtiquette}>Poste</span>
          <Options
            libelle="Poste"
            valeur={poste}
            onChange={setPoste}
            options={[
              { id: "artisan", titre: "Artisan", detail: "Fait tourner un poste de travail de l'atelier." },
              { id: "encadrement", titre: "Encadrement", detail: "Organise l'équipe ; n'occupe pas de machine." },
            ]}
          />
        </div>

        <label className="flex max-w-xs flex-col gap-1.5" htmlFor="salaire-embauche">
          <span className={classeEtiquette}>Salaire brut mensuel (€)</span>
          <input id="salaire-embauche" type="text" inputMode="decimal" value={salaire} onChange={(e) => setSalaire(e.target.value)} className={classeChamp} />
          <span className="text-[0.78rem] text-muted">SMIC mensuel brut : {formaterEuros(coefficients.smicMensuelBrut)} €</span>
        </label>

        {apercu ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Resultat libelle="Salaire brut" valeur={`${formaterEuros(brut ?? 0)} €`} detail="compte 641" />
              <Resultat libelle="Cotisations patronales" valeur={`${formaterEuros(apercu.cotisations)} €`} detail="compte 645" />
              <Resultat libelle="Coût employeur" valeur={`${formaterEuros(apercu.coutEmployeur)} €`} detail="par mois de jeu" />
            </div>
            <LigneValeur libelle="Sortie de trésorerie à l'embauche">0,00 €</LigneValeur>
            <LigneValeur libelle="Sortie à chaque fin de mois">{formaterEuros(apercu.coutEmployeur)} €</LigneValeur>
            <LigneValeur libelle="Trésorerie après la première paie (hors ventes)">
              {formaterEuros(tresorerie - apercu.coutEmployeur)} €
            </LigneValeur>
            <p className="text-[0.86rem]">
              L&apos;embauche ne passe <b>aucune écriture</b> le jour où tu signes. La paie est enregistrée à la clôture
              du mois, puis payée par la banque le même jour (421 et 431 au débit, 512 au crédit) :
            </p>
            <EcritureComptable libelle={apercu.paie.libelle} etiquette="à la clôture du mois" lignes={apercu.paie.lignes} />
          </>
        ) : (
          <Message ton="erreur">Indique un salaire brut mensuel en euros, supérieur à zéro.</Message>
        )}

        {sousSmic && <Message ton="erreur">Ce salaire est sous le SMIC : en France, c&apos;est interdit pour un temps plein.</Message>}
        {sansPoste && (
          <Message ton="info">Aucun poste de travail libre : cet artisan serait payé sans produire.</Message>
        )}
        {erreur && <Message ton="erreur">{erreur}</Message>}
        {succes && <Message ton="succes">{succes}</Message>}
        {avertissement && <Message ton="info">{avertissement}</Message>}

        <div className="flex flex-wrap items-center gap-3">
          <Bouton type="submit" variante="principal" disabled={enCours || verrouille || apercu === null}>
            {enCours ? "Embauche…" : "Embaucher"}
          </Bouton>
          <NoteMoteur>Le serveur refuse l&apos;embauche si ta trésorerie ne garde pas une réserve de paie suffisante.</NoteMoteur>
        </div>
      </form>
    </Carte>
  );
}

export function BoutonLicencier({
  id,
  indemniteCentimes,
  ecriture,
}: {
  id: string;
  indemniteCentimes: number;
  /** Écriture de l'indemnité (ecritureLicenciement du moteur), nulle s'il n'y a rien à payer. */
  ecriture: EcritureAffichee | null;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function licencier() {
    setErreur(null);
    setEnCours(true);
    const r = await appelerAction("/api/actions/licencier", { employeeId: id });
    setEnCours(false);
    if (!r.ok) return setErreur(r.message);
    setOuvert(false);
    router.refresh();
  }

  if (!ouvert) {
    return (
      <Bouton petit variante="discret" onClick={() => setOuvert(true)}>
        Licencier…
      </Bouton>
    );
  }
  return (
    <div className="ml-auto flex max-w-sm flex-col gap-2 text-left">
      <p className="text-[0.84rem]">
        {indemniteCentimes > 0
          ? `Indemnité légale : ${formaterEuros(indemniteCentimes)} €, payée tout de suite.`
          : "Pas assez d'ancienneté : aucune indemnité n'est due, aucune écriture n'est passée."}
      </p>
      {ecriture && <EcritureComptable libelle={ecriture.libelle} etiquette="aperçu" lignes={ecriture.lignes} />}
      {erreur && <Message ton="erreur">{erreur}</Message>}
      <div className="flex justify-end gap-2">
        <Bouton petit onClick={() => setOuvert(false)}>Annuler</Bouton>
        <Bouton petit variante="principal" onClick={licencier} disabled={enCours}>
          {enCours ? "…" : "Confirmer le licenciement"}
        </Bouton>
      </div>
    </div>
  );
}
