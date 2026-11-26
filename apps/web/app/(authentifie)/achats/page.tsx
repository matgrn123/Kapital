import { chargerParametresV1 } from "@kapital/content";
import { Carte, EncadreNotion, EnTete, Puce, Tableau, Vide } from "../../../components/ui";
import { creerClientServeur } from "../../../lib/supabase/server";
import { versQuand } from "../../../lib/cadre";
import { formaterEuros } from "../../../lib/formatage";
import { quantiteMatiere, symboleUnite } from "../../../lib/formatage";
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
  instant_livraison_prevue: string;
  statut: string;
};

export default async function PageAchats() {
  const supabase = await creerClientServeur();
  const maintenant = Date.now();

  const { data: entreprises } = await supabase.from("companies").select("id, tresorerie_centimes").limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const [{ data: fournisseurs }, { data: catalogue }, { data: commandes }, { data: materials }, { data: stocks }] =
    await Promise.all([
      supabase.from("suppliers").select("id, nom, pays, delai_mois, minimum_commande").order("nom"),
      supabase.from("supplier_catalogue").select("supplier_id, material_id, prix_centimes"),
      supabase
        .from("purchase_orders")
        .select("id, supplier_id, material_id, quantite, prix_unitaire_centimes, instant_livraison_prevue, statut")
        .eq("company_id", entreprise.id)
        .eq("statut", "en_cours")
        .order("instant_livraison_prevue", { ascending: true }),
      supabase.from("materials").select("id, nom, unite"),
      supabase.from("material_stock").select("material_id, quantite").eq("company_id", entreprise.id),
    ]);

  const params = chargerParametresV1();
  const fournisseursTab = (fournisseurs ?? []) as Fournisseur[];
  const enCours = (commandes ?? []) as Commande[];
  const materialsMap = new Map<string, string>((materials ?? []).map((m) => [m.id as string, m.nom as string]));
  // Unité de chaque matière (« metre », « lot ») : une quantité se lit toujours avec elle.
  const unites = new Map<string, string>((materials ?? []).map((m) => [m.id as string, String(m.unite ?? "metre")]));
  const stocksTab = ((stocks ?? []) as Array<{ material_id: string; quantite: number }>).filter((s) => Number(s.quantite) > 0);

  return (
    <div className="flex flex-col gap-5">
      <EnTete surTitre="Fournisseurs" titre="Achats de matière">
        Commande le tissu dont ton atelier a besoin. Le prix est figé le jour de la commande ; la matière arrive après le
        délai du fournisseur.
      </EnTete>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Carte titre="Passer une commande">
            <FormulaireCommande
              fournisseurs={fournisseursTab}
              catalogue={(catalogue ?? []) as LigneCatalogue[]}
              materials={Array.from(materialsMap.entries()).map(([id, nom]) => ({ id, nom, unite: unites.get(id) ?? "metre" }))}
              tresorerie={Number(entreprise.tresorerie_centimes ?? 0)}
              params={params}
            />
          </Carte>

          <Carte titre="Commandes en route" action={<Puce>{enCours.length}</Puce>}>
            {enCours.length === 0 ? (
              <Vide>Aucune commande en route. Choisis un fournisseur ci-dessus pour remplir ton stock de matière.</Vide>
            ) : (
              <Tableau
                entetes={[
                  { texte: "Fournisseur" },
                  { texte: "Matière" },
                  { texte: "Quantité", droite: true },
                  { texte: "Total", droite: true },
                  { texte: "Arrivée prévue" },
                ]}
              >
                {enCours.map((c) => (
                  <tr key={c.id}>
                    <td>{fournisseursTab.find((x) => x.id === c.supplier_id)?.nom ?? "Fournisseur"}</td>
                    <td>{materialsMap.get(c.material_id) ?? "Matière"}</td>
                    <td className="text-right tabular-nums">
                      {Number(c.quantite).toLocaleString("fr-FR")} {symboleUnite(unites.get(c.material_id) ?? "metre", Number(c.quantite))}
                    </td>
                    <td className="text-right tabular-nums">
                      {formaterEuros(Math.round(c.prix_unitaire_centimes * Number(c.quantite)))} €
                    </td>
                    <td className="text-muted">{versQuand(c.instant_livraison_prevue, maintenant)}</td>
                  </tr>
                ))}
              </Tableau>
            )}
          </Carte>

          <Carte titre="Ton stock de matière">
            {stocksTab.length === 0 ? (
              <Vide>Ton stock de matière est vide.</Vide>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stocksTab.map((s) => (
                  <Puce key={s.material_id}>
                    {quantiteMatiere(Number(s.quantite), unites.get(s.material_id) ?? "metre", materialsMap.get(s.material_id) ?? "matière")}
                  </Puce>
                ))}
              </div>
            )}
          </Carte>
        </div>

        <div className="flex flex-col gap-4">
          <EncadreNotion titre="Le stock, c'est de l'argent qui dort">
            La matière livrée entre à l&apos;actif de ton bilan (compte 31, stock de matières). Ce n&apos;est pas encore une
            charge : elle le deviendra quand tu la transformeras en produits et que tu les vendras.
          </EncadreNotion>
          <EncadreNotion titre="Acheter à crédit">
            Le fournisseur te livre avant d&apos;être payé : tu lui dois l&apos;argent (compte 401, dettes fournisseurs). Ce
            crédit réduit ton besoin en fonds de roulement, mais c&apos;est une dette.
          </EncadreNotion>
          <EncadreNotion titre="Minimum de commande et délai">
            Chaque fournisseur impose une quantité minimale et un délai. Commander tard, c&apos;est risquer la rupture ;
            commander trop, c&apos;est immobiliser de la trésorerie.
          </EncadreNotion>
        </div>
      </div>
    </div>
  );
}
