"use client";

import type { Parametres } from "@kapital/content";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Bouton, EcritureComptable } from "../../../components/ui";
import { CLASSE_SAISIE, Champ, Choix, Ligne, NoteEcriture, Refus, Succes, Vide } from "../../../components/apercu/elements";
import { apercuAtelier, apercuFaconnier, texteDelai } from "../../../lib/apercus";
import { formaterEuros } from "../../../lib/formatage";
import { lireErreur, MESSAGE_RESEAU, type MessageErreur } from "./erreurs";

const ID_GROSSISTE_LOCAL = "gros_local";

export type ProduitGrossiste = {
  id: string;
  nom: string;
  /** Estimation serveur du prix de la pièce (null si non calculable) : le prix définitif est confirmé à la commande. */
  prixEstimeCentimes: number | null;
};

export type ProduitCatalogue = { id: string; nom: string; prixVenteTtc: number; stock: number };

type ResultatGrossiste = { quantite: number; prixParPieceCentimes: number; totalCentimes: number };

type Faconnier = {
  id: string;
  nom: string;
  pays: string;
  delai_mois: number;
  minimum_commande: number;
};

type LigneCatalogueFac = {
  faconnier_id: string;
  product_id: string;
  prix_par_piece_centimes: number;
};

function BlocErreur({ erreur }: { erreur: MessageErreur }) {
  return <Refus details={erreur.conditions}>{erreur.texte}</Refus>;
}

