import { creerClientServeur } from "../../../lib/supabase/server";
import { formaterEuros, formaterDateHeure } from "../../../lib/formatage";

type LigneMarche = {
  company_id: string;
  nom: string;
  gamme: string;
  pseudo: string | null;
  product_id: string;
  product_nom: string;
  prix_vente_directe_centimes: number;
  prix_revendeur_centimes: number;
  notoriete: number | null;
  desirabilite: number | null;
  quantite_pieces: number;
};

type VenteRecente = {
  id: string;
  cree_le: string;
  libelle: string;
  montant_centimes: number;
  company_id: string;
  nom_entreprise: string;
};

const LIBELLE_GAMME: Record<string, string> = {
  entree: "Entrée",
  milieu: "Milieu",
  haut: "Haut",
};

const LIBELLE_PRODUIT: Record<string, string> = {
  prod_tshirt: "T-shirt",
  prod_chemise: "Chemise",
  prod_sac_toile: "Sac en toile",
};

export default async function PageMarche() {
  const supabase = await creerClientServeur();

  const { data: monEntreprise } = await supabase
    .from("companies")
    .select("id, gamme")
    .limit(1);
  const entreprise = monEntreprise?.[0];
  if (!entreprise) return null;

  // Toutes les offres de la gamme du joueur
  const { data: offres } = await supabase
    .from("companies")
    .select(`
      id,
      nom,
      gamme,
      owner_profile_id,
      company_products(product_id, prix_vente_directe_centimes, prix_revendeur_centimes),
      brand_state(notoriete, desirabilite),
      product_stock(product_id, quantite_pieces)
    `)
    .eq("gamme", entreprise.gamme)
    .eq("statut", "active");

  const { data: produitsRef } = await supabase
    .from("products")
    .select("id, nom");
  const nomProduit = new Map<string, string>(
    ((produitsRef ?? []) as Array<{ id: string; nom: string }>).map((p) => [p.id, p.nom]),
  );

  type OffreDb = {
    id: string;
    nom: string;
    gamme: string;
    owner_profile_id: string | null;
    company_products: Array<{
      product_id: string;
      prix_vente_directe_centimes: number;
      prix_revendeur_centimes: number;
    }>;
    brand_state: Array<{ notoriete: number; desirabilite: number }>;
    product_stock: Array<{ product_id: string; quantite_pieces: number }>;
  };
  const lignes: LigneMarche[] = [];
  for (const o of (offres ?? []) as unknown as OffreDb[]) {
    const stockPar = new Map(
      o.product_stock.map((s) => [s.product_id, s.quantite_pieces]),
    );
    const marque = o.brand_state[0];
    for (const cp of o.company_products) {
      lignes.push({
        company_id: o.id,
        nom: o.nom,
        gamme: o.gamme,
        pseudo: o.owner_profile_id ? "Joueur" : null,
        product_id: cp.product_id,
        product_nom: nomProduit.get(cp.product_id) ?? cp.product_id,
        prix_vente_directe_centimes: cp.prix_vente_directe_centimes,
        prix_revendeur_centimes: cp.prix_revendeur_centimes,
        notoriete: marque?.notoriete ?? null,
        desirabilite: marque?.desirabilite ?? null,
        quantite_pieces: stockPar.get(cp.product_id) ?? 0,
      });
    }
  }

  // Ventes récentes : on prend les écritures 707 crédit (CA HT) des 50 dernières
  const { data: ecritures } = await supabase
    .from("ledger_entries")
    .select("id, cree_le, libelle, montant_centimes, company_id")
    .eq("compte", "707")
    .eq("sens", "credit")
    .order("cree_le", { ascending: false })
    .limit(50);

  const companyIds = Array.from(
    new Set(((ecritures ?? []) as Array<{ company_id: string }>).map((e) => e.company_id)),
  );
  const { data: noms } = await supabase
    .from("companies")
    .select("id, nom")
    .in("id", companyIds);
  const nomPar = new Map(
    ((noms ?? []) as Array<{ id: string; nom: string }>).map((n) => [n.id, n.nom]),
  );
  const ventesRecentes: VenteRecente[] = ((ecritures ?? []) as Array<{
    id: string;
    cree_le: string;
    libelle: string;
    montant_centimes: number;
    company_id: string;
  }>).map((e) => ({
    ...e,
    nom_entreprise: nomPar.get(e.company_id) ?? "—",
  }));

  // Groupage par produit, tri par prix
  const parProduit = new Map<string, LigneMarche[]>();
  for (const l of lignes) {
    if (!parProduit.has(l.product_id)) parProduit.set(l.product_id, []);
    parProduit.get(l.product_id)!.push(l);
  }
  for (const [, arr] of parProduit) {
    arr.sort((a, b) => a.prix_vente_directe_centimes - b.prix_vente_directe_centimes);
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="border-b border-[color:var(--color-g-200)] pb-6">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Monde
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Marché</h1>
        <p className="mt-2 text-sm text-[color:var(--color-g-500)]">
          Les concurrents de votre gamme ({LIBELLE_GAMME[entreprise.gamme] ?? entreprise.gamme}) et leurs
          prix, triés du moins cher au plus cher. Plus votre prix est bas pour une
          notoriété donnée, plus vous captez de ventes.
        </p>
      </header>

      <section className="mt-8 space-y-8">
        {[...parProduit.entries()].map(([productId, offres]) => (
          <article
            key={productId}
            className="rounded-md border border-[color:var(--color-g-200)]"
          >
            <header className="border-b border-[color:var(--color-g-200)] px-5 py-3">
              <h2 className="text-sm font-semibold">
                {LIBELLE_PRODUIT[productId] ?? productId}
              </h2>
              <p className="text-xs text-[color:var(--color-g-500)]">
                {offres.length} offres sur votre gamme
              </p>
            </header>
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--color-g-100)] text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
                <tr>
                  <th className="px-5 py-2 text-left font-medium">Marque</th>
                  <th className="px-5 py-2 text-right font-medium">Prix direct TTC</th>
                  <th className="px-5 py-2 text-right font-medium">Prix revendeur HT</th>
                  <th className="px-5 py-2 text-right font-medium">Notoriété</th>
                  <th className="px-5 py-2 text-right font-medium">Désirabilité</th>
                  <th className="px-5 py-2 text-right font-medium">Stock</th>
                </tr>
              </thead>
              <tbody>
                {offres.map((o) => {
                  const estMoi = o.company_id === entreprise.id;
                  return (
                    <tr
                      key={`${o.company_id}-${o.product_id}`}
                      className={`border-t border-[color:var(--color-g-200)] ${
                        estMoi ? "bg-[color:var(--color-g-100)] font-medium" : ""
                      }`}
                    >
                      <td className="px-5 py-2">
                        {o.nom}
                        {estMoi && <span className="ml-2 text-xs text-[color:var(--color-g-500)]">(vous)</span>}
                      </td>
                      <td className="chiffre px-5 py-2 text-right">
                        {formaterEuros(o.prix_vente_directe_centimes)} €
                      </td>
                      <td className="chiffre px-5 py-2 text-right text-[color:var(--color-g-500)]">
                        {formaterEuros(o.prix_revendeur_centimes)} €
                      </td>
                      <td className="chiffre px-5 py-2 text-right">
                        {o.notoriete !== null ? Math.round(o.notoriete) : "—"}
                      </td>
                      <td className="chiffre px-5 py-2 text-right">
                        {o.desirabilite !== null ? Math.round(o.desirabilite) : "—"}
                      </td>
                      <td className="chiffre px-5 py-2 text-right">
                        {o.quantite_pieces}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </article>
        ))}
      </section>

      <section className="mt-10">
        <header className="border-b border-[color:var(--color-g-200)] pb-3">
          <h2 className="text-lg font-semibold">Ventes récentes (toutes gammes)</h2>
          <p className="text-xs text-[color:var(--color-g-500)]">
            Les 50 dernières ventes enregistrées dans le monde.
          </p>
        </header>
        {ventesRecentes.length === 0 ? (
          <p className="mt-6 text-sm text-[color:var(--color-g-500)]">
            Aucune vente encore. Avancez le monde pour en générer.
          </p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead className="bg-[color:var(--color-g-100)] text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Horodatage</th>
                <th className="px-5 py-2 text-left font-medium">Entreprise</th>
                <th className="px-5 py-2 text-left font-medium">Vente</th>
                <th className="px-5 py-2 text-right font-medium">Montant HT</th>
              </tr>
            </thead>
            <tbody>
              {ventesRecentes.map((v) => (
                <tr key={v.id} className="border-t border-[color:var(--color-g-200)]">
                  <td className="px-5 py-2 text-xs text-[color:var(--color-g-500)]">
                    {formaterDateHeure(v.cree_le)}
                  </td>
                  <td className="px-5 py-2">{v.nom_entreprise}</td>
                  <td className="px-5 py-2 text-[color:var(--color-g-700)]">{v.libelle}</td>
                  <td className="chiffre px-5 py-2 text-right">
                    {formaterEuros(v.montant_centimes)} €
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
