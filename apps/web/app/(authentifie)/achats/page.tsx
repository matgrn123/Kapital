import { creerClientServeur } from "../../../lib/supabase/server";
import { formaterEuros, formaterDateHeure } from "../../../lib/formatage";
import { FormulaireCommande } from "./FormulaireCommande";

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

type Commande = {
  id: string;
  supplier_id: string;
  material_id: string;
  quantite: number;
  prix_unitaire_centimes: number;
  instant_commande: string;
  instant_livraison_prevue: string;
  statut: string;
};

export default async function PageAchats() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase.from("companies").select("id").limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const [{ data: fournisseurs }, { data: catalogue }, { data: commandes }, { data: materials }] =
    await Promise.all([
      supabase
        .from("suppliers")
        .select("id, nom, pays, delai_mois, minimum_commande")
        .order("nom"),
      supabase.from("supplier_catalogue").select("supplier_id, material_id, prix_centimes"),
      supabase
        .from("purchase_orders")
        .select("id, supplier_id, material_id, quantite, prix_unitaire_centimes, instant_commande, instant_livraison_prevue, statut")
        .eq("company_id", entreprise.id)
        .order("instant_livraison_prevue", { ascending: true }),
      supabase.from("materials").select("id, nom"),
    ]);

  const fournisseursTab = (fournisseurs ?? []) as Fournisseur[];
  const catalogueTab = (catalogue ?? []) as LigneCatalogue[];
  const commandesTab = (commandes ?? []) as Commande[];
  const materialsMap = new Map<string, string>(
    (materials ?? []).map((m) => [m.id as string, m.nom as string]),
  );

  const enCours = commandesTab.filter((c) => c.statut === "en_cours");

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="border-b border-[color:var(--color-g-200)] pb-6">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Achats
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Matières et fournisseurs</h1>
        <p className="mt-1 text-sm text-[color:var(--color-g-500)]">
          Le prix est figé à la commande, pas à la livraison. Le délai se compte
          en jours réels (1 jour = 1 mois de jeu).
        </p>
      </header>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">
          Commandes en cours ({enCours.length})
        </h2>
        {enCours.length === 0 ? (
          <p className="rounded-md border border-dashed border-[color:var(--color-g-300)] px-5 py-6 text-center text-sm text-[color:var(--color-g-500)]">
            Pas de commande en cours.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-[color:var(--color-g-200)]">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--color-g-100)] text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Fournisseur</th>
                  <th className="px-4 py-2 text-left font-medium">Matière</th>
                  <th className="px-4 py-2 text-right font-medium">Quantité</th>
                  <th className="px-4 py-2 text-right font-medium">Prix unit.</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 text-left font-medium">Livraison prévue</th>
                </tr>
              </thead>
              <tbody>
                {enCours.map((c) => {
                  const f = fournisseursTab.find((x) => x.id === c.supplier_id);
                  return (
                    <tr key={c.id} className="border-t border-[color:var(--color-g-200)]">
                      <td className="px-4 py-2">{f?.nom ?? c.supplier_id}</td>
                      <td className="px-4 py-2">{materialsMap.get(c.material_id) ?? c.material_id}</td>
                      <td className="chiffre px-4 py-2 text-right">{c.quantite}</td>
                      <td className="chiffre px-4 py-2 text-right">{formaterEuros(c.prix_unitaire_centimes)} €</td>
                      <td className="chiffre px-4 py-2 text-right">
                        {formaterEuros(c.prix_unitaire_centimes * c.quantite)} €
                      </td>
                      <td className="chiffre px-4 py-2 text-xs text-[color:var(--color-g-700)]">
                        {formaterDateHeure(c.instant_livraison_prevue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">
          Passer une commande
        </h2>
        <FormulaireCommande
          fournisseurs={fournisseursTab}
          catalogue={catalogueTab}
          materials={Array.from(materialsMap.entries()).map(([id, nom]) => ({ id, nom }))}
        />
      </section>
    </div>
  );
}
