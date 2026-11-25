import { creerClientServeur } from "../../../lib/supabase/server";
import { formaterEuros, formaterDateHeure } from "../../../lib/formatage";
import { chargerParametresV1 } from "@kapital/content";
import { centimes, delaiGrossisteMinutes, prixGrossiste } from "@kapital/engine";
import { coutUsineParPiece, ID_GROSSISTE_LOCAL } from "@kapital/server";
import {
  LouerAtelierBouton,
  FormulaireProduction,
  type ProduitGrossiste,
} from "./FormulaireProduction";

type Workshop = {
  surface_m2: number;
  loyer_mensuel_centimes: number;
  nombre_machines: number;
};

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

type ProductionOrder = {
  id: string;
  product_id: string;
  quantite: number;
  lieu_type: string;
  faconnier_id: string | null;
  prix_facon_par_piece_centimes: number | null;
  instant_livraison_prevue: string;
};

export default async function PageAtelier() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase.from("companies").select("id").limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const [{ data: workshop }, { data: faconniers }, { data: catalogueFac }, { data: ordres }, { data: produits }] = await Promise.all([
    supabase
      .from("workshops")
      .select("surface_m2, loyer_mensuel_centimes, nombre_machines")
      .eq("company_id", entreprise.id)
      .maybeSingle(),
    supabase.from("faconniers").select("id, nom, pays, delai_mois, minimum_commande").order("nom"),
    supabase.from("faconnier_catalogue").select("faconnier_id, product_id, prix_par_piece_centimes"),
    supabase
      .from("production_orders")
      .select("id, product_id, quantite, lieu_type, faconnier_id, prix_facon_par_piece_centimes, instant_livraison_prevue")
      .eq("company_id", entreprise.id)
      .eq("statut", "en_cours")
      .order("instant_livraison_prevue"),
    supabase.from("products").select("id, nom"),
  ]);

  const atelier = workshop as Workshop | null;
  const faconniersTab = (faconniers ?? []) as Faconnier[];
  const catalogueFacTab = (catalogueFac ?? []) as LigneCatalogueFac[];
  const ordresTab = (ordres ?? []) as ProductionOrder[];
  const prodMap = new Map<string, string>(
    (produits ?? []).map((p) => [p.id as string, p.nom as string]),
  );

  // Grossiste local : produits du catalogue du joueur, avec une estimation du prix de la pièce
  // (coût de revient à l'usine majoré). Le prix définitif est recalculé par le serveur à la commande.
  const params = chargerParametresV1();
  const { data: lignesCatalogue } = await supabase
    .from("company_products")
    .select("product_id")
    .eq("company_id", entreprise.id);
  const produitsGrossiste: ProduitGrossiste[] = await Promise.all(
    ((lignesCatalogue ?? []) as { product_id: string }[])
      .filter((l) => prodMap.has(l.product_id))
      .map(async (l) => {
        let prixEstimeCentimes: number | null = null;
        try {
          const cout = await coutUsineParPiece(supabase, l.product_id);
          prixEstimeCentimes = prixGrossiste(centimes(cout), params);
        } catch {
          prixEstimeCentimes = null;
        }
        return { id: l.product_id, nom: prodMap.get(l.product_id) ?? l.product_id, prixEstimeCentimes };
      }),
  );
  const delaiMinutes = Math.round(delaiGrossisteMinutes(params));

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="border-b border-[color:var(--color-g-200)] pb-6">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Production
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Atelier et façonniers</h1>
      </header>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Votre atelier</h2>
        {atelier ? (
          <div className="grid grid-cols-3 gap-4">
            <Carte libelle="Surface">
              <span className="chiffre">{atelier.surface_m2}</span> m²
            </Carte>
            <Carte libelle="Loyer mensuel">
              <span className="chiffre">{formaterEuros(atelier.loyer_mensuel_centimes)}</span> €
            </Carte>
            <Carte libelle="Machines">
              <span className="chiffre">{atelier.nombre_machines}</span>
            </Carte>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[color:var(--color-g-300)] p-6">
            <p className="text-sm text-[color:var(--color-g-700)]">
              Pas d'atelier propre pour l'instant. Vous pouvez produire via les
              façonniers ou louer un petit atelier (50 m², 2 machines,
              1 000 €/mois).
            </p>
            <div className="mt-3">
              <LouerAtelierBouton />
            </div>
          </div>
        )}
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">
          Productions en cours ({ordresTab.length})
        </h2>
        {ordresTab.length === 0 ? (
          <p className="rounded-md border border-dashed border-[color:var(--color-g-300)] px-5 py-6 text-center text-sm text-[color:var(--color-g-500)]">
            Pas de production en cours.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-[color:var(--color-g-200)]">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--color-g-100)] text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Produit</th>
                  <th className="px-4 py-2 text-right font-medium">Quantité</th>
                  <th className="px-4 py-2 text-left font-medium">Lieu</th>
                  <th className="px-4 py-2 text-right font-medium">Prix unitaire</th>
                  <th className="px-4 py-2 text-left font-medium">Livraison prévue</th>
                </tr>
              </thead>
              <tbody>
                {ordresTab.map((o) => {
                  const fac = faconniersTab.find((f) => f.id === o.faconnier_id);
                  const grossiste = o.faconnier_id === ID_GROSSISTE_LOCAL;
                  return (
                    <tr key={o.id} className="border-t border-[color:var(--color-g-200)]">
                      <td className="px-4 py-2">{prodMap.get(o.product_id) ?? o.product_id}</td>
                      <td className="chiffre px-4 py-2 text-right">{o.quantite}</td>
                      <td className="px-4 py-2">
                        {o.lieu_type === "atelier"
                          ? "Atelier propre"
                          : grossiste
                            ? "Grossiste local (commande express)"
                            : (fac?.nom ?? "Façonnier")}
                      </td>
                      <td className="chiffre px-4 py-2 text-right">
                        {o.prix_facon_par_piece_centimes != null
                          ? `${formaterEuros(o.prix_facon_par_piece_centimes)} €${grossiste ? " (grossiste)" : ""}`
                          : "—"}
                      </td>
                      <td className="chiffre px-4 py-2 text-xs text-[color:var(--color-g-700)]">
                        {formaterDateHeure(o.instant_livraison_prevue)}
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
          Lancer une production
        </h2>
        <FormulaireProduction
          aUnAtelier={!!atelier}
          faconniers={faconniersTab}
          catalogueFaconnier={catalogueFacTab}
          produits={Array.from(prodMap.entries()).map(([id, nom]) => ({ id, nom }))}
          produitsGrossiste={produitsGrossiste}
          delaiGrossisteMinutes={delaiMinutes}
        />
      </section>
    </div>
  );
}

function Carte({
  libelle,
  children,
}: {
  libelle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[color:var(--color-g-200)] p-4">
      <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
        {libelle}
      </p>
      <p className="mt-2 text-xl font-medium">{children}</p>
    </div>
  );
}
