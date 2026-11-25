"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Parametres } from "@kapital/content";
import { Bouton, Carte, EcritureComptable } from "../../../components/ui";
import { classeChamp, classeEtiquette, LigneValeur, Message, NoteMoteur, Options } from "../../../components/ui/lot4";
import { apercuAchat, lireEuros, type EcritureAffichee } from "../../../lib/apercu-lot4";
import { formaterEuros } from "../../../lib/formatage";
import { appelerAction } from "../_partage/reponses";

export type OffreLocal = {
  id: string;
  nom: string;
  surfaceM2: number;
  loyer: number;
  charges: number;
  prix: number;
  apportMinimal: number;
  etapeDebloquee: number;
  /** Étape de l'entreprise inférieure à celle du local. */
  verrouEtape: boolean;
  /** Aperçu de la signature du bail, calculé par le moteur (apercuBail). */
  bail: {
    depot: number;
    signature: EcritureAffichee;
    mensuelles: EcritureAffichee[];
    tresorerieApres: number;
    manque: number;
  };
  /** Comparatif louer ou acheter sur la durée comparée. */
  comparatif: {
    mois: number;
    coutLouer: number;
    coutAcheter: number;
    sortiesLouer: number;
    sortiesAcheter: number;
    valeurRestante: number;
    detteRestante: number;
  } | null;
};

export type ContexteAchat = {
  tauxAnnuel: number;
  estrAnnuel: number;
  dureeMin: number;
  dureeMax: number;
  dureeDefaut: number;
  tresorerie: number;
  detteEnCours: number;
  moisCourant: number;
  /** Paramètres achat_* et pret_* : ceux que lit acheterLocal. */
  params: Parametres;
};

