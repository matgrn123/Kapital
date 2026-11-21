"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { creerClientNavigateur } from "../../../lib/supabase/client";
import { formaterEuros } from "../../../lib/formatage";

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

export function LouerAtelierBouton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function louer() {
    setErreur(null);
    setEnCours(true);
    try {
      const supabase = creerClientNavigateur();
      const { error } = await supabase.from("workshops").insert({
        company_id: companyId,
        surface_m2: 50,
        loyer_mensuel_centimes: 100_000,
        nombre_machines: 2,
      });
      if (error) {
        setErreur(error.message);
        return;
      }
      router.refresh();
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
      {erreur && <p className="mt-1 text-xs text-[color:var(--color-erreur)]">{erreur}</p>}
    </div>
  );
}

export function FormulaireProduction({
  companyId,
  aUnAtelier,
  faconniers,
  catalogueFaconnier,
  produits,
}: {
  companyId: string;
  aUnAtelier: boolean;
  faconniers: readonly Faconnier[];
  catalogueFaconnier: readonly LigneCatalogueFac[];
  produits: readonly { id: string; nom: string }[];
}) {
  const router = useRouter();
  const [lieu, setLieu] = useState<"atelier" | "faconnier">(aUnAtelier ? "atelier" : "faconnier");
  const [faconnierId, setFaconnierId] = useState<string>(faconniers[0]?.id ?? "");

  const prodsPourLieu = useMemo(() => {
    if (lieu === "atelier") return produits;
    const ids = new Set(catalogueFaconnier.filter((l) => l.faconnier_id === faconnierId).map((l) => l.product_id));
    return produits.filter((p) => ids.has(p.id));
  }, [lieu, faconnierId, produits, catalogueFaconnier]);

  const [productId, setProductId] = useState<string>(prodsPourLieu[0]?.id ?? "");
  const [quantite, setQuantite] = useState("100");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const faconnier = faconniers.find((f) => f.id === faconnierId);
  const ligne = catalogueFaconnier.find(
    (l) => l.faconnier_id === faconnierId && l.product_id === productId,
  );
  const quantiteN = parseInt(quantite, 10);

  async function lancer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!Number.isFinite(quantiteN) || quantiteN <= 0) {
      setErreur("Quantité invalide.");
      return;
    }
    const delaiMois = lieu === "atelier" ? 1 : (faconnier?.delai_mois ?? 2);
    if (lieu === "faconnier" && (!faconnier || !ligne)) {
      setErreur("Façonnier/produit invalide.");
      return;
    }
    if (lieu === "faconnier" && faconnier && quantiteN < faconnier.minimum_commande) {
      setErreur(`Minimum ${faconnier.minimum_commande}.`);
      return;
    }
    setEnCours(true);
    try {
      const supabase = creerClientNavigateur();
      const maintenant = new Date();
      const livraison = new Date(maintenant.getTime() + delaiMois * HEURES_PAR_MOIS_JEU * 3600 * 1000);
      const { error } = await supabase.from("production_orders").insert({
        company_id: companyId,
        product_id: productId,
        quantite: quantiteN,
        lieu_type: lieu,
        faconnier_id: lieu === "faconnier" ? faconnierId : null,
        prix_facon_par_piece_centimes: lieu === "faconnier" ? ligne!.prix_par_piece_centimes : null,
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
                  {f.nom} ({f.pays}, délai {f.delai_mois} mois, min {f.minimum_commande})
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
            value={productId}
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

        {lieu === "faconnier" && ligne && Number.isFinite(quantiteN) && quantiteN > 0 && (
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

        {erreur && (
          <p role="alert" className="col-span-4 text-sm text-[color:var(--color-erreur)]">
            {erreur}
          </p>
        )}

        <div className="col-span-4 flex justify-end">
          <button
            type="submit"
            disabled={enCours}
            className="rounded-md bg-[color:var(--color-noir)] px-4 py-2 text-sm font-medium text-[color:var(--color-blanc)] transition hover:bg-[color:var(--color-g-900)] disabled:opacity-50"
          >
            {enCours ? "Lancement..." : "Lancer la production"}
          </button>
        </div>
      </div>
    </form>
  );
}
