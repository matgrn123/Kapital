import { chargerParametresV1 } from "@kapital/content";
import { ID_GROSSISTE_LOCAL } from "@kapital/server";
import { Carte, EncadreNotion, Puce } from "../../../components/ui";
import { EnTete } from "../../../components/apercu/elements";
import { creerClientServeur } from "../../../lib/supabase/server";
import { formaterEuros } from "../../../lib/formatage";
import { nomMatiere } from "../../../lib/lisible";
import { AjouterProduitBouton, FormulairePrix } from "./FormulairePrix";

type Produit = {
  id: string;
  nom: string;
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

type Stock = { product_id: string; quantite_pieces: number; valeur_totale_centimes: number };

export default async function PageProduits() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase.from("companies").select("id").limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const [{ data: produitsRef }, { data: catalogue }, { data: stocks }, { data: matieres }, { data: prixFacon }, { data: atelier }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, nom, matiere_id, consommation_par_piece, fournitures_par_piece_centimes, temps_standard_minutes")
        .order("nom"),
      supabase
        .from("company_products")
        .select("id, product_id, qualite_visee, prix_vente_directe_centimes, prix_revendeur_centimes, production_mensuelle_cible")
        .eq("company_id", entreprise.id),
      supabase
        .from("product_stock")
        .select("product_id, quantite_pieces, valeur_totale_centimes")
        .eq("company_id", entreprise.id),
      supabase.from("materials").select("id, nom"),
      supabase.from("faconnier_catalogue").select("faconnier_id, product_id, prix_par_piece_centimes"),
      supabase.from("workshops").select("id").eq("company_id", entreprise.id).maybeSingle(),
    ]);

  const params = chargerParametresV1();
  const nomsMatieres: Record<string, string> = {};
  for (const m of (matieres ?? []) as Array<{ id: string; nom: string }>) nomsMatieres[m.id] = m.nom;
  const produitsRefTab = (produitsRef ?? []) as Produit[];
  const cataMap = new Map(((catalogue ?? []) as CompanyProduit[]).map((c) => [c.product_id, c]));
  const stockMap = new Map(((stocks ?? []) as Stock[]).map((s) => [s.product_id, s]));

  // Prix de façon le plus bas par produit (hors grossiste express).
  const faconMin = new Map<string, number>();
  for (const l of (prixFacon ?? []) as Array<{ faconnier_id: string; product_id: string; prix_par_piece_centimes: number }>) {
    if (l.faconnier_id === ID_GROSSISTE_LOCAL) continue;
    const v = faconMin.get(l.product_id);
    if (v === undefined || l.prix_par_piece_centimes < v) faconMin.set(l.product_id, l.prix_par_piece_centimes);
  }

  /** Coût de revient utilisé pour la marge : celui du stock (coût moyen), sinon le façonnier le moins cher. */
  function coutDe(productId: string): { cout: number | null; origine: string } {
    const s = stockMap.get(productId);
    if (s && s.quantite_pieces > 0 && s.valeur_totale_centimes > 0) {
      return {
        cout: Math.round(s.valeur_totale_centimes / s.quantite_pieces),
        origine: `Coût moyen de tes ${s.quantite_pieces} pièces en stock : c'est celui que le moteur sort du stock à chaque vente.`,
      };
    }
    const f = faconMin.get(productId);
    if (f !== undefined) {
      return {
        cout: f,
        origine: "Pas encore de stock : estimation au prix du façonnier le moins cher. Le vrai coût sera celui de ta production.",
      };
    }
    return { cout: null, origine: "" };
  }

  const auCatalogue = produitsRefTab.filter((p) => cataMap.has(p.id));
  const aAjouter = produitsRefTab.filter((p) => !cataMap.has(p.id));
  const catalogueVide = auCatalogue.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6">
      <EnTete surTitre="Canaux de vente" titre="Vente et prix">
        Fixe tes prix. Chaque produit a deux prix : le prix public TTC, en ligne, et le prix hors taxes pour les
        revendeurs. Plus cher, tu vends moins, sauf si ta marque fait envie.
      </EnTete>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {catalogueVide && (
            <Carte titre="Commence par choisir un produit">
              <p className="text-[0.88rem] text-muted">
                Ton catalogue est vide. Ajoute ton premier produit ci-dessous : ta société reçoit alors une première série
                prête à vendre, et les ventes commencent au prix que tu fixes.
              </p>
            </Carte>
          )}

          {auCatalogue.map((p) => {
            const ligne = cataMap.get(p.id)!;
            const stock = stockMap.get(p.id)?.quantite_pieces ?? 0;
            const { cout, origine } = coutDe(p.id);
            return (
              <Carte
                key={p.id}
                surTitre="Au catalogue"
                titre={p.nom}
                action={
                  <Puce ton={stock > 0 ? "bon" : "alerte"}>
                    {stock > 0 ? `${stock} en stock` : "Stock vide"}
                  </Puce>
                }
              >
                <p className="mb-3 text-[0.8rem] text-muted">
                  {p.consommation_par_piece.toLocaleString("fr-FR")} m de {nomMatiere(p.matiere_id, nomsMatieres)} ·{" "}
                  {p.temps_standard_minutes} min de couture · fournitures {formaterEuros(p.fournitures_par_piece_centimes)} €
                </p>
                <FormulairePrix
                  lignePrix={ligne}
                  nomProduit={p.nom}
                  coutRevient={cout}
                  origineCout={origine}
                  params={params}
                  aUnAtelier={!!atelier}
                />
              </Carte>
            );
          })}

          {aAjouter.length > 0 && (
            <Carte titre={catalogueVide ? "Produits disponibles" : "Ajouter un produit"}>
              <div className="flex flex-col divide-y divide-line">
                {aAjouter.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <b>{p.nom}</b>
                      <p className="text-[0.8rem] text-muted">
                        {p.consommation_par_piece.toLocaleString("fr-FR")} m de {nomMatiere(p.matiere_id, nomsMatieres)} ·{" "}
                        {p.temps_standard_minutes} min de couture
                        {faconMin.has(p.id) && ` · façon dès ${formaterEuros(faconMin.get(p.id)!)} € la pièce`}
                      </p>
                    </div>
                    <AjouterProduitBouton productId={p.id} premier={catalogueVide} />
                  </div>
                ))}
              </div>
            </Carte>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <EncadreNotion titre="La marge">
            Marge = prix de vente hors taxes − coût de revient. Le taux de marge, c&apos;est cette marge divisée par le prix
            hors taxes. Baisser le prix fait vendre plus, mais chaque pièce rapporte moins. En ligne, une partie des pièces
            revient : leur traitement coûte, c&apos;est compté dans la marge affichée.
          </EncadreNotion>
          <EncadreNotion titre="La TVA ne t'appartient pas">
            Sur un prix TTC, la TVA est collectée pour l&apos;État : elle va au compte 44571 et sera reversée. Ton chiffre
            d&apos;affaires, c&apos;est le prix hors taxes (compte 707).
          </EncadreNotion>
          <EncadreNotion titre="Vendre n'est pas encaisser">
            Un revendeur paie plus tard : tant qu&apos;il ne l&apos;a pas fait, il te doit de l&apos;argent (une créance, compte
            411). Ton chiffre d&apos;affaires monte, ta trésorerie attend : c&apos;est ton besoin en fonds de roulement.
          </EncadreNotion>
        </div>
      </div>
    </div>
  );
}