export function LouerAtelierBouton() {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<MessageErreur | null>(null);

  async function louer() {
    setErreur(null);
    setEnCours(true);
    try {
      const reponse = await fetch("/api/actions/louer-atelier", { method: "POST" });
      if (!reponse.ok) {
        setErreur(await lireErreur(reponse));
        return;
      }
      router.refresh();
    } catch {
      setErreur({ texte: MESSAGE_RESEAU, conditions: [] });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Bouton petit onClick={louer} disabled={enCours}>
        {enCours ? "Location…" : "Louer un petit atelier"}
      </Bouton>
      {erreur && <BlocErreur erreur={erreur} />}
    </div>
  );
}

export function FormulaireProduction({
  aUnAtelier,
  faconniers,
  catalogueFaconnier,
  produits,
  produitsGrossiste,
  delaiGrossisteMinutes,
  stockMatiere,
  params,
}: {
  aUnAtelier: boolean;
  faconniers: readonly Faconnier[];
  catalogueFaconnier: readonly LigneCatalogueFac[];
  /** Produits du catalogue du joueur. */
  produits: readonly ProduitCatalogue[];
  produitsGrossiste: readonly ProduitGrossiste[];
  delaiGrossisteMinutes: number;
  /** Première matière en stock (celle que le moteur consomme en atelier), ou null. */
  stockMatiere: { quantite: number; valeurTotale: number; nom: string } | null;
  params: Parametres;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState<string>(produits[0]?.id ?? "");
  const [lieu, setLieu] = useState<string>(aUnAtelier ? "atelier" : (faconniers[0]?.id ?? ""));
  const [quantite, setQuantite] = useState("100");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<MessageErreur | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const produit = produits.find((p) => p.id === productId);
  const grossiste = lieu === ID_GROSSISTE_LOCAL;
  const faconnier = faconniers.find((f) => f.id === lieu);
  const quantiteN = Number(quantite);

  /** Prix par pièce chez un façonnier pour le produit choisi (estimation pour le grossiste). */
  function prixChez(idLieu: string): number | null {
    if (idLieu === ID_GROSSISTE_LOCAL) return produitsGrossiste.find((p) => p.id === productId)?.prixEstimeCentimes ?? null;
    return (
      catalogueFaconnier.find((l) => l.faconnier_id === idLieu && l.product_id === productId)?.prix_par_piece_centimes ?? null
    );
  }
  const prix = lieu === "atelier" ? null : prixChez(lieu);

  const apercu = useMemo(() => {
    if (!produit) return null;
    if (lieu === "atelier") return { mode: "atelier" as const, r: apercuAtelier({ quantite: quantiteN, stockMatiere }) };
    if (!faconnier) return null;
    if (prix === null) {
      return {
        mode: "faconnier" as const,
        r: { ok: false as const, message: `${faconnier.nom} ne fabrique pas ce produit.` },
      };
    }
    return {
      mode: "faconnier" as const,
      r: apercuFaconnier({
        faconnier: {
          id: faconnier.id,
          nom: faconnier.nom,
          pays: faconnier.pays,
          delaiMois: faconnier.delai_mois,
          // Le grossiste n'impose pas de minimum (route commander-grossiste).
          minimumCommande: grossiste ? 1 : faconnier.minimum_commande,
        },
        produit: produit.id,
        prixParPiece: prix,
        quantite: quantiteN,
        moisCourant: 0,
        prixVenteTtc: produit.prixVenteTtc,
        params,
      }),
    };
  }, [produit, lieu, faconnier, prix, grossiste, quantiteN, stockMatiere, params]);

  async function lancer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setConfirmation(null);
    if (!produit || !apercu) {
      setErreur({ texte: "Choisis un produit et un lieu de fabrication.", conditions: [] });
      return;
    }
    if (!apercu.r.ok) {
      setErreur({ texte: apercu.r.message, conditions: [] });
      return;
    }
    setEnCours(true);
    try {
      const reponse = grossiste
        ? await fetch("/api/actions/commander-grossiste", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ productId: produit.id, quantite: quantiteN }),
          })
        : await fetch("/api/actions/lancer-production", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              productId: produit.id,
              quantite: quantiteN,
              lieuType: lieu === "atelier" ? "atelier" : "faconnier",
              faconnierId: lieu === "atelier" ? undefined : lieu,
            }),
          });
      if (!reponse.ok) {
        setErreur(await lireErreur(reponse));
        return;
      }
      if (grossiste) {
        const r = (await reponse.json()) as ResultatGrossiste;
        setConfirmation(
          `Commande passée : ${r.quantite} pièces à ${formaterEuros(r.prixParPieceCentimes)} € la pièce, soit ${formaterEuros(r.totalCentimes)} €. Livraison dans environ ${delaiGrossisteMinutes} minutes.`,
        );
      } else {
        setConfirmation("Production lancée.");
      }
      router.refresh();
    } catch {
      setErreur({ texte: MESSAGE_RESEAU, conditions: [] });
    } finally {
      setEnCours(false);
    }
  }

  if (produits.length === 0) {
    return (
      <Vide>
        Ton catalogue est vide. Ajoute d&apos;abord un produit dans{" "}
        <Link href="/produits" className="text-accent underline">
          Vente et prix
        </Link>
        , puis reviens le faire fabriquer.
      </Vide>
    );
  }

  return (
    <form onSubmit={lancer} className="flex flex-col gap-4">
      <div>
        <h4 className="mb-2 text-[0.9rem] font-bold">Quoi ?</h4>
        <div className="grid gap-2 sm:grid-cols-3">
          {produits.map((p) => (
            <Choix key={p.id} actif={p.id === productId} onClick={() => setProductId(p.id)} titre={p.nom}>
              Prix public {formaterEuros(p.prixVenteTtc)} € · en stock : {p.stock}
            </Choix>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-[0.9rem] font-bold">Où ?</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choix
            actif={lieu === "atelier"}
            onClick={() => setLieu("atelier")}
            titre="Ton atelier"
            desactive={!aUnAtelier}
          >
            {aUnAtelier
              ? "Tu utilises ta matière en stock. La main-d'œuvre, ce sont tes salaires, payés en fin de mois."
              : "Pas encore d'atelier : loue-en un plus bas."}
          </Choix>
          {faconniers.map((f) => {
            const p = prixChez(f.id);
            return (
              <Choix key={f.id} actif={lieu === f.id} onClick={() => setLieu(f.id)} titre={f.nom} desactive={p === null}>
                {f.id === ID_GROSSISTE_LOCAL
                  ? `Livré dans environ ${delaiGrossisteMinutes} minutes, plus cher.`
                  : `${f.pays} · ${texteDelai(f.delai_mois, params)} · minimum ${f.minimum_commande}`}
                {p !== null ? ` · ${formaterEuros(p)} € la pièce${f.id === ID_GROSSISTE_LOCAL ? " (estimation)" : ""}` : " · ne fait pas ce produit"}
              </Choix>
            );
          })}
        </div>
      </div>

      <div className="max-w-[220px]">
        <Champ
          libelle="Quantité (pièces)"
          aide={faconnier && !grossiste ? `Minimum ${faconnier.minimum_commande} chez ${faconnier.nom}` : undefined}
        >
          <input inputMode="numeric" value={quantite} onChange={(e) => setQuantite(e.target.value)} className={CLASSE_SAISIE} />
        </Champ>
      </div>

      {apercu && apercu.mode === "faconnier" && apercu.r.ok && (
        <div className="flex flex-col gap-3">
          <div className="grid gap-x-6 sm:grid-cols-2">
            <div>
              <Ligne libelle="Coût par pièce (tout compris)">{formaterEuros(apercu.r.prixParPiece)} €</Ligne>
              <Ligne libelle="Coût total">{formaterEuros(apercu.r.total)} €</Ligne>
              <Ligne libelle="Livraison">
                {grossiste ? `environ ${delaiGrossisteMinutes} min` : texteDelai(faconnier?.delai_mois ?? 0, params)}
              </Ligne>
            </div>
            <div>
              {apercu.r.margeParPiece !== null && (
                <Ligne libelle="Marge par pièce vendue en ligne" ton={apercu.r.margeParPiece < 0 ? "critique" : "bon"}>
                  {formaterEuros(apercu.r.margeParPiece)} €
                </Ligne>
              )}
              <Ligne libelle="Sortie de trésorerie aujourd'hui">0,00 €</Ligne>
              <Ligne libelle="Dette envers le façonnier à la livraison">{formaterEuros(apercu.r.total)} €</Ligne>
            </div>
          </div>
          {grossiste && (
            <p className="text-[0.78rem] text-muted">Prix estimé : le serveur le recalcule et le confirme à la commande.</p>
          )}
          <NoteEcriture>
            Rien n&apos;est écrit maintenant. À la livraison, le moteur entrera les pièces en stock et notera la facture du
            façonnier :
          </NoteEcriture>
          <EcritureComptable libelle={`Livraison : ${produit?.nom ?? ""}`} etiquette="à la livraison" lignes={apercu.r.ecritureLivraison} />
        </div>
      )}

      {apercu && apercu.mode === "atelier" && apercu.r.ok && (
        <div className="flex flex-col gap-3">
          <div>
            <Ligne libelle={`Matière utilisée (${stockMatiere?.nom.toLowerCase() ?? "stock"})`}>
              {apercu.r.piecesCouvertes} unités · {formaterEuros(apercu.r.valeurMatiere)} €
            </Ligne>
            <Ligne libelle="Sortie de trésorerie aujourd'hui">0,00 € (matière déjà payée ou due)</Ligne>
            {apercu.r.piecesCouvertes < quantiteN && (
              <Ligne libelle="Pièces sans matière" ton="critique">
                {quantiteN - apercu.r.piecesCouvertes}
              </Ligne>
            )}
          </div>
          <NoteEcriture>
            Rien n&apos;est écrit maintenant. Au fil du mois, l&apos;atelier fabrique selon la production mensuelle réglée
            dans Vente et prix et la capacité de tes couturiers ; le moteur passe alors :
          </NoteEcriture>
          <EcritureComptable libelle="Fabrication en atelier" etiquette="au fil du mois" lignes={apercu.r.ecritureFabrication} />
        </div>
      )}

      {apercu && !apercu.r.ok && <Refus>{apercu.r.message}</Refus>}
      {erreur && <BlocErreur erreur={erreur} />}
      {confirmation && <Succes>{confirmation}</Succes>}

      <div className="flex justify-end">
        <Bouton type="submit" variante="principal" disabled={enCours || !apercu?.r.ok}>
          {enCours ? "Lancement…" : grossiste ? "Commander au grossiste" : "Lancer la production"}
        </Bouton>
      </div>
    </form>
  );
}
