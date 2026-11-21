"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { creerClientNavigateur } from "../../../lib/supabase/client";

type Ligne = {
  id: string;
  product_id: string;
  qualite_visee: number;
  prix_vente_directe_centimes: number;
  prix_revendeur_centimes: number;
  production_mensuelle_cible: number;
};

export function FormulairePrix({ lignePrix }: { lignePrix: Ligne }) {
  const router = useRouter();
  const [directe, setDirecte] = useState((lignePrix.prix_vente_directe_centimes / 100).toString());
  const [revendeur, setRevendeur] = useState((lignePrix.prix_revendeur_centimes / 100).toString());
  const [production, setProduction] = useState(lignePrix.production_mensuelle_cible.toString());
  const [qualite, setQualite] = useState(lignePrix.qualite_visee.toString());
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    const pDirecte = Math.round(parseFloat(directe) * 100);
    const pRevendeur = Math.round(parseFloat(revendeur) * 100);
    const prod = parseInt(production, 10);
    const q = parseInt(qualite, 10);
    if (![pDirecte, pRevendeur, prod, q].every((v) => Number.isFinite(v))) {
      setErreur("Valeurs invalides.");
      return;
    }
    if (pDirecte <= 0 || pRevendeur <= 0) {
      setErreur("Les prix doivent être strictement positifs.");
      return;
    }
    setEnCours(true);
    try {
      const supabase = creerClientNavigateur();
      const { error } = await supabase
        .from("company_products")
        .update({
          prix_vente_directe_centimes: pDirecte,
          prix_revendeur_centimes: pRevendeur,
          production_mensuelle_cible: prod,
          qualite_visee: q,
        })
        .eq("id", lignePrix.id);
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
    <form onSubmit={enregistrer} className="grid grid-cols-4 gap-4">
      <ChampChiffre label="Prix vente directe (€ TTC)" value={directe} setValue={setDirecte} />
      <ChampChiffre label="Prix revendeur (€ HT)" value={revendeur} setValue={setRevendeur} />
      <ChampChiffre label="Production mensuelle" value={production} setValue={setProduction} />
      <ChampChiffre label="Qualité visée (0-100)" value={qualite} setValue={setQualite} />
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
          {enCours ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

function ChampChiffre({
  label,
  value,
  setValue,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="chiffre w-full rounded-md border border-[color:var(--color-g-300)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-noir)]"
      />
    </label>
  );
}

const PRIX_DEFAUT_PAR_GAMME: Record<string, { tt: number; gros: number }> = {
  entree: { tt: 2000, gros: 1000 },
  milieu: { tt: 6000, gros: 3000 },
  haut: { tt: 15000, gros: 7500 },
};

export function AjouterProduitBouton({
  companyId,
  productId,
}: {
  companyId: string;
  productId: string;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ajouter() {
    setErreur(null);
    setEnCours(true);
    try {
      const supabase = creerClientNavigateur();
      const { data: ent } = await supabase
        .from("companies")
        .select("gamme")
        .eq("id", companyId)
        .maybeSingle();
      const defaut = PRIX_DEFAUT_PAR_GAMME[ent?.gamme ?? "milieu"]!;
      const { error } = await supabase.from("company_products").insert({
        company_id: companyId,
        product_id: productId,
        qualite_visee: 60,
        prix_vente_directe_centimes: defaut.tt,
        prix_revendeur_centimes: defaut.gros,
        production_mensuelle_cible: 100,
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
    <div className="text-right">
      <button
        onClick={ajouter}
        disabled={enCours}
        className="rounded-md border border-[color:var(--color-noir)] px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--color-g-100)] disabled:opacity-50"
      >
        {enCours ? "Ajout..." : "Ajouter au catalogue"}
      </button>
      {erreur && <p className="mt-1 text-xs text-[color:var(--color-erreur)]">{erreur}</p>}
    </div>
  );
}
