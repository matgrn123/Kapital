import { creerClientServeur } from "../../../lib/supabase/server";
import { formaterEuros } from "../../../lib/formatage";
import { AjouterProduitBouton, FormulairePrix } from "./FormulairePrix";
import { BoutonApprovisionner } from "./BoutonApprovisionner";

type Produit = {
  id: string;
  nom: string;
  type: string;
  matiere_id: string;
  consommation_par_piece: number;
  fournitures_par_piece_centimes: number;
  temps_standard_minutes: number;
};

type CompanyProduit = {
  id: string;
  product_id: string;
  qualite_visee: number;
  prix_vente_directe_centimes: number;
  prix_revendeur_centimes: number;
  production_mensuelle_cible: number;
};

export default async function PageProduits() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase
    .from("companies")
    .select("id, gamme")
    .limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const { data: produitsRef } = await supabase
    .from("products")
    .select("id, nom, type, matiere_id, consommation_par_piece, fournitures_par_piece_centimes, temps_standard_minutes")
    .order("nom");

  const { data: catalogue } = await supabase
    .from("company_products")
    .select("id, product_id, qualite_visee, prix_vente_directe_centimes, prix_revendeur_centimes, production_mensuelle_cible")
    .eq("company_id", entreprise.id);

  const { data: stocks } = await supabase
    .from("product_stock")
    .select("product_id, quantite_pieces")
    .eq("company_id", entreprise.id);

  const produitsRefTab = (produitsRef ?? []) as Produit[];
  const cataMap = new Map<string, CompanyProduit>(
    ((catalogue ?? []) as CompanyProduit[]).map((c) => [c.product_id, c]),
  );
  const stockMap = new Map<string, number>(
    ((stocks ?? []) as Array<{ product_id: string; quantite_pieces: number }>).map(
      (s) => [s.product_id, s.quantite_pieces],
    ),
  );

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="border-b border-[color:var(--color-g-200)] pb-6">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Catalogue
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Produits et prix</h1>
        <p className="mt-1 text-sm text-[color:var(--color-g-500)]">
          Chaque produit a deux prix : vente directe TTC (prix public) et prix
          de gros HT (pour les revendeurs).
        </p>
      </header>

      <div className="mt-10 space-y-4">
        {produitsRefTab.map((p) => {
          const ligne = cataMap.get(p.id);
          return (
            <article
              key={p.id}
              className="rounded-md border border-[color:var(--color-g-200)]"
            >
              <header className="flex items-start justify-between border-b border-[color:var(--color-g-200)] px-5 py-3">
                <div>
                  <h2 className="text-sm font-semibold">{p.nom}</h2>
                  <p className="text-xs text-[color:var(--color-g-500)]">
                    <span className="chiffre">{p.consommation_par_piece}</span>{" "}
                    m de {p.matiere_id.replace("mat_", "")} ·{" "}
                    <span className="chiffre">{p.temps_standard_minutes}</span>{" "}
                    min atelier · fournitures{" "}
                    <span className="chiffre">{formaterEuros(p.fournitures_par_piece_centimes)}</span>{" "}
                    €
                  </p>
                </div>
                {!ligne && (
                  <AjouterProduitBouton companyId={entreprise.id} productId={p.id} />
                )}
              </header>

              {ligne ? (
                <div className="px-5 py-4 space-y-4">
                  <div className="flex items-center justify-between rounded-md bg-[color:var(--color-g-100)] px-4 py-2 text-xs">
                    <span className="text-[color:var(--color-g-500)]">Stock disponible</span>
                    <span className="chiffre font-medium">
                      {stockMap.get(p.id) ?? 0} pièces
                    </span>
                    <BoutonApprovisionner productId={p.id} />
                  </div>
                  <FormulairePrix lignePrix={ligne} />
                </div>
              ) : (
                <p className="px-5 py-6 text-center text-sm text-[color:var(--color-g-500)]">
                  Pas encore à votre catalogue.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
