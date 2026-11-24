"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formaterEuros } from "../../../lib/formatage";
import { lireErreur, MESSAGE_RESEAU, type MessageErreur } from "./erreurs";

const ID_GROSSISTE_LOCAL = "gros_local";

export type ProduitGrossiste = {
  id: string;
  nom: string;
  /** Estimation serveur du prix de la pièce (null si non calculable) : le prix définitif est confirmé à la commande. */
  prixEstimeCentimes: number | null;
};

type ResultatGrossiste = { quantite: number; prixParPieceCentimes: number; totalCentimes: number };

function BlocErreur({ erreur }: { erreur: MessageErreur }) {
  return (
    <div role="alert" className="text-[color:var(--color-erreur)]">
      <p>{erreur.texte}</p>
      {erreur.conditions.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs">
          {erreur.conditions.map((c) => (
            <li key={c} className="chiffre">
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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

const HEURES_PAR_MOIS_JEU = 24;

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
    <div>
      <button
        onClick={louer}
        disabled={enCours}
        className="rounded-md bg-[color:var(--color-noir)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-blanc)] hover:bg-[color:var(--color-g-900)] disabled:opacity-50"
      >
        {enCours ? "Location..." : "Louer un petit atelier"}
      </button>
      {erreur && (
        <div className="mt-1 text-xs">
          <BlocErreur erreur={erreur} />
        </div>
      )}
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
}: {
  aUnAtelier: boolean;
  faconniers: readonly Faconnier[];
  catalogueFaconnier: readonly LigneCatalogueFac[];
  produits: readonly { id: string; nom: string }[];
  produitsGrossiste: readonly ProduitGrossiste[];
  delaiGrossisteMinutes: number;
}) {
  const router = useRouter();
  const [lieu, setLieu] = useState<"atelier" | "faconnier">(aUnAtelier ? "atelier" : "faconnier");
  const [faconnierId, setFaconnierId] = useState<string>(faconniers[0]?.id ?? "");

  const grossiste = lieu === "faconnier" && faconnierId === ID_GROSSISTE_LOCAL;

  const prodsPourLieu = useMemo(() => {
    if (lieu === "atelier") return produits;
    if (faconnierId === ID_GROSSISTE_LOCAL) return produitsGrossiste;
    const ids = new Set(catalogueFaconnier.filter((l) => l.faconnier_id === faconnierId).map((l) => l.product_id));
    return produits.filter((p) => ids.has(p.id));
  }, [lieu, faconnierId, produits, produitsGrossiste, catalogueFaconnier]);

  const [productId, setProductId] = useState<string>(prodsPourLieu[0]?.id ?? "");
  const [quantite, setQuantite] = useState("100");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<MessageErreur | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // Si le produit choisi n'existe pas dans la liste du lieu, on prend le premier.
  const productIdValide = prodsPourLieu.some((p) => p.id === productId)
    ? productId
    : (prodsPourLieu[0]?.id ?? "");

  const faconnier = faconniers.find((f) => f.id === faconnierId);
  const ligne = catalogueFaconnier.find(
    (l) => l.faconnier_id === faconnierId && l.product_id === productIdValide,
  );
  const produitGrossiste = produitsGrossiste.find((p) => p.id === productIdValide);
  const quantiteN = parseInt(quantite, 10);

  async function lancer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setConfirmation(null);
    const invalide = (texte: string) => setErreur({ texte, conditions: [] });
    if (!Number.isInteger(quantiteN) || quantiteN <= 0) {
      invalide("Quantité invalide : entrez un nombre entier de pièces.");
      return;
    }
    if (!productIdValide) {
      invalide(
        grossiste
          ? "Aucun produit dans votre catalogue : créez d'abord un produit."
          : "Choisissez un produit.",
      );
      return;
    }
    if (lieu === "faconnier" && !grossiste && (!faconnier || !ligne)) {
      invalide("Ce façonnier ne fabrique pas ce produit.");
      return;
    }
    if (lieu === "faconnier" && !grossiste && faconnier && quantiteN < faconnier.minimum_commande) {
      invalide(`Minimum ${faconnier.minimum_commande} pièces chez ce façonnier.`);
      return;
    }
    setEnCours(true);
    try {
      const reponse = grossiste
        ? await fetch("/api/actions/commander-grossiste", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ productId: productIdValide, quantite: quantiteN }),
          })
        : await fetch("/api/actions/lancer-production", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              productId: productIdValide,
              quantite: quantiteN,
              lieuType: lieu,
              faconnierId: lieu === "faconnier" ? faconnierId : undefined,
            }),
          });
      if (!reponse.ok) {
        setErreur(await lireErreur(reponse));
        return;
      }
      if (grossiste) {
        const r = (await reponse.json()) as ResultatGrossiste;
        setConfirmation(
          `Commande passée : ${r.quantite} pièces à ${formaterEuros(r.prixParPieceCentimes)} € la pièce, soit ${formaterEuros(r.totalCentimes)} € au total. Livraison dans environ ${delaiGrossisteMinutes} minutes.`,
        );
      }
      setQuantite("100");
      router.refresh();
    } catch {
      setErreur({ texte: MESSAGE_RESEAU, conditions: [] });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={lancer} className="rounded-md border border-[color:var(--color-g-200)] p-5">
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setLieu("atelier")}
          disabled={!aUnAtelier}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
            lieu === "atelier"
              ? "border-[color:var(--color-noir)] bg-[color:var(--color-noir)] text-[color:var(--color-blanc)]"
              : "border-[color:var(--color-g-300)]"
          }`}
        >
          Atelier propre
        </button>
        <button
          type="button"
          onClick={() => setLieu("faconnier")}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
            lieu === "faconnier"
              ? "border-[color:var(--color-noir)] bg-[color:var(--color-noir)] text-[color:var(--color-blanc)]"
              : "border-[color:var(--color-g-300)]"
          }`}
        >
          Façonnier
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {lieu === "faconnier" && (
          <div className="col-span-2 space-y-1.5">
            <span className="block text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
              Façonnier
            </span>
            <select
              value={faconnierId}
              onChange={(e) => setFaconnierId(e.target.value)}
              className="w-full rounded-md border border-[color:var(--color-g-300)] px-3 py-2 text-sm"
            >
              {faconniers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id === ID_GROSSISTE_LOCAL
                    ? `${f.nom} (${f.pays}, livraison dans environ ${delaiGrossisteMinutes} minutes)`
                    : `${f.nom} (${f.pays}, délai ${f.delai_mois} mois, min ${f.minimum_commande})`}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={`${lieu === "faconnier" ? "col-span-2" : "col-span-3"} space-y-1.5`}>
          <span className="block text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
            Produit
          </span>
          <select
            value={productIdValide}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full rounded-md border border-[color:var(--color-g-300)] px-3 py-2 text-sm"
          >
            {prodsPourLieu.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
            Quantité
          </span>
          <input
            type="text"
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            className="chiffre w-full rounded-md border border-[color:var(--color-g-300)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-noir)]"
          />
        </div>

        {grossiste && (
          <p className="col-span-4 chiffre text-xs text-[color:var(--color-g-500)]">
            {prodsPourLieu.length === 0
              ? "Votre catalogue est vide : créez un produit pour pouvoir commander au grossiste. "
              : produitGrossiste?.prixEstimeCentimes != null &&
                  Number.isInteger(quantiteN) &&
                  quantiteN > 0
                ? `Prix estimé : ${formaterEuros(produitGrossiste.prixEstimeCentimes)} € la pièce, soit ${formaterEuros(produitGrossiste.prixEstimeCentimes * quantiteN)} € pour ${quantiteN} pièces (prix confirmé à la commande). `
                : "Prix par pièce et total confirmés à la commande. "}
            Livraison dans environ {delaiGrossisteMinutes} minutes, plus cher que l'usine.
          </p>
        )}
        {lieu === "faconnier" && !grossiste && ligne && Number.isFinite(quantiteN) && quantiteN > 0 && (
          <p className="col-span-4 chiffre text-xs text-[color:var(--color-g-500)]">
            Façon totale : {formaterEuros(ligne.prix_par_piece_centimes * quantiteN)} € —
            livraison dans {(faconnier?.delai_mois ?? 2) * HEURES_PAR_MOIS_JEU}h
          </p>
        )}
        {lieu === "atelier" && Number.isFinite(quantiteN) && quantiteN > 0 && (
          <p className="col-span-4 chiffre text-xs text-[color:var(--color-g-500)]">
            Produit en atelier sur le prochain mois jeu — livraison dans 24h.
          </p>
        )}

        {confirmation && (
          <p role="status" className="col-span-4 text-sm text-[color:var(--color-g-700)]">
            {confirmation}
          </p>
        )}
        {erreur && (
          <div className="col-span-4 text-sm">
            <BlocErreur erreur={erreur} />
          </div>
        )}

        <div className="col-span-4 flex justify-end">
          <button
            type="submit"
            disabled={enCours}
            className="rounded-md bg-[color:var(--color-noir)] px-4 py-2 text-sm font-medium text-[color:var(--color-blanc)] transition hover:bg-[color:var(--color-g-900)] disabled:opacity-50"
          >
            {enCours ? "Lancement..." : grossiste ? "Commander au grossiste" : "Lancer la production"}
          </button>
        </div>
      </div>
    </form>
  );
}
