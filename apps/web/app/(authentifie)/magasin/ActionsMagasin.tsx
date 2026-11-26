"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bouton, CLASSE_SAISIE, Champ, EcritureComptable, Ligne, Message, Note, Options, Puce } from "../../../components/ui";
import { lireEuros } from "../../../lib/apercu-lot4";
import { enMois, libelleMois } from "../../../lib/cadre";
import { formaterEuros } from "../../../lib/formatage";
import { appelerAction } from "../_partage/reponses";
import type { OffreEmplacement } from "./donnees";

const euros = (c: number) => `${formaterEuros(c)} €`;
const nombre = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/** Choix de l'emplacement, simulation avant signature et signature du bail (route ouvrir-boutique). */
export function ChoixEmplacement({
  offres,
  tresorerie,
  peutOuvrir,
  ventesMaxParVendeur,
}: {
  offres: readonly OffreEmplacement[];
  tresorerie: number;
  /** Étape 3 atteinte (ou déblocage de développement) : le serveur accepte la signature. */
  peutOuvrir: boolean;
  ventesMaxParVendeur: number;
}) {
  const router = useRouter();
  const [choix, setChoix] = useState(offres[0]?.apercu.batimentId ?? "");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const offre = offres.find((o) => o.apercu.batimentId === choix) ?? offres[0];
  if (!offre) return null;
  const a = offre.apercu;

  async function signer() {
    if (
      !confirm(
        `Signer le bail de « ${a.nom} » ? ${euros(a.totalALaSignature)} sortent de la banque tout de suite (dépôt de garantie et travaux), puis le loyer et les charges chaque mois.`,
      )
    )
      return;
    setErreur(null);
    setSucces(null);
    setEnCours(true);
    const r = await appelerAction("/api/actions/ouvrir-boutique", { batimentId: a.batimentId });
    setEnCours(false);
    if (!r.ok) return setErreur(r.message);
    setSucces(`Bail signé. Les travaux commencent : la boutique ouvrira ${enMois(a.moisOuverture)}.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Options
        libelle="Emplacement de la boutique"
        valeur={offre.apercu.batimentId}
        onChange={(id) => {
          setChoix(id);
          setErreur(null);
        }}
        options={offres.map((o) => ({
          id: o.apercu.batimentId,
          titre: o.apercu.nom,
          detail: `${o.apercu.surfaceM2} m² · ${o.apercu.passantsParJour.toLocaleString("fr-FR")} passants / jour · désirabilité +${nombre(o.apercu.bonusDesirabiliteParMois)} / mois`,
          prix: `${euros(o.apercu.loyerMensuel)} / mois`,
        }))}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col">
          <h4 className="mb-1 text-[0.84rem] font-bold">À la signature</h4>
          <Ligne libelle={`Dépôt de garantie (275)`}>{euros(a.depotGarantie)}</Ligne>
          <Ligne libelle={`Travaux d'agencement, ${a.surfaceM2} m² (2135)`}>{euros(a.travaux)}</Ligne>
          <Ligne libelle="Total qui sort de la banque" fort>
            {euros(a.totalALaSignature)}
          </Ligne>
          <Ligne libelle="Trésorerie après la signature" ton={a.tresorerieSuffisante ? undefined : "critique"}>
            {euros(tresorerie - a.totalALaSignature)}
          </Ligne>
          <Ligne libelle="Ouverture après les travaux">
            {libelleMois(a.moisOuverture)} ({a.dureeTravauxMois} mois de travaux)
          </Ligne>
        </div>
        <div className="flex flex-col">
          <h4 className="mb-1 text-[0.84rem] font-bold">Chaque mois</h4>
          <Ligne libelle="Loyer (613)">{euros(a.loyerMensuel)}</Ligne>
          <Ligne libelle="Charges locatives (614)">{euros(a.chargesMensuelles)}</Ligne>
          <Ligne libelle="Un vendeur, coût employeur (641 + 645)">{euros(a.coutEmployeurVendeur)}</Ligne>
          <Ligne libelle="Amortissement des agencements (681)">{euros(a.amortissementMensuel)}</Ligne>
          <Ligne libelle="Charges fixes avec un vendeur" fort>
            {euros(a.chargesFixesMensuellesAvecUnVendeur)}
          </Ligne>
          <Ligne libelle="Point mort">
            {offre.piecesPointMort === null
              ? "marge inconnue"
              : `${offre.piecesPointMort.toLocaleString("fr-FR")} pièces / mois`}
          </Ligne>
        </div>
      </div>

      {offre.piecesPointMort !== null && offre.piecesPointMort > ventesMaxParVendeur && (
        <Message ton="info">
          Le point mort dépasse ce qu&apos;un vendeur peut vendre ({ventesMaxParVendeur.toLocaleString("fr-FR")} pièces
          par mois) : il faudra plusieurs vendeurs, ou un meilleur prix, pour que la boutique gagne de l&apos;argent.
        </Message>
      )}

      <details className="rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[0.84rem]">
        <summary className="cursor-pointer font-semibold">Écritures passées à la signature</summary>
        <div className="mt-2 flex flex-col gap-2">
          {offre.ecritures.map((e) => (
            <EcritureComptable key={e.libelle} libelle={e.libelle} etiquette="à la signature" lignes={e.lignes} />
          ))}
          <p className="text-muted">
            Ni le dépôt ni les travaux ne sont des charges : le dépôt reste à l&apos;actif (tu le récupères en partant), les
            travaux sont une immobilisation amortie chaque mois à partir de l&apos;ouverture.
          </p>
        </div>
      </details>

      {!a.tresorerieSuffisante && (
        <Message ton="erreur">Trésorerie insuffisante pour signer : il manque {euros(a.manque)}.</Message>
      )}
      {erreur && <Message ton="erreur">{erreur}</Message>}
      {succes && <Message ton="succes">{succes}</Message>}
      <div className="flex flex-wrap items-center gap-3">
        <Bouton variante="principal" onClick={signer} disabled={enCours || !peutOuvrir || !a.tresorerieSuffisante}>
          {enCours ? "Signature…" : "Signer le bail et ouvrir"}
        </Bouton>
        {!peutOuvrir && <Puce ton="alerte">Étape 3 requise</Puce>}
      </div>
      <Note>
        Le loyer court dès la signature, même pendant les travaux. Embauche ton vendeur pendant ce temps et envoie du
        stock : la boutique vendra dès son ouverture.
      </Note>
    </div>
  );
}

export type ProduitTransferable = {
  readonly id: string;
  readonly nom: string;
  /** Pièces dans le stock de l'atelier. */
  readonly enAtelier: number;
  /** Pièces dans le stock de la boutique. */
  readonly enBoutique: number;
};

/** Transfert de pièces du stock de l'atelier vers la boutique (route transferer-stock-boutique). */
export function TransfertStock({ pointDeVenteId, produits }: { pointDeVenteId: string; produits: readonly ProduitTransferable[] }) {
  const router = useRouter();
  const [produitId, setProduitId] = useState(produits.find((p) => p.enAtelier > 0)?.id ?? produits[0]?.id ?? "");
  const [quantite, setQuantite] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const produit = produits.find((p) => p.id === produitId);
  const q = /^\d+$/.test(quantite.trim()) ? Number(quantite.trim()) : null;

  if (produits.length === 0) {
    return <p className="text-[0.86rem] text-muted">Aucun produit au catalogue : ajoute d&apos;abord un produit (écran Produits).</p>;
  }

  async function transferer() {
    if (q === null || q <= 0) return setErreur("Indique un nombre entier de pièces.");
    setErreur(null);
    setSucces(null);
    setEnCours(true);
    const r = await appelerAction("/api/actions/transferer-stock-boutique", { pointDeVenteId, produitId, quantite: q });
    setEnCours(false);
    if (!r.ok) return setErreur(r.message);
    setSucces(`${q} pièce${q > 1 ? "s" : ""} envoyée${q > 1 ? "s" : ""} en boutique.`);
    setQuantite("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Champ libelle="Produit">
          <select value={produitId} onChange={(e) => setProduitId(e.target.value)} className={CLASSE_SAISIE}>
            {produits.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom} · {p.enAtelier} à l&apos;atelier · {p.enBoutique} en boutique
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Pièces" aide={produit ? `${produit.enAtelier} disponibles` : undefined}>
          <input
            type="text"
            inputMode="numeric"
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            className={CLASSE_SAISIE}
          />
        </Champ>
      </div>
      {erreur && <Message ton="erreur">{erreur}</Message>}
      {succes && <Message ton="succes">{succes}</Message>}
      <div>
        <Bouton variante="principal" onClick={transferer} disabled={enCours || !produit || produit.enAtelier === 0}>
          {enCours ? "Transfert…" : "Envoyer en boutique"}
        </Bouton>
      </div>
      <Note>
        Aucune écriture : les pièces changent de place, pas de valeur. Elles restent au compte 35 (stock de produits
        finis), à leur coût moyen.
      </Note>
    </div>
  );
}

export type LignePrixBoutique = {
  readonly lignePrixId: string;
  readonly nom: string;
  readonly prixEnLigne: number;
  /** Prix fixé pour la boutique, ou null : la boutique reprend le prix en ligne. */
  readonly prixBoutique: number | null;
};

/** Prix TTC en boutique, produit par produit (route fixer-prix, champ prixBoutiqueCentimes). */
export function PrixBoutique({ lignes }: { lignes: readonly LignePrixBoutique[] }) {
  return (
    <div className="flex flex-col gap-2">
      {lignes.map((l) => (
        <LignePrix key={l.lignePrixId} ligne={l} />
      ))}
      <Note>Champ vide : la boutique vend au prix en ligne.</Note>
    </div>
  );
}

function LignePrix({ ligne }: { ligne: LignePrixBoutique }) {
  const router = useRouter();
  const [saisie, setSaisie] = useState(ligne.prixBoutique === null ? "" : formaterEuros(ligne.prixBoutique));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const vide = saisie.trim() === "";
  const prix = vide ? null : lireEuros(saisie);

  async function enregistrer() {
    if (!vide && prix === null) return setErreur("Indique un prix en euros, par exemple 45 ou 45,90.");
    setErreur(null);
    setEnCours(true);
    const r = await appelerAction("/api/actions/fixer-prix", { lignePrixId: ligne.lignePrixId, prixBoutiqueCentimes: prix });
    setEnCours(false);
    if (!r.ok) return setErreur(r.message);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
        <div className="text-[0.88rem]">
          <b>{ligne.nom}</b>
          <span className="block text-[0.8rem] text-muted">En ligne : {euros(ligne.prixEnLigne)} TTC</span>
        </div>
        <Champ libelle="Prix en boutique (€ TTC)">
          <input
            type="text"
            inputMode="decimal"
            value={saisie}
            placeholder={formaterEuros(ligne.prixEnLigne)}
            onChange={(e) => setSaisie(e.target.value)}
            className={CLASSE_SAISIE}
          />
        </Champ>
        <Bouton petit onClick={enregistrer} disabled={enCours}>
          {enCours ? "…" : "Enregistrer"}
        </Bouton>
      </div>
      {erreur && <Message ton="erreur">{erreur}</Message>}
    </div>
  );
}
