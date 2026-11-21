"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { creerClientNavigateur } from "../../../lib/supabase/client";
import { formaterEuros } from "../../../lib/formatage";

type Fournisseur = {
  id: string;
  nom: string;
  pays: string;
  delai_mois: number;
  minimum_commande: number;
};

type LigneCatalogue = {
  supplier_id: string;
  material_id: string;
  prix_centimes: number;
};

const HEURES_PAR_MOIS_JEU = 24;

export function FormulaireCommande({
  companyId,
  fournisseurs,
  catalogue,
  materials,
}: {
  companyId: string;
  fournisseurs: readonly Fournisseur[];
  catalogue: readonly LigneCatalogue[];
  materials: readonly { id: string; nom: string }[];
}) {
  const router = useRouter();
  const [fournisseurId, setFournisseurId] = useState<string>(fournisseurs[0]?.id ?? "");
  const fournisseur = fournisseurs.find((f) => f.id === fournisseurId);

  const matieresPourFourn = useMemo(
    () => catalogue.filter((l) => l.supplier_id === fournisseurId),
    [fournisseurId, catalogue],
  );

  const [materialId, setMaterialId] = useState<string>(matieresPourFourn[0]?.material_id ?? "");
  const [quantite, setQuantite] = useState("100");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const ligne = catalogue.find(
    (l) => l.supplier_id === fournisseurId && l.material_id === materialId,
  );
  const quantiteN = parseFloat(quantite);
  const totalCentimes = ligne ? Math.round(ligne.prix_centimes * quantiteN) : 0;

  async function commander(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!fournisseur || !ligne) {
      setErreur("Fournisseur ou matière non valide.");
      return;
    }
    if (!Number.isFinite(quantiteN) || quantiteN <= 0) {
      setErreur("Quantité invalide.");
      return;
    }
    if (quantiteN < fournisseur.minimum_commande) {
      setErreur(`Minimum du fournisseur : ${fournisseur.minimum_commande}.`);
      return;
    }
    setEnCours(true);
    try {
      const supabase = creerClientNavigateur();
      const maintenant = new Date();
      const livraison = new Date(
        maintenant.getTime() + fournisseur.delai_mois * HEURES_PAR_MOIS_JEU * 3600 * 1000,
      );
      const { error } = await supabase.from("purchase_orders").insert({
        company_id: companyId,
        supplier_id: fournisseur.id,
        material_id: materialId,
        quantite: quantiteN,
        prix_unitaire_centimes: ligne.prix_centimes,
        instant_commande: maintenant.toISOString(),
        instant_livraison_prevue: livraison.toISOString(),
      });
      if (error) {
        setErreur(error.message);
        return;
      }
      setQuantite("100");
      router.refresh();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={commander} className="grid grid-cols-5 gap-4 rounded-md border border-[color:var(--color-g-200)] p-5">
      <div className="col-span-2 space-y-1.5">
        <span className="block text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Fournisseur
        </span>
        <select
          value={fournisseurId}
          onChange={(e) => {
            setFournisseurId(e.target.value);
            const prem = catalogue.find((l) => l.supplier_id === e.target.value);
            if (prem) setMaterialId(prem.material_id);
          }}
          className="w-full rounded-md border border-[color:var(--color-g-300)] px-3 py-2 text-sm"
        >
          {fournisseurs.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nom} ({f.pays}, délai {f.delai_mois} mois, min {f.minimum_commande})
            </option>
          ))}
        </select>
      </div>

      <div className="col-span-2 space-y-1.5">
        <span className="block text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Matière
        </span>
        <select
          value={materialId}
          onChange={(e) => setMaterialId(e.target.value)}
          className="w-full rounded-md border border-[color:var(--color-g-300)] px-3 py-2 text-sm"
        >
          {matieresPourFourn.map((l) => (
            <option key={l.material_id} value={l.material_id}>
              {materials.find((m) => m.id === l.material_id)?.nom ?? l.material_id}
              {" — "}
              {formaterEuros(l.prix_centimes)} €
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

      {ligne && Number.isFinite(quantiteN) && quantiteN > 0 && (
        <p className="col-span-5 chiffre text-xs text-[color:var(--color-g-500)]">
          Total figé à la commande : {formaterEuros(totalCentimes)} €
          {fournisseur && (
            <span>
              {" "}
              — livraison dans {fournisseur.delai_mois * HEURES_PAR_MOIS_JEU}h
            </span>
          )}
        </p>
      )}

      {erreur && (
        <p role="alert" className="col-span-5 text-sm text-[color:var(--color-erreur)]">
          {erreur}
        </p>
      )}

      <div className="col-span-5 flex justify-end">
        <button
          type="submit"
          disabled={enCours}
          className="rounded-md bg-[color:var(--color-noir)] px-4 py-2 text-sm font-medium text-[color:var(--color-blanc)] transition hover:bg-[color:var(--color-g-900)] disabled:opacity-50"
        >
          {enCours ? "Envoi..." : "Passer commande"}
        </button>
      </div>
    </form>
  );
}
