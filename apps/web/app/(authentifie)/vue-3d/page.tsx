import { reglesPretV1 } from "@kapital/server";
import { Bandeau, EnTete } from "../../../components/ui/formulaire";
import { Puce } from "../../../components/ui";
import { formaterEuros } from "../../../lib/formatage";
import { libelleGamme } from "../../../lib/lisible";
import { creerClientServeur } from "../../../lib/supabase/server";
import { nomLisibleSociete, type ActeurVillage } from "../../../lib/vue3d";
import { lireEstrAnnuel } from "../_partage/estr";
import { Village, type FicheActeur } from "./Village";

// Le village (design V2, docs/maquette V.village) : la société du joueur au milieu des
// acteurs réels du monde (fournisseurs, façonniers, banque, concurrents). Tous les chiffres
// viennent de la base ; le plan (lib/vue3d.ts) ne fait que placer les bâtiments.

type Partenaire = { id: string; nom: string; pays: string; delai_mois: number; minimum_commande: number };
type Concurrent = { company_id: string; nom: string; gamme: string; pseudo: string; valeur_centimes: number | null };

const pourcent = (x: number) => `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
const pluriel = (n: number, mot: string) => `${n.toLocaleString("fr-FR")} ${mot}${n > 1 ? "s" : ""}`;

export default async function PageVillage() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase.from("companies").select("id, nom, gamme, etape, tresorerie_centimes").limit(1);
  const entreprise = entreprises?.[0] as
    | { id: string; nom: string; gamme: string; etape: number; tresorerie_centimes: number }
    | undefined;
  if (!entreprise) return null;

  const [{ data: stocks }, { data: employes }, { data: fournisseurs }, { data: faconniers }, { data: classement }, { data: monde }, estr] =
    await Promise.all([
      supabase.from("product_stock").select("quantite_pieces").eq("company_id", entreprise.id),
      supabase.from("employees").select("id").eq("company_id", entreprise.id).eq("statut", "actif"),
      supabase.from("suppliers").select("id, nom, pays, delai_mois, minimum_commande").order("nom"),
      supabase.from("faconniers").select("id, nom, pays, delai_mois, minimum_commande").order("nom"),
      supabase.from("classement_publique").select("company_id, nom, gamme, pseudo, valeur_centimes"),
      supabase.from("worlds").select("mois_courant").eq("etat", "actif").limit(1).maybeSingle(),
      lireEstrAnnuel(supabase, reglesPretV1().estrDeSecoursAnnuel),
    ]);

  const stockFinis = ((stocks ?? []) as { quantite_pieces: number }[]).reduce((s, r) => s + Number(r.quantite_pieces), 0);
  const nbEmployes = employes?.length ?? 0;
  const mois = (monde as { mois_courant?: number } | null)?.mois_courant;

  const fiches: FicheActeur[] = [
    {
      id: "societe",
      genre: "joueur",
      nom: entreprise.nom,
      surTitre: `Ta société · ${libelleGamme(entreprise.gamme)}`,
      description: "Ton entreprise. Entre dans l'atelier pour produire, ou ouvre le tableau de bord pour suivre tes chiffres.",
      faits: [
        ["Trésorerie", `${formaterEuros(Number(entreprise.tresorerie_centimes))} €`],
        ["Stock de produits finis", pluriel(stockFinis, "pièce")],
        ["Équipe", nbEmployes === 0 ? "Toi seul" : pluriel(nbEmployes, "salarié")],
        ["Étape", String(entreprise.etape)],
      ],
      liens: [
        { href: "/atelier", libelle: "Entrer dans l'atelier" },
        { href: "/jeu", libelle: "Tableau de bord" },
      ],
    },
    {
      id: "banque",
      genre: "banque",
      nom: "Banque",
      surTitre: "Acteur du monde · financement",
      description: "Elle prête à partir du taux de la BCE (€STR), plus une marge qui dépend de l'objet du prêt.",
      faits: [["€STR du mois", pourcent(Math.max(estr, 0))]],
      liens: [{ href: "/banque", libelle: "Banque et prêt" }],
    },
    {
      id: "terrain",
      genre: "terrain",
      nom: "Terrain du futur magasin",
      surTitre: "Terrain à débloquer",
      description: "Ici pourra s'ouvrir ta boutique. Le magasin physique se débloque plus tard dans ta croissance.",
      faits: [],
      liens: [{ href: "/magasin", libelle: "Magasin physique" }],
    },
    ...((fournisseurs ?? []) as Partenaire[]).map(
      (f): FicheActeur => ({
        id: `fournisseur-${f.id}`,
        genre: "fournisseur",
        nom: f.nom,
        surTitre: "Fournisseur de matières",
        description: "Il te vend les tissus et fournitures. Tu le paies, il te livre après son délai.",
        faits: [
          ["Pays", f.pays],
          ["Délai de livraison", `${Number(f.delai_mois).toLocaleString("fr-FR")} mois`],
          ["Commande minimum", Number(f.minimum_commande).toLocaleString("fr-FR")],
        ],
        liens: [{ href: "/achats", libelle: "Achats" }],
      }),
    ),
    ...((faconniers ?? []) as Partenaire[]).map(
      (f): FicheActeur => ({
        id: `faconnier-${f.id}`,
        genre: "faconnier",
        nom: f.nom,
        surTitre: "Façonnier",
        description: "Il fabrique tes pièces à partir de tes matières, contre un prix par pièce.",
        faits: [
          ["Pays", f.pays],
          ["Délai de fabrication", `${Number(f.delai_mois).toLocaleString("fr-FR")} mois`],
          ["Commande minimum", pluriel(Number(f.minimum_commande), "pièce")],
        ],
        liens: [{ href: "/atelier", libelle: "Production" }],
      }),
    ),
    ...((classement ?? []) as Concurrent[])
      .filter((c) => c.company_id !== entreprise.id)
      .map(
        (c): FicheActeur => ({
          id: `concurrent-${c.company_id}`,
          genre: "concurrent",
          nom: nomLisibleSociete(c.nom),
          surTitre: c.pseudo === "PNJ" ? "Concurrent · société du jeu" : `Concurrent · joueur ${c.pseudo}`,
          description: "Il vend aux mêmes clients que toi. Compare ses prix et sa marque sur l'écran Marché.",
          faits: [
            ["Gamme", libelleGamme(c.gamme)],
            ...(c.valeur_centimes ? ([["Valeur estimée", `${formaterEuros(Number(c.valeur_centimes))} €`]] as const) : []),
          ],
          liens: [
            { href: "/marche", libelle: "Marché" },
            { href: "/classement", libelle: "Classement" },
          ],
        }),
      ),
  ];

  const acteurs: ActeurVillage[] = fiches.map((f) => ({ id: f.id, genre: f.genre }));
  const date = mois === undefined || mois === null ? "Date de jeu inconnue" : `Mois ${mois} du jeu`;

  return (
    <div className="flex flex-col gap-4">
      <EnTete
        surTitre="Interface principale"
        titre="Le village"
        action={
          <>
            <Puce ton="accent">● Ta société</Puce>
            <Puce>Acteurs du monde</Puce>
            <Puce ton="alerte">Terrain à débloquer</Puce>
          </>
        }
      >
        Ta société vit ici, à côté de la banque, des fournisseurs, des façonniers et des concurrents. Clique sur un
        bâtiment pour l&apos;ouvrir.
      </EnTete>
      <Bandeau droite={`${date} · 1 jour réel = 1 mois de jeu`}>
        <strong>Chaque bâtiment est un vrai acteur du jeu.</strong> Les chiffres viennent du moteur ; le plan est
        seulement décoratif.
      </Bandeau>
      <Village fiches={fiches} acteurs={acteurs} nomSociete={entreprise.nom} />
    </div>
  );
}
