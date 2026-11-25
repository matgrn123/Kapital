import Link from "next/link";
import { Carte, EncadreNotion, EnTete, FilRouge, Kpi, Puce, Tableau, Vide } from "../../../components/ui";
import { creerClientServeur } from "../../../lib/supabase/server";
import { formaterEuros, formaterDateHeure } from "../../../lib/formatage";
import { chargerParametresV1 } from "@kapital/content";
import { centimes, delaiGrossisteMinutes, prixGrossiste } from "@kapital/engine";
import { coutUsineParPiece, ID_GROSSISTE_LOCAL } from "@kapital/server";
import {
  LouerAtelierBouton,
  FormulaireProduction,
  type ProduitCatalogue,
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

  const { data: entreprises } = await supabase.from("companies").select("id, tresorerie_centimes").limit(1);
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
    supabase.from("products").select("id, nom, matiere_id, consommation_par_piece, fournitures_par_piece_centimes"),
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
    .select("product_id, prix_vente_directe_centimes")
    .eq("company_id", entreprise.id);
  const produitsGrossiste: ProduitGrossiste[] = await Promise.all(
    ((lignesCatalogue ?? []) as { product_id: string; prix_vente_directe_centimes: number }[])
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

  const [{ data: stocksFinis }, { data: stocksMat }, { data: matieres }] = await Promise.all([
    supabase.from("product_stock").select("product_id, quantite_pieces").eq("company_id", entreprise.id),
    supabase.from("material_stock").select("material_id, quantite, valeur_totale_centimes").eq("company_id", entreprise.id),
    supabase.from("materials").select("id, nom"),
  ]);
  const stockFini = new Map(
    ((stocksFinis ?? []) as Array<{ product_id: string; quantite_pieces: number }>).map((s) => [s.product_id, s.quantite_pieces]),
  );
  // En atelier, le moteur consomme la matière du produit (moteur/flux.ts) : on prépare
  // pour chaque produit sa nomenclature et le stock de SA matière.
  const nomsMat = new Map((matieres ?? []).map((m) => [m.id as string, m.nom as string]));
  const stocksMatTab = (stocksMat ?? []) as Array<{ material_id: string; quantite: number; valeur_totale_centimes: number }>;
  const fiches = new Map(
    ((produits ?? []) as Array<{ id: string; matiere_id: string | null; consommation_par_piece: number | null; fournitures_par_piece_centimes: number | null }>).map((p) => [p.id, p]),
  );
  function ficheEtStock(productId: string): ProduitCatalogue["fabrication"] {
    const f = fiches.get(productId);
    if (!f || !f.matiere_id || f.consommation_par_piece == null) return null;
    const st = stocksMatTab.find((x) => x.material_id === f.matiere_id && Number(x.quantite) > 0);
    return {
      consommationParPiece: Number(f.consommation_par_piece),
      fournituresParPiece: Number(f.fournitures_par_piece_centimes ?? 0),
      nomMatiere: nomsMat.get(f.matiere_id) ?? "Matière",
      stock: st ? { quantite: Number(st.quantite), valeurTotale: Number(st.valeur_totale_centimes) } : null,
    };
  }
  const produitsCatalogue: ProduitCatalogue[] = (
    (lignesCatalogue ?? []) as { product_id: string; prix_vente_directe_centimes: number }[]
  )
    .filter((l) => prodMap.has(l.product_id))
    .map((l) => ({
      id: l.product_id,
      nom: prodMap.get(l.product_id)!,
      prixVenteTtc: l.prix_vente_directe_centimes,
      stock: stockFini.get(l.product_id) ?? 0,
      fabrication: ficheEtStock(l.product_id),
    }));

  return (
    <div className="flex flex-col gap-5">
      <EnTete surTitre="Fabrication" titre="Production">
        Fabrique dans ton atelier ou confie la production à un façonnier. Les deux choix n&apos;ont ni le même coût, ni le
        même effet sur ta trésorerie.
      </EnTete>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Carte titre="Lancer une production">
            <FormulaireProduction
              aUnAtelier={!!atelier}
              faconniers={faconniersTab}
              catalogueFaconnier={catalogueFacTab}
              produits={produitsCatalogue}
              produitsGrossiste={produitsGrossiste}
              delaiGrossisteMinutes={delaiMinutes}
              tresorerie={Number(entreprise.tresorerie_centimes ?? 0)}
              params={params}
            />
          </Carte>

          <Carte titre="Productions en cours" action={<Puce>{ordresTab.length}</Puce>}>
            {ordresTab.length === 0 ? (
              <Vide>Aucune production en cours. Sans nouvelle production, ton stock finira par s&apos;épuiser.</Vide>
            ) : (
              <Tableau
                entetes={[
                  { texte: "Produit" },
                  { texte: "Quantité", droite: true },
                  { texte: "Lieu" },
                  { texte: "Prix par pièce", droite: true },
                  { texte: "Arrivée prévue" },
                ]}
              >
                {ordresTab.map((o) => {
                  const fac = faconniersTab.find((f) => f.id === o.faconnier_id);
                  const grossiste = o.faconnier_id === ID_GROSSISTE_LOCAL;
                  return (
                    <tr key={o.id}>
                      <td>{prodMap.get(o.product_id) ?? "Produit"}</td>
                      <td className="text-right tabular-nums">{o.quantite}</td>
                      <td>
                        {o.lieu_type === "atelier" ? "Ton atelier" : grossiste ? "Grossiste (express)" : (fac?.nom ?? "Façonnier")}
                      </td>
                      <td className="text-right tabular-nums">
                        {o.prix_facon_par_piece_centimes != null ? `${formaterEuros(o.prix_facon_par_piece_centimes)} €` : "—"}
                      </td>
                      <td className="text-muted">{formaterDateHeure(o.instant_livraison_prevue)}</td>
                    </tr>
                  );
                })}
              </Tableau>
            )}
          </Carte>

          <Carte titre="Ton atelier">
            {atelier ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Kpi libelle="Surface" valeur={`${atelier.surface_m2} m²`} />
                <Kpi libelle="Loyer mensuel" valeur={`${formaterEuros(atelier.loyer_mensuel_centimes)} €`} />
                <Kpi libelle="Machines" valeur={atelier.nombre_machines} />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-[0.88rem] text-muted">
                  Pas encore d&apos;atelier : tu produis chez les façonniers. Un atelier coûte un loyer chaque mois, mais
                  chaque pièce y revient moins cher quand il tourne bien. Les conditions sont dans{" "}
                  <Link href="/locaux" className="text-accent underline">
                    Locaux
                  </Link>
                  .
                </p>
                <LouerAtelierBouton />
              </div>
            )}
          </Carte>
        </div>

        <div className="flex flex-col gap-4">
          <EncadreNotion titre="Coût variable, coût fixe">
            Chez le façonnier, tout est variable : tu paies chaque pièce. En atelier, le salaire et le loyer tombent chaque
            mois, que tu produises ou non. L&apos;atelier devient rentable quand il tourne à pleine capacité.
          </EncadreNotion>
          <EncadreNotion titre="Le coût de revient">
            Coût d&apos;une pièce = matière (chutes comprises) + fournitures + façon. La façon, c&apos;est le prix du façonnier,
            ou le temps de couture multiplié par le coût de la minute dans ton atelier.
          </EncadreNotion>
          <EncadreNotion titre="Le BFR (besoin en fonds de roulement)">
            Tu paies la production avant de vendre. L&apos;argent immobilisé dans le stock, c&apos;est ton BFR. Le façonnier qui
            te facture à la livraison finance ton stock un moment : c&apos;est une dette fournisseur.
          </EncadreNotion>
          <FilRouge ecran="production" />
        </div>
      </div>
    </div>
  );
}
