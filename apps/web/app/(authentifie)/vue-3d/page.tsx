import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerBatimentsV1 } from "@kapital/content";
import { reglesPretV1 } from "@kapital/server";
import { Bandeau, EnTete } from "../../../components/ui/formulaire";
import { Puce } from "../../../components/ui";
import { formaterEuros } from "../../../lib/formatage";
import { libelleGamme } from "../../../lib/lisible";
import { creerClientServeur } from "../../../lib/supabase/server";
import { nomLisibleSociete } from "../../../lib/lisible";
import { AUCUN_AUTRE_BATIMENT, idBoutique, idLocal, type ActeurVillage, type BatimentsDuJoueur } from "../../../lib/vue3d";
import { lireEstrAnnuel } from "../_partage/estr";
import { Village, type FicheActeur } from "./Village";

// Le village (design V2, docs/maquette V.village) : la société du joueur au milieu des
// acteurs réels du monde (fournisseurs, façonniers, banque, concurrents). Tous les chiffres
// viennent de la base ; le plan (lib/vue3d.ts) ne fait que placer les bâtiments.

type Partenaire = { id: string; nom: string; pays: string; delai_mois: number; minimum_commande: number };
type Concurrent = { company_id: string; nom: string; gamme: string; pseudo: string; valeur_centimes: number | null };

const pourcent = (x: number) => `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
const pluriel = (n: number, mot: string) => `${n.toLocaleString("fr-FR")} ${mot}${n > 1 ? "s" : ""}`;

/**
 * Bâtiments du joueur en plus de l'atelier principal, lus avec le client du joueur (RLS : les
 * siens seulement) ; le nom vient du catalogue des bâtiments.
 * - Autres locaux (3D-7) : la table `workshops`, du plus ancien au plus récent ; le plus ancien est
 *   l'atelier principal (la société), les suivants sont dessinés à l'emplacement `local2`.
 * - Points de vente (AE-11) : la table `points_de_vente` (0038) ; le village dessine alors la
 *   boutique à la place du terrain.
 */
async function lireBatimentsDuJoueur(supabase: SupabaseClient, companyId: string): Promise<BatimentsDuJoueur> {
  const [locauxR, boutiquesR] = await Promise.all([
    supabase.from("workshops").select("id, batiment_id").eq("company_id", companyId).order("cree_le"),
    supabase.from("points_de_vente").select("id, batiment_id").eq("company_id", companyId).eq("statut", "actif").order("cree_le"),
  ]);
  const catalogue = chargerBatimentsV1();
  const nom = (batimentId: string | null, defaut: string) => catalogue.find((b) => b.id === batimentId)?.nom ?? defaut;
  const locaux = locauxR.error ? [] : ((locauxR.data ?? []) as { id: string; batiment_id: string | null }[]);
  const boutiques = boutiquesR.error ? [] : ((boutiquesR.data ?? []) as { id: string; batiment_id: string }[]);
  if (locaux.length <= 1 && boutiques.length === 0) return AUCUN_AUTRE_BATIMENT;
  return {
    locaux: locaux.slice(1).map((l) => ({ id: l.id, nom: nom(l.batiment_id, "Autre local") })),
    pointsDeVente: boutiques.map((p) => ({ id: p.id, nom: nom(p.batiment_id, "Ta boutique") })),
  };
}

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

  const batiments = await lireBatimentsDuJoueur(supabase, entreprise.id);

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
        { href: "/atelier-3d", libelle: "Entrer dans l'atelier" },
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
    ...batiments.locaux.map(
      (l): FicheActeur => ({
        id: idLocal(l),
        genre: "local2",
        nom: l.nom,
        surTitre: "Ta société · autre local",
        description: "Un autre local de ta société, en plus de l'atelier principal. Ses postes s'ajoutent à ta capacité de production.",
        faits: [],
        liens: [
          { href: `/atelier-3d?local=${l.id}`, libelle: "Entrer dans ce local" },
          { href: "/locaux", libelle: "Locaux" },
        ],
      }),
    ),
    ...batiments.pointsDeVente.map(
      (b): FicheActeur => ({
        id: idBoutique(b),
        genre: "boutique",
        nom: b.nom,
        surTitre: "Ta société · ton magasin",
        description: "Ton point de vente physique, ouvert sur le terrain du village.",
        faits: [],
        liens: [{ href: "/magasin", libelle: "Gérer le magasin" }],
      }),
    ),
    ...(batiments.pointsDeVente.length === 0
      ? [
          {
            id: "terrain",
            genre: "terrain",
            nom: "Terrain du futur magasin",
            surTitre: "Terrain à débloquer",
            description: "Ici pourra s'ouvrir ta boutique. Le magasin physique se débloque plus tard dans ta croissance.",
            faits: [],
            liens: [{ href: "/magasin", libelle: "Magasin physique" }],
          } satisfies FicheActeur,
        ]
      : []),
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
            {batiments.pointsDeVente.length === 0 ? (
              <Puce ton="alerte">Terrain à débloquer</Puce>
            ) : (
              <Puce ton="accent">Ton magasin</Puce>
            )}
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
