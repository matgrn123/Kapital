import { chargerParametresV1 } from "@kapital/content";
import { parametreObligatoire } from "@kapital/engine";
import { ID_GROSSISTE_LOCAL } from "@kapital/server";
import { Carte, EncadreNotion, EnTete, FilRouge, Ligne, Puce } from "../../../components/ui";
import { creerClientServeur } from "../../../lib/supabase/server";
import { formaterEuros } from "../../../lib/formatage";
import { nomMatiere } from "../../../lib/lisible";
import { besoinFondsRoulementDepuisLignes, coutRevientEstimeSansStock } from "../../../lib/vente";
import { AjouterProduit, FormulairePrix } from "./FormulairePrix";

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

  const [
    { data: produitsRef },
    { data: catalogue },
    { data: stocks },
    { data: matieres },
    { data: prixFacon },
    { data: ateliers },
    { data: ecritures },
    { data: faconniers },
    { data: prixMatieres },
  ] =
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
      // 3D-7 : au moins un local suffit (la société peut en avoir plusieurs).
      supabase.from("workshops").select("id").eq("company_id", entreprise.id).limit(1),
      supabase
        .from("ledger_entries")
        .select("ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes")
        .eq("company_id", entreprise.id)
        .in("compte", ["31", "35", "411", "401"]),
      supabase.from("faconniers").select("id, fournit_matiere"),
      supabase.from("supplier_catalogue").select("material_id, prix_centimes"),
    ]);
  const bfr = besoinFondsRoulementDepuisLignes(
    (ecritures ?? []) as Array<{
      ecriture_id: string;
      mois_jeu: number;
      libelle: string;
      compte: string;
      sens: "debit" | "credit";
      montant_centimes: number;
    }>,
  );

  const params = chargerParametresV1();
  const nomsMatieres: Record<string, string> = {};
  for (const m of (matieres ?? []) as Array<{ id: string; nom: string }>) nomsMatieres[m.id] = m.nom;
  const produitsRefTab = (produitsRef ?? []) as Produit[];
  const cataMap = new Map(((catalogue ?? []) as CompanyProduit[]).map((c) => [c.product_id, c]));
  const stockMap = new Map(((stocks ?? []) as Stock[]).map((s) => [s.product_id, s]));

  // Sans stock, coût complet estimé chez le façonnier le moins cher (hors grossiste express) :
  // matière (chute comprise) + fournitures + façon, calculé par le moteur.
  const fournitMatiere = new Map(
    ((faconniers ?? []) as Array<{ id: string; fournit_matiere: boolean }>).map((f) => [f.id, f.fournit_matiere]),
  );
  const lignesFacon = ((prixFacon ?? []) as Array<{ faconnier_id: string; product_id: string; prix_par_piece_centimes: number }>)
    .filter((l) => l.faconnier_id !== ID_GROSSISTE_LOCAL);
  const lignesMatiere = (prixMatieres ?? []) as Array<{ material_id: string; prix_centimes: number }>;
  const tauxChute = parametreObligatoire(params, "taux_chute_matiere_defaut");
  function coutEstime(p: Produit): number | null {
    return coutRevientEstimeSansStock({
      produit: { consommationParPiece: Number(p.consommation_par_piece), fournituresCentimes: Number(p.fournitures_par_piece_centimes) },
      prixMatiereCentimes: lignesMatiere.filter((m) => m.material_id === p.matiere_id).map((m) => m.prix_centimes),
      tauxChute,
      faconniers: lignesFacon
        .filter((l) => l.product_id === p.id)
        .map((l) => ({ prixFaconCentimes: l.prix_par_piece_centimes, fournitMatiere: fournitMatiere.get(l.faconnier_id) ?? false })),
    });
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
    const produit = produitsRefTab.find((p) => p.id === productId);
    const f = produit ? coutEstime(produit) : null;
    if (f !== null) {
      return {
        cout: f,
        origine:
          "Pas encore de stock : estimation chez le façonnier le moins cher, matière (chutes comprises), fournitures et façon. Le vrai coût sera celui de ta production.",
      };
    }
    return { cout: null, origine: "" };
  }

  const auCatalogue = produitsRefTab.filter((p) => cataMap.has(p.id));
  const aAjouter = produitsRefTab.filter((p) => !cataMap.has(p.id));
  const catalogueVide = auCatalogue.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <EnTete surTitre="Canaux de vente" titre="Vente">
        Fixe tes prix. Plus cher, tu vends moins, sauf si ta marque fait envie.
      </EnTete>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {catalogueVide && (
            <Carte titre="Commence par choisir un produit">
              <p className="text-[0.88rem] text-muted">
                Ton catalogue est vide. Ajoute ton premier produit ci-dessous : ta société reçoit alors une première série
                prête à vendre, et les ventes commencent au prix que tu fixes.
              </p>
            </Carte>
          )}

          {!catalogueVide && (
            <Carte titre="Tes prix">
              <div className="flex flex-col divide-y divide-line">
                {auCatalogue.map((p) => {
                  const ligne = cataMap.get(p.id)!;
                  const stock = stockMap.get(p.id)?.quantite_pieces ?? 0;
                  const { cout, origine } = coutDe(p.id);
                  return (
                    <section key={p.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-bold">{p.nom}</h3>
                        <Puce ton={stock > 0 ? "bon" : "alerte"}>{stock > 0 ? `${stock} en stock` : "Stock vide"}</Puce>
                      </div>
                      <p className="text-[0.8rem] text-muted">
                        {p.consommation_par_piece.toLocaleString("fr-FR")} m de {nomMatiere(p.matiere_id, nomsMatieres)} ·{" "}
                        {p.temps_standard_minutes} min de couture · fournitures {formaterEuros(p.fournitures_par_piece_centimes)} €
                      </p>
                      <FormulairePrix
                        lignePrix={ligne}
                        nomProduit={p.nom}
                        coutRevient={cout}
                        origineCout={origine}
                        params={params}
                        aUnAtelier={(ateliers ?? []).length > 0}
                      />
                    </section>
                  );
                })}
              </div>
            </Carte>
          )}

          {aAjouter.length > 0 && (
            <Carte titre={catalogueVide ? "Produits disponibles" : "Ajouter un produit"}>
              <AjouterProduit
                premier={catalogueVide}
                produits={aAjouter.map((p) => ({
                  id: p.id,
                  nom: p.nom,
                  detail: `${p.consommation_par_piece.toLocaleString("fr-FR")} m de ${nomMatiere(p.matiere_id, nomsMatieres)} · ${p.temps_standard_minutes} min de couture`,
                  prix: ((c) => (c === null ? null : `Coût de revient estimé ${formaterEuros(c)} € la pièce`))(coutEstime(p)),
                }))}
              />
            </Carte>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Carte titre="Ton besoin en fonds de roulement aujourd'hui">
            <Ligne libelle="Stocks (tissu et pièces finies)">{formaterEuros(bfr.stocks)} €</Ligne>
            <Ligne libelle="+ Créances clients">{formaterEuros(bfr.creances)} €</Ligne>
            <Ligne libelle="− Dettes fournisseurs">{formaterEuros(bfr.dettesFournisseurs)} €</Ligne>
            <Ligne libelle="= Besoin en fonds de roulement" fort>
              {formaterEuros(bfr.besoin)} €
            </Ligne>
          </Carte>
          <EncadreNotion titre="Vendre n'est pas encaisser">
            Un revendeur paie plus tard : tant qu&apos;il ne l&apos;a pas fait, il te doit de l&apos;argent (une créance, compte
            411). Elle gonfle ton besoin en fonds de roulement : ton chiffre d&apos;affaires monte, ta trésorerie attend.
          </EncadreNotion>
          <EncadreNotion titre="La marge">
            Marge = prix de vente hors taxes − coût de revient. Le taux de marge, c&apos;est cette marge divisée par le prix
            hors taxes. Baisser le prix fait vendre plus, mais chaque pièce rapporte moins. En ligne, une partie des pièces
            revient : leur traitement coûte, c&apos;est compté dans la marge affichée.
          </EncadreNotion>
          <EncadreNotion titre="La TVA ne t'appartient pas">
            Sur un prix TTC, la TVA est collectée pour l&apos;État : elle va au compte 44571 et sera reversée. Ton chiffre
            d&apos;affaires, c&apos;est le prix hors taxes (compte 707).
          </EncadreNotion>
          <FilRouge ecran="vente" />
        </div>
      </div>
    </div>
  );
}
