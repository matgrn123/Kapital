import { creerClientServeur } from "../../../lib/supabase/server";
import { dateHeureLisible } from "../../../lib/cadre";
import { formaterEuros } from "../../../lib/formatage";
import { libelleGamme, libelleLisible, nomLisibleSociete } from "../../../lib/lisible";
import { Carte, Puce } from "../../../components/ui";
import { EnTete, TableauRang, Vide } from "../../../components/ui/formulaire";

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

export default async function PageMarche() {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: monEntreprise } = await supabase
    .from("companies")
    .select("id, gamme")
    .eq("owner_profile_id", user?.id ?? "")
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
    }> | null;
    // Jointure un pour un : PostgREST renvoie un objet, ou null si la
    // société n'a pas encore de ligne brand_state (avant la première clôture).
    // Par prudence, on accepte aussi un tableau.
    brand_state:
      | { notoriete: number; desirabilite: number }
      | Array<{ notoriete: number; desirabilite: number }>
      | null;
    product_stock: Array<{ product_id: string; quantite_pieces: number }> | null;
  };
  const lignes: LigneMarche[] = [];
  for (const o of (offres ?? []) as unknown as OffreDb[]) {
    const stockPar = new Map(
      (o.product_stock ?? []).map((s) => [s.product_id, s.quantite_pieces]),
    );
    const marque = Array.isArray(o.brand_state)
      ? o.brand_state[0]
      : (o.brand_state ?? undefined);
    for (const cp of o.company_products ?? []) {
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
  const { data: noms } =
    companyIds.length > 0
      ? await supabase.from("companies").select("id, nom").in("id", companyIds)
      : { data: [] as Array<{ id: string; nom: string }> };
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
    nom_entreprise: nomLisibleSociete(nomPar.get(e.company_id) ?? "—"),
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

  const nomsProduits = Object.fromEntries(nomProduit);

  return (
    <div className="flex flex-col gap-5">
      <EnTete surTitre="Monde" titre="Marché">
        Les concurrents de ta gamme ({libelleGamme(entreprise.gamme)}) et leurs prix, du moins cher au plus cher. Plus
        ton prix est bas pour une notoriété donnée, plus tu captes de ventes.
      </EnTete>

      {parProduit.size === 0 && <Vide>Aucune offre sur ta gamme pour l&apos;instant.</Vide>}
      {[...parProduit.entries()].map(([productId, offres]) => (
        <Carte
          key={productId}
          titre={nomProduit.get(productId) ?? productId}
          action={<Puce>{offres.length} offres sur ta gamme</Puce>}
        >
          <TableauRang
            entetes={[
              { texte: "Marque" },
              { texte: "Prix direct TTC", droite: true },
              { texte: "Prix revendeur HT", droite: true },
              { texte: "Notoriété", droite: true },
              { texte: "Désirabilité", droite: true },
              { texte: "Stock", droite: true },
            ]}
            lignes={offres.map((o) => {
              const estMoi = o.company_id === entreprise.id;
              return {
                cle: `${o.company_id}-${o.product_id}`,
                moi: estMoi,
                cellules: [
                  <>
                    {nomLisibleSociete(o.nom)}
                    {estMoi && <span className="ml-2 text-[0.78rem] text-muted">(toi)</span>}
                  </>,
                  `${formaterEuros(o.prix_vente_directe_centimes)} €`,
                  `${formaterEuros(o.prix_revendeur_centimes)} €`,
                  o.notoriete !== null ? Math.round(o.notoriete) : "—",
                  o.desirabilite !== null ? Math.round(o.desirabilite) : "—",
                  o.quantite_pieces,
                ],
              };
            })}
          />
        </Carte>
      ))}

      <Carte titre="Ventes récentes" surTitre="Les 50 dernières ventes enregistrées">
        {ventesRecentes.length === 0 ? (
          <Vide>Aucune vente encore : elles apparaissent ici au fil des minutes.</Vide>
        ) : (
          <TableauRang
            entetes={[{ texte: "Quand" }, { texte: "Entreprise" }, { texte: "Vente" }, { texte: "Montant HT", droite: true }]}
            lignes={ventesRecentes.map((v) => ({
              cle: v.id,
              moi: v.company_id === entreprise.id,
              cellules: [
                <span key="d" className="text-[0.78rem] text-muted">{dateHeureLisible(v.cree_le)}</span>,
                v.nom_entreprise,
                libelleLisible(v.libelle, nomsProduits),
                `${formaterEuros(v.montant_centimes)} €`,
              ],
            }))}
          />
        )}
      </Carte>
    </div>
  );
}
