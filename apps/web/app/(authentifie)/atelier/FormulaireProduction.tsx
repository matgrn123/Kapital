"use client";

import type { Parametres } from "@kapital/content";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Bouton, EcritureComptable } from "../../../components/ui";
import { Choix, Curseur, Ligne, Note, Refus, Resultat, Succes, Vide } from "../../../components/ui";
import { centimes, idMatiere, piecesPermisesParLaMatiere } from "@kapital/engine";
import { apercuAtelier, apercuFaconnier, bornesQuantite, texteDelai } from "../../../lib/apercus";
import { formaterEuros } from "../../../lib/formatage";
import { lireErreur, MESSAGE_RESEAU, type MessageErreur } from "./erreurs";

const ID_GROSSISTE_LOCAL = "gros_local";

export type ProduitGrossiste = {
  id: string;
  nom: string;
  /** Estimation serveur du prix de la pièce (null si non calculable) : le prix définitif est confirmé à la commande. */
  prixEstimeCentimes: number | null;
};

export type ProduitCatalogue = {
  id: string;
  nom: string;
  prixVenteTtc: number;
  stock: number;
  /** Nomenclature et stock de la matière du produit (fabrication en atelier), ou null. */
  fabrication: {
    consommationParPiece: number;
    fournituresParPiece: number;
    nomMatiere: string;
    stock: { quantite: number; valeurTotale: number } | null;
  } | null;
};

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
  tresorerie,
  params,
}: {
  aUnAtelier: boolean;
  faconniers: readonly Faconnier[];
  catalogueFaconnier: readonly LigneCatalogueFac[];
  /** Produits du catalogue du joueur. */
  produits: readonly ProduitCatalogue[];
  produitsGrossiste: readonly ProduitGrossiste[];
  delaiGrossisteMinutes: number;
  /** Trésorerie du joueur : sert à borner le curseur de quantité. */
  tresorerie: number;
  params: Parametres;
}) {
  const router = useRouter();
  const tauxChute = params["taux_chute_matiere_defaut"]?.valeur ?? 0;
  const [productId, setProductId] = useState<string>(produits[0]?.id ?? "");
  const [lieu, setLieu] = useState<string>(aUnAtelier ? "atelier" : (faconniers[0]?.id ?? ""));
  const [quantiteN, setQuantiteN] = useState<number>(faconniers[0]?.minimum_commande ?? 1);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<MessageErreur | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const produit = produits.find((p) => p.id === productId);
  const grossiste = lieu === ID_GROSSISTE_LOCAL;
  const faconnier = faconniers.find((f) => f.id === lieu);

  /** Prix par pièce chez un façonnier pour le produit choisi (estimation pour le grossiste). */
  function prixChez(idLieu: string): number | null {
    if (idLieu === ID_GROSSISTE_LOCAL) return produitsGrossiste.find((p) => p.id === productId)?.prixEstimeCentimes ?? null;
    return (
      catalogueFaconnier.find((l) => l.faconnier_id === idLieu && l.product_id === productId)?.prix_par_piece_centimes ?? null
    );
  }
  const prix = lieu === "atelier" ? null : prixChez(lieu);
  const minimum = lieu === "atelier" || grossiste ? 1 : (faconnier?.minimum_commande ?? 1);
  // Plafond tiré des données : ta matière en stock (atelier) ou ce que ta trésorerie peut payer.
  const plafonds =
      lieu === "atelier"
        ? [
            produit?.fabrication?.stock
              ? piecesPermisesParLaMatiere(
                  produit.fabrication.stock.quantite,
                  {
                    matiere: idMatiere("apercu"),
                    consommationParPiece: produit.fabrication.consommationParPiece,
                    fournituresParPiece: centimes(produit.fabrication.fournituresParPiece),
                    tempsStandardMinutes: 0,
                  },
                  tauxChute,
                )
              : 0,
          ]
        : prix && prix > 0
          ? [tresorerie / prix]
          : [];
  const bornes = bornesQuantite({ minimum, plafonds });
  // Plafond réel (avant de forcer le curseur au minimum) : 0 si rien n'est possible.
  const plafondReel = plafonds.length > 0 ? Math.floor(Math.min(...plafonds)) : Number.POSITIVE_INFINITY;
  const rienPossible = plafondReel < bornes.min;
  const quantiteBornee = Math.min(Math.max(quantiteN, bornes.min), bornes.max);

  const apercu = useMemo(() => {
    if (!produit) return null;
    if (lieu === "atelier")
      return {
        mode: "atelier" as const,
        r: apercuAtelier({
          quantite: quantiteBornee,
          fiche: produit.fabrication,
          stockMatiere: produit.fabrication?.stock ?? null,
          tauxChute,
        }),
      };
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
        quantite: quantiteBornee,
        moisCourant: 0,
        prixVenteTtc: produit.prixVenteTtc,
        params,
        // Le façonnier travaille avec ta matière ; le grossiste fournit tout.
        matiere:
          grossiste || !produit.fabrication
            ? null
            : {
                consommationParPiece: produit.fabrication.consommationParPiece,
                fournituresParPiece: produit.fabrication.fournituresParPiece,
                stock: produit.fabrication.stock,
              },
      }),
    };
  }, [produit, lieu, faconnier, prix, grossiste, quantiteBornee, tauxChute, params]);

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
            body: JSON.stringify({ productId: produit.id, quantite: quantiteBornee }),
          })
        : await fetch("/api/actions/lancer-production", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              productId: produit.id,
              quantite: quantiteBornee,
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
            <Choix
              key={p.id}
              actif={p.id === productId}
              onClick={() => setProductId(p.id)}
              titre={p.nom}
              prix={`Prix public ${formaterEuros(p.prixVenteTtc)} €`}
            >
              En stock : {p.stock}
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
            prix={aUnAtelier ? "Matière déjà en stock · salaires en fin de mois" : undefined}
          >
            {aUnAtelier
              ? "Tu utilises ta matière en stock. La main-d'œuvre, ce sont tes salaires."
              : "Pas encore d'atelier : loue-en un plus bas."}
          </Choix>
          {faconniers.map((f) => {
            const p = prixChez(f.id);
            const estGrossiste = f.id === ID_GROSSISTE_LOCAL;
            return (
              <Choix
                key={f.id}
                actif={lieu === f.id}
                onClick={() => setLieu(f.id)}
                titre={f.nom}
                desactive={p === null}
                prix={
                  p === null
                    ? "Ne fait pas ce produit"
                    : `${formaterEuros(p)} € la pièce${estGrossiste ? " (estimation)" : ""} · ${
                        estGrossiste ? `environ ${delaiGrossisteMinutes} min` : texteDelai(f.delai_mois, params)
                      }`
                }
              >
                {estGrossiste ? "Livraison express, plus cher, sans minimum." : `${f.pays} · minimum ${f.minimum_commande} pièces`}
              </Choix>
            );
          })}
        </div>
      </div>

      <Curseur
        libelle="Quantité (pièces)"
        valeur={quantiteBornee}
        min={bornes.min}
        max={bornes.max}
        onChange={setQuantiteN}
        aide={
          lieu === "atelier"
            ? rienPossible
              ? "Aucune matière en stock pour ce produit : commande-la d'abord (écran Achats)."
              : `De 1 à ${bornes.max} pièces (ce que permet ta matière en stock).`
            : rienPossible
              ? `Ta trésorerie ne couvre pas le minimum de ${bornes.min} pièces.`
              : `De ${bornes.min} (minimum${faconnier && !grossiste ? ` chez ${faconnier.nom}` : ""}) à ${bornes.max} (ce que ta trésorerie peut payer).`
        }
      />

      {apercu && apercu.mode === "faconnier" && apercu.r.ok && (
        <div className="flex flex-col gap-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <Resultat libelle="Coût total" valeur={`${formaterEuros(apercu.r.total)} €`} />
            <Resultat
              libelle="Coût complet par pièce"
              valeur={`${formaterEuros(apercu.r.coutParPiece)} €`}
              detail={grossiste ? "tout compris chez le grossiste" : `dont façon ${formaterEuros(apercu.r.prixParPiece)} € ; matière et fournitures en plus`}
            />
            <Resultat
              libelle="Livraison"
              valeur={grossiste ? `${delaiGrossisteMinutes} min` : `${faconnier?.delai_mois ?? 0} mois`}
              detail={grossiste ? "environ, en temps réel" : texteDelai(faconnier?.delai_mois ?? 0, params)}
            />
          </div>
          <div className="grid gap-x-6 sm:grid-cols-2">
            <div>
              {apercu.r.margeParPiece !== null && (
                <Ligne libelle="Marge par pièce vendue en ligne" ton={apercu.r.margeParPiece < 0 ? "critique" : "bon"}>
                  {formaterEuros(apercu.r.margeParPiece)} €
                </Ligne>
              )}
              <Ligne libelle="Sortie de trésorerie aujourd'hui">0,00 €</Ligne>
            </div>
            <div>
              <Ligne libelle="Dette envers le façonnier à la livraison">{formaterEuros(apercu.r.total)} €</Ligne>
            </div>
          </div>
          {grossiste && (
            <Note>Prix estimé : le serveur le recalcule et le confirme à la commande.</Note>
          )}
          <Note>
            Rien n&apos;est écrit maintenant. À la livraison, le moteur entrera les pièces en stock et notera la facture du
            façonnier :
          </Note>
          <EcritureComptable libelle={`Livraison : ${produit?.nom ?? ""}`} etiquette="à la livraison" lignes={apercu.r.ecritureLivraison} />
        </div>
      )}

      {apercu && apercu.mode === "atelier" && apercu.r.ok && (
        <div className="flex flex-col gap-3">
          <div>
            <Ligne libelle={`Matière utilisée (${produit?.fabrication?.nomMatiere.toLowerCase() ?? "stock"}, chutes comprises)`}>
              {formaterEuros(apercu.r.valeurMatiere)} €
            </Ligne>
            <Ligne libelle="Fournitures payées comptant">{formaterEuros(apercu.r.valeurFournitures)} €</Ligne>
            {apercu.r.piecesCouvertes < quantiteBornee && (
              <Ligne libelle="Pièces sans matière" ton="critique">
                {quantiteBornee - apercu.r.piecesCouvertes}
              </Ligne>
            )}
          </div>
          <Note>
            Rien n&apos;est écrit maintenant. Au fil du mois, l&apos;atelier fabrique selon la production mensuelle réglée
            dans Vente et prix et la capacité de tes couturiers ; le moteur passe alors :
          </Note>
          <EcritureComptable libelle="Fabrication en atelier" etiquette="au fil du mois" lignes={apercu.r.ecritureFabrication} />
        </div>
      )}

      {apercu && !apercu.r.ok && <Refus>{apercu.r.message}</Refus>}
      {erreur && <BlocErreur erreur={erreur} />}
      {confirmation && <Succes>{confirmation}</Succes>}

      <div className="flex justify-end">
        <Bouton type="submit" variante="principal" disabled={enCours || rienPossible || !apercu?.r.ok}>
          {enCours ? "Lancement…" : grossiste ? "Commander au grossiste" : "Lancer la production"}
        </Bouton>
      </div>
    </form>
  );
}
