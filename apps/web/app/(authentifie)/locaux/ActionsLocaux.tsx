"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Parametres } from "@kapital/content";
import type { ReactNode } from "react";
import { Bouton, Carte, CLASSE_SAISIE, Champ, EcritureComptable, Ligne as LigneValeur, Message, Note, Options } from "../../../components/ui";
import { apercuAchat, dureesProposees, lireEuros, type EcritureAffichee } from "../../../lib/apercu-lot4";
import { formaterEuros } from "../../../lib/formatage";
import { PARAM_SIGNATURE } from "../../../lib/locaux";
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

/** Écritures repliées : la carte reste compacte, le détail s'ouvre au clic. */
function Ecritures({ titre, children }: { titre: ReactNode; children: ReactNode }) {
  return (
    <details className="group rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[0.84rem]">
      <summary className="cursor-pointer font-semibold">{titre}</summary>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </details>
  );
}

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

  // Le message de réussite s'affiche en haut de la page (là où le nouveau local apparaît),
  // pas au pied de cette carte, que le joueur ne voit plus une fois la page rechargée.
  async function louer() {
    setErreur(null);
    setEnCours(true);
    const r = await appelerAction("/api/actions/louer-atelier", { batimentId: offre.id });
    setEnCours(false);
    if (!r.ok) return setErreur(r.message);
    router.push(`/locaux?${PARAM_SIGNATURE}=bail`);
  }

  async function acheter() {
    setErreur(null);
    if (!achat.ok || apportCentimes === null) return setErreur(achat.ok ? "Apport invalide." : achat.message);
    setEnCours(true);
    const r = await appelerAction("/api/actions/acheter-local", { batimentId: offre.id, apportCentimes, dureeMois: dureeN });
    setEnCours(false);
    if (!r.ok) return setErreur(r.message);
    router.push(`/locaux?${PARAM_SIGNATURE}=achat`);
  }

  const c = offre.comparatif;
  const b = offre.bail;
  return (
    <Carte
      surTitre={`${offre.surfaceM2} m²${offre.verrouEtape ? ` · étape ${offre.etapeDebloquee}` : ""}`}
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
              { id: "louer", titre: "Louer", detail: "Bail commercial", prix: `Dépôt ${formaterEuros(b.depot)} €` },
              { id: "acheter", titre: "Acheter", detail: "À crédit", prix: `Apport dès ${formaterEuros(offre.apportMinimal)} €` },
            ]}
          />

          {mode === "louer" ? (
            <div className="flex flex-col gap-2.5">
              <LigneValeur libelle="Dépôt de garantie versé à la signature">{formaterEuros(b.depot)} €</LigneValeur>
              <LigneValeur libelle="Trésorerie après signature">{formaterEuros(b.tresorerieApres)} €</LigneValeur>
              {b.manque > 0 && (
                <Message ton="erreur">Trésorerie insuffisante pour le dépôt : il manque {formaterEuros(b.manque)} €.</Message>
              )}
              <Ecritures titre="Voir les écritures (signature et chaque mois)">
                <EcritureComptable libelle={b.signature.libelle} etiquette="à la signature" lignes={b.signature.lignes} />
                {b.mensuelles.map((e) => (
                  <EcritureComptable key={e.libelle} libelle={e.libelle} etiquette="chaque fin de mois" lignes={e.lignes} />
                ))}
              </Ecritures>
              <Bouton variante="principal" onClick={louer} disabled={enCours || !peutLouer || b.manque > 0}>
                {enCours ? "Signature…" : "Louer ce local"}
              </Bouton>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-2 gap-2">
                <Champ libelle="Apport (€)" aide={`Minimum ${formaterEuros(offre.apportMinimal)} €`}>
                  <input type="text" inputMode="decimal" value={apport} onChange={(e) => setApport(e.target.value)} className={CLASSE_SAISIE} />
                </Champ>
                <Champ libelle="Durée du prêt" aide={`De ${contexte.dureeMin} à ${contexte.dureeMax} mois`}>
                  <select value={duree} onChange={(e) => setDuree(e.target.value)} className={CLASSE_SAISIE}>
                    {dureesProposees(contexte.dureeMin, contexte.dureeMax)
                      .concat(dureesProposees(contexte.dureeMin, contexte.dureeMax).includes(contexte.dureeDefaut) ? [] : [contexte.dureeDefaut])
                      .sort((x, y) => x - y)
                      .map((d) => (
                        <option key={d} value={d}>
                          {d} mois{d % 12 === 0 ? ` (${d / 12} an${d > 12 ? "s" : ""})` : ""}
                        </option>
                      ))}
                  </select>
                </Champ>
              </div>
              {achat.ok ? (
                <>
                  <LigneValeur libelle="Nouveau prêt immobilier">{formaterEuros(achat.montantPret)} €</LigneValeur>
                  <LigneValeur libelle={`Mensualité (taux ${pourcent(achat.tauxAnnuel)})`}>
                    {achat.montantPret > 0 ? `${formaterEuros(achat.mensualite)} €` : "aucune"}
                  </LigneValeur>
                  <LigneValeur libelle="Coût total du crédit">{formaterEuros(achat.coutCredit)} €</LigneValeur>
                  <LigneValeur libelle="Trésorerie après l'achat">{formaterEuros(achat.tresorerieApres)} €</LigneValeur>
                  <Ecritures titre="Voir l'écriture de l'achat">
                    {achat.ecritures.map((e) => (
                      <EcritureComptable key={e.libelle} libelle={e.libelle} etiquette="aperçu" lignes={e.lignes} />
                    ))}
                  </Ecritures>
                </>
              ) : (
                <Message ton="erreur">{apportCentimes === null ? "Indique un apport en euros." : achat.message}</Message>
              )}
              <Bouton variante="principal" onClick={acheter} disabled={enCours || !peutAcheter || !achat.ok}>
                {enCours ? "Achat…" : "Acheter ce local"}
              </Bouton>
              <Note>Le serveur revérifie l&apos;apport et ton plafond d&apos;endettement au moment de signer.</Note>
            </div>
          )}
        </>
      )}

      {c && (
        <Ecritures titre={`Louer ou acheter : comparaison sur ${c.mois} mois`}>
          <div className="flex flex-col gap-1">
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
        </Ecritures>
      )}

      {erreur && <Message ton="erreur">{erreur}</Message>}
    </Carte>
  );
}

