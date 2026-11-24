"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Entreprise = { id: string; nom: string; gamme: string };
type Produit = { id: string; nom: string };

export function BoutonApprovisionnerAdmin({
  entreprises,
  produits,
}: {
  entreprises: readonly Entreprise[];
  produits: readonly Produit[];
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(entreprises[0]?.id ?? "");
  const [productId, setProductId] = useState(produits[0]?.id ?? "");
  const [quantite, setQuantite] = useState("100");
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function approvisionner() {
    setErreur(null);
    setResultat(null);
    const n = parseInt(quantite, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setErreur("Quantité invalide.");
      return;
    }
    setEnCours(true);
    try {
      const reponse = await fetch("/api/admin/produits/approvisionner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId, productId, quantite: n }),
      });
      const data = (await reponse.json()) as {
        error?: string;
        quantite_apres?: number;
      };
      if (data.error) {
        setErreur(data.error);
        return;
      }
      setResultat(`Stock mis à jour : ${data.quantite_apres} pièces.`);
      router.refresh();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <label className="block text-xs">
          <span className="block text-[color:var(--color-g-500)]">Entreprise</span>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="mt-1 w-full rounded-md border border-[color:var(--color-g-300)] px-2 py-1.5 text-sm"
          >
            {entreprises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom} ({e.gamme})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="block text-[color:var(--color-g-500)]">Produit</span>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="mt-1 w-full rounded-md border border-[color:var(--color-g-300)] px-2 py-1.5 text-sm"
          >
            {produits.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="block text-[color:var(--color-g-500)]">Quantité</span>
          <input
            type="text"
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            className="chiffre mt-1 w-full rounded-md border border-[color:var(--color-g-300)] px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={approvisionner}
        disabled={enCours || !companyId || !productId}
        className="rounded-md border border-[color:var(--color-g-300)] px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--color-g-100)] disabled:opacity-50"
      >
        {enCours ? "Approvisionnement..." : "Approvisionner"}
      </button>
      {resultat && <p className="text-xs text-[color:var(--color-g-700)]">{resultat}</p>}
      {erreur && <p className="text-xs text-[color:var(--color-erreur)]">{erreur}</p>}
    </div>
  );
}