const pourcent = (x: number) => `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;

export function CarteOffre({
  offre,
  contexte,
  peutLouer,
  peutAcheter,
}: {
  offre: OffreLocal;
  contexte: ContexteAchat;
  peutLouer: boolean;
  peutAcheter: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"louer" | "acheter">("louer");
  const [apport, setApport] = useState((offre.apportMinimal / 100).toFixed(2).replace(".", ","));
  const [duree, setDuree] = useState(String(contexte.dureeDefaut));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const apportCentimes = lireEuros(apport);
  const dureeN = Number.parseInt(duree, 10);
  const achat = useMemo(
    () =>
      apercuAchat({
        batiment: { id: offre.id, surfaceM2: offre.surfaceM2, prixAchat: offre.prix, chargesMensuelles: offre.charges },
        apport: apportCentimes ?? 0,
        dureePretMois: Number.isFinite(dureeN) ? dureeN : 0,
        estrAnnuel: contexte.estrAnnuel,
        tresorerie: contexte.tresorerie,
        detteEnCours: contexte.detteEnCours,
        mois: contexte.moisCourant,
        params: contexte.params,
      }),
    [offre, apportCentimes, dureeN, contexte],
  );

  async function louer() {
    setErreur(null);
    setSucces(null);
    setEnCours(true);
    const r = await appelerAction("/api/actions/louer-atelier", { batimentId: offre.id });
    setEnCours(false);
    if (!r.ok) return setErreur(r.message);
    setSucces("Bail signé : ton atelier est prêt.");
    router.refresh();
  }

  async function acheter() {
    setErreur(null);
    setSucces(null);
    if (!achat.ok || apportCentimes === null) return setErreur(achat.ok ? "Apport invalide." : achat.message);
    setEnCours(true);
    const r = await appelerAction("/api/actions/acheter-local", { batimentId: offre.id, apportCentimes, dureeMois: dureeN });
    setEnCours(false);
    if (!r.ok) return setErreur(r.message);
    setSucces("Local acheté : tu es propriétaire.");
    router.refresh();
  }

  const c = offre.comparatif;
  const b = offre.bail;
  return (
    <Carte
      surTitre={`${offre.surfaceM2} m²${offre.etapeDebloquee > 0 ? ` · étape ${offre.etapeDebloquee}` : ""}`}
      titre={offre.nom}
      className="flex flex-col gap-3"
    >
      <LigneValeur libelle="Loyer">{formaterEuros(offre.loyer)} € / mois</LigneValeur>
      <LigneValeur libelle="Charges">{formaterEuros(offre.charges)} € / mois</LigneValeur>
      <LigneValeur libelle="Prix d'achat">{formaterEuros(offre.prix)} €</LigneValeur>

      {offre.verrouEtape ? (
        <Message ton="info">
          Ce local se débloque à l&apos;étape {offre.etapeDebloquee}. Développe ton activité pour y accéder.
        </Message>
      ) : (
        <>
          <Options
            libelle="Louer ou acheter"
            valeur={mode}
            onChange={(m) => {
              setMode(m);
              setErreur(null);
            }}
            options={[
              { id: "louer", titre: "Louer" },
              { id: "acheter", titre: "Acheter à crédit" },
            ]}
          />

          {mode === "louer" ? (
            <div className="flex flex-col gap-2.5">
              <LigneValeur libelle="Dépôt de garantie versé à la signature">{formaterEuros(b.depot)} €</LigneValeur>
              <LigneValeur libelle="Trésorerie après signature">{formaterEuros(b.tresorerieApres)} €</LigneValeur>
              {b.manque > 0 && (
                <Message ton="erreur">Trésorerie insuffisante pour le dépôt : il manque {formaterEuros(b.manque)} €.</Message>
              )}
              <EcritureComptable libelle={b.signature.libelle} etiquette="à la signature" lignes={b.signature.lignes} />
              {b.mensuelles.map((e) => (
                <EcritureComptable key={e.libelle} libelle={e.libelle} etiquette="chaque fin de mois" lignes={e.lignes} />
              ))}
              <Bouton variante="principal" onClick={louer} disabled={enCours || !peutLouer || b.manque > 0}>
                {enCours ? "Signature…" : "Louer ce local"}
              </Bouton>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1" htmlFor={`apport-${offre.id}`}>
                  <span className={classeEtiquette}>Apport (€)</span>
                  <input id={`apport-${offre.id}`} type="text" inputMode="decimal" value={apport} onChange={(e) => setApport(e.target.value)} className={classeChamp} />
                  <span className="text-[0.75rem] text-muted">Minimum {formaterEuros(offre.apportMinimal)} €</span>
                </label>
                <label className="flex flex-col gap-1" htmlFor={`duree-${offre.id}`}>
                  <span className={classeEtiquette}>Durée (mois)</span>
                  <input id={`duree-${offre.id}`} type="number" min={contexte.dureeMin} max={contexte.dureeMax} value={duree} onChange={(e) => setDuree(e.target.value)} className={classeChamp} />
                  <span className="text-[0.75rem] text-muted">De {contexte.dureeMin} à {contexte.dureeMax} mois</span>
                </label>
              </div>
              {achat.ok ? (
                <>
                  <LigneValeur libelle="Nouveau prêt immobilier">{formaterEuros(achat.montantPret)} €</LigneValeur>
                  <LigneValeur libelle={`Mensualité (taux ${pourcent(achat.tauxAnnuel)})`}>
                    {achat.montantPret > 0 ? `${formaterEuros(achat.mensualite)} €` : "aucune"}
                  </LigneValeur>
                  <LigneValeur libelle="Coût total du crédit">{formaterEuros(achat.coutCredit)} €</LigneValeur>
                  <LigneValeur libelle="Trésorerie après l'achat">{formaterEuros(achat.tresorerieApres)} €</LigneValeur>
                  {achat.ecritures.map((e) => (
                    <EcritureComptable key={e.libelle} libelle={e.libelle} etiquette="aperçu" lignes={e.lignes} />
                  ))}
                </>
              ) : (
                <Message ton="erreur">{apportCentimes === null ? "Indique un apport en euros." : achat.message}</Message>
              )}
              <Bouton variante="principal" onClick={acheter} disabled={enCours || !peutAcheter || !achat.ok}>
                {enCours ? "Achat…" : "Acheter ce local"}
              </Bouton>
              <NoteMoteur>Le serveur revérifie l&apos;apport et ton plafond d&apos;endettement au moment de signer.</NoteMoteur>
            </div>
          )}
        </>
      )}

      {c && (
        <details className="rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[0.84rem]">
          <summary className="cursor-pointer font-semibold">Louer ou acheter : comparaison sur {c.mois} mois</summary>
          <div className="mt-2 flex flex-col gap-1">
            <LigneValeur libelle="Coût si tu loues">{formaterEuros(c.coutLouer)} €</LigneValeur>
            <LigneValeur libelle="Coût si tu achètes">{formaterEuros(c.coutAcheter)} €</LigneValeur>
            <LigneValeur libelle="Argent sorti si tu loues">{formaterEuros(c.sortiesLouer)} €</LigneValeur>
            <LigneValeur libelle="Argent sorti si tu achètes">{formaterEuros(c.sortiesAcheter)} €</LigneValeur>
            <p className="text-muted">
              En achetant, il te reste un local valant {formaterEuros(c.valeurRestante)} € et {formaterEuros(c.detteRestante)} € de
              dette. Le coût compte ce qui est vraiment perdu : loyer et charges si tu loues ; intérêts, usure du
              bâtiment (amortissement) et charges si tu achètes.
            </p>
          </div>
        </details>
      )}

      {erreur && <Message ton="erreur">{erreur}</Message>}
      {succes && <Message ton="succes">{succes}</Message>}
    </Carte>
  );
}

export function BoutonConge({ preavisMois }: { preavisMois: number }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function donner() {
    if (
      !confirm(
        `Donner congé ? Le bail se termine dans ${preavisMois} mois et le loyer reste dû jusque-là. Le dépôt de garantie t'est rendu à la fin.`,
      )
    )
      return;
    setErreur(null);
    setEnCours(true);
    const r = await appelerAction("/api/actions/donner-conge-atelier");
    setEnCours(false);
    if (!r.ok) return setErreur(r.message);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Bouton onClick={donner} disabled={enCours}>
        {enCours ? "Envoi…" : `Donner congé (préavis de ${preavisMois} mois)`}
      </Bouton>
      {erreur && <Message ton="erreur">{erreur}</Message>}
    </div>
  );
}