export function BoutonConge({
  preavisMois,
  workshopId,
  finSiConge,
}: {
  preavisMois: number;
  workshopId: string;
  /** Fin du bail si le congé est donné maintenant (« jeu. 31 déc. 2026 (dans 35 jours) ») ; null si inconnue. */
  finSiConge: string | null;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function donner() {
    if (
      !confirm(
        `Donner congé ? Avec ${preavisMois} mois de préavis, le bail prend fin ${finSiConge ? `le ${finSiConge}` : "à la fin du préavis"} et le loyer reste dû jusque-là. Le dépôt de garantie t'est rendu à la fin.`,
      )
    )
      return;
    setErreur(null);
    setEnCours(true);
    // 3D-7 : le congé vise ce local, et lui seul.
    const r = await appelerAction("/api/actions/donner-conge-atelier", { workshopId });
    setEnCours(false);
    if (!r.ok) return setErreur(r.message);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Bouton onClick={donner} disabled={enCours}>
        {enCours ? "Envoi…" : `Donner congé (préavis de ${preavisMois} mois)`}
      </Bouton>
      {finSiConge && <p className="text-[0.8rem] text-muted">Congé donné aujourd&apos;hui : fin du bail le {finSiConge}.</p>}
      {erreur && <Message ton="erreur">{erreur}</Message>}
    </div>
  );
}
