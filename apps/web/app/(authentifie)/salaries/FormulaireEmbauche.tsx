"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CoefficientsSalaires } from "@kapital/engine";
import { Bouton, Carte, Curseur, EcritureComptable, Ligne, Message, Note, Puce } from "../../../components/ui";
import { apercuEmbauche, bornesSalaire, type EcritureAffichee } from "../../../lib/apercu-lot4";
import { formaterEuros } from "../../../lib/formatage";
import { appelerAction } from "../_partage/reponses";

type Poste = "artisan" | "encadrement";

// Les deux postes de la V1 (pas de candidats fictifs : la V1 n'en a pas).
const POSTES: ReadonlyArray<{ id: Poste; nom: string; type: string; effet: string }> = [
  { id: "artisan", nom: "Artisan", type: "Production", effet: "Fait tourner un poste de travail de l'atelier : c'est lui qui produit." },
  { id: "encadrement", nom: "Encadrement", type: "Bureau", effet: "Organise l'équipe. N'occupe pas de machine et ne produit pas lui-même." },
];

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
  const bornes = bornesSalaire(coefficients);
  const [brut, setBrut] = useState(bornes.min);
  const [enCours, setEnCours] = useState<Poste | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const apercu = useMemo(() => apercuEmbauche({ salaireBrut: brut, coefficients, mois: moisCourant }), [brut, coefficients, moisCourant]);
  const sousSmic = brut < coefficients.smicMensuelBrut;

  async function embaucher(poste: Poste) {
    setErreur(null);
    setAvertissement(null);
    setSucces(null);
    setEnCours(poste);
    const r = await appelerAction("/api/actions/embaucher", { poste, salaireBrutMensuelCentimes: brut });
    setEnCours(null);
    if (!r.ok) return setErreur(r.message);
    setSucces("Salarié embauché. Son premier salaire tombera à la fin du mois de jeu.");
    if (r.data["sansPosteLibre"] === true) {
      setAvertissement("Ce salarié n'a pas de poste : il ne produira pas tant qu'un poste n'est pas libre. Son salaire est dû quand même.");
    }
    router.refresh();
  }

  return (
    <div
      className={verrouille ? "pointer-events-none flex select-none flex-col gap-4 opacity-55" : "flex flex-col gap-4"}
      aria-disabled={verrouille || undefined}
    >
      <Carte titre="Salaire proposé">
        <div className="flex flex-col gap-3">
          <Curseur
            libelle="Salaire brut mensuel"
            valeur={brut}
            min={bornes.min}
            max={bornes.max}
            pas={bornes.pas}
            onChange={setBrut}
            affichage={`${formaterEuros(brut)} €`}
            aide={`De ${formaterEuros(bornes.min)} € (SMIC mensuel brut) à ${formaterEuros(bornes.max)} €, où les cotisations atteignent leur plein taux.`}
          />
          {sousSmic && <Message ton="erreur">Ce salaire est sous le SMIC : en France, c&apos;est interdit pour un temps plein.</Message>}
        </div>
      </Carte>

      <div className="grid gap-4 md:grid-cols-2">
        {POSTES.map((p) => {
          const sansPoste = p.id === "artisan" && postesLibres === 0;
          return (
            <Carte key={p.id} className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-bold">{p.nom}</h3>
                <Puce ton="accent">{p.type}</Puce>
              </div>
              <p className="text-[0.86rem]">{p.effet}</p>
              {p.id === "artisan" && (
                <p className="text-[0.8rem] text-muted">
                  {postesLibres > 0 ? `${postesLibres} poste(s) libre(s) dans ton atelier.` : "Aucun poste libre : il serait payé sans produire."}
                </p>
              )}
              <div>
                <Ligne libelle="Salaire brut (641)">{formaterEuros(brut)} €</Ligne>
                <Ligne libelle="Cotisations patronales (645)">{formaterEuros(apercu.cotisations)} €</Ligne>
                <Ligne libelle="Coût employeur / mois" fort>
                  {formaterEuros(apercu.coutEmployeur)} €
                </Ligne>
              </div>
              <Bouton
                variante={sansPoste ? "secondaire" : "principal"}
                onClick={() => embaucher(p.id)}
                disabled={enCours !== null || verrouille}
              >
                {enCours === p.id ? "Embauche…" : `Embaucher (${p.nom.toLowerCase()})`}
              </Bouton>
            </Carte>
          );
        })}
      </div>

      <Ligne libelle="Trésorerie après la première paie (hors ventes)">
        {formaterEuros(tresorerie - apercu.coutEmployeur)} €
      </Ligne>
      <details className="rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[0.84rem]">
        <summary className="cursor-pointer font-semibold">Écriture de paie de cette embauche, à la fin du mois</summary>
        <div className="mt-2">
          <EcritureComptable libelle={apercu.paie.libelle} etiquette="à la clôture du mois" lignes={apercu.paie.lignes} />
        </div>
      </details>

      {erreur && <Message ton="erreur">{erreur}</Message>}
      {succes && <Message ton="succes">{succes}</Message>}
      {avertissement && <Message ton="info">{avertissement}</Message>}
      <Note>
        L&apos;embauche ne passe aucune écriture le jour où tu signes. Le serveur refuse l&apos;embauche si ta trésorerie
        ne garde pas une réserve de paie suffisante.
      </Note>
    </div>
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
