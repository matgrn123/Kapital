import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerParametresV1 } from "@kapital/content";
import {
  calculerVentesMois,
  centimes,
  prixHtDepuisTtc,
  tvaSurPrixTtc,
  type Entreprise,
  type Monde,
  type ProduitEntreprise,
  type VenteGeneree,
  idEntreprise,
  idProduit,
  moisJeu,
} from "@kapital/engine";

const TAUX_TVA_TEXTILE = 0.20;

type LigneCompanyProduit = {
  id: string;
  company_id: string;
  product_id: string;
  qualite_visee: number;
  prix_vente_directe_centimes: number;
  prix_revendeur_centimes: number;
  production_mensuelle_cible: number;
};

type LigneCompany = {
  id: string;
  nom: string;
  gamme: "entree" | "milieu" | "haut";
  etape: 0 | 1 | 2;
  statut: "active" | "en_difficulte" | "liquidee";
  tresorerie_centimes: number;
  owner_profile_id: string | null;
};

type LigneBrandState = {
  company_id: string;
  notoriete: number;
  desirabilite: number;
};

type LigneEcriture = {
  company_id: string;
  ecriture_id: string;
  mois_jeu: number;
  libelle: string;
  compte: string;
  sens: "debit" | "credit";
  montant_centimes: number;
};

type LigneWorld = {
  id: string;
  mois_courant: number;
};

export type ResultatAvancement = {
  readonly monde_id: string;
  readonly mois_debut: number;
  readonly mois_fin: number;
  readonly duree_mois: number;
  readonly ventes_generees: number;
  readonly ecritures_inserees: number;
};

function construireCatalogue(
  produits: readonly LigneCompanyProduit[],
): readonly ProduitEntreprise[] {
  return produits.map((p) => ({
    produit: idProduit(p.product_id),
    qualiteVisee: p.qualite_visee,
    prix: {
      vente_directe: centimes(p.prix_vente_directe_centimes),
      revendeur: centimes(p.prix_revendeur_centimes),
    },
    productionMensuelleCible: p.production_mensuelle_cible,
  }));
}

function construireEntreprise(
  company: LigneCompany,
  produits: readonly LigneCompanyProduit[],
  marque: LigneBrandState | undefined,
): Entreprise {
  return {
    id: idEntreprise(company.id),
    nom: company.nom,
    gamme: company.gamme,
    etape: company.etape,
    proprietaire: company.owner_profile_id
      ? { type: "joueur", idProfil: company.owner_profile_id }
      : { type: "pnj" },
    statut: company.statut,
    tresorerie: centimes(company.tresorerie_centimes),
    stocksMatiere: [],
    stocksFinis: [],
    salaries: [],
    atelier: null,
    marque: {
      notoriete: marque?.notoriete ?? 50,
      desirabilite: marque?.desirabilite ?? 50,
    },
    prets: [],
    catalogue: construireCatalogue(produits),
  };
}

function ecrituresPourVente(
  vente: VenteGeneree,
  moisJeu: number,
  ecritureId: string,
): LigneEcriture[] {
  const totalTtc = vente.prixUnitaireCentimes * vente.quantite;
  const prixHtUnitaire = prixHtDepuisTtc(
    vente.prixUnitaireCentimes,
    TAUX_TVA_TEXTILE,
  );
  const totalHt = prixHtUnitaire * vente.quantite;
  const totalTva = tvaSurPrixTtc(vente.prixUnitaireCentimes, TAUX_TVA_TEXTILE) *
    vente.quantite;
  const libelle = vente.canal === "vente_directe"
    ? `Vente directe ${vente.quantite} ${vente.produit}`
    : `Vente revendeur ${vente.quantite} ${vente.produit}`;

  const base = {
    company_id: vente.entreprise,
    ecriture_id: ecritureId,
    mois_jeu: moisJeu,
    libelle,
  };

  if (vente.canal === "vente_directe") {
    return [
      { ...base, compte: "512", sens: "debit", montant_centimes: totalTtc },
      { ...base, compte: "707", sens: "credit", montant_centimes: totalHt },
      { ...base, compte: "44571", sens: "credit", montant_centimes: totalTva },
    ];
  }
  // revendeur : HT, sans TVA sur la vente, creance client
  return [
    { ...base, compte: "411", sens: "debit", montant_centimes: totalHt },
    { ...base, compte: "707", sens: "credit", montant_centimes: totalHt },
  ];
}

export async function avancerMonde(
  supabase: SupabaseClient,
  dureeMoisForce?: number,
): Promise<ResultatAvancement> {
  const params = chargerParametresV1();

  const { data: mondes, error: errMonde } = await supabase
    .from("worlds")
    .select("id, mois_courant")
    .eq("etat", "actif")
    .limit(1);
  if (errMonde) throw new Error(`Lecture monde : ${errMonde.message}`);
  const monde = (mondes ?? [])[0] as LigneWorld | undefined;
  if (!monde) throw new Error("Aucun monde actif");

  const [companiesR, produitsR, marquesR] = await Promise.all([
    supabase
      .from("companies")
      .select("id, nom, gamme, etape, statut, tresorerie_centimes, owner_profile_id"),
    supabase
      .from("company_products")
      .select(
        "id, company_id, product_id, qualite_visee, prix_vente_directe_centimes, prix_revendeur_centimes, production_mensuelle_cible",
      ),
    supabase.from("brand_state").select("company_id, notoriete, desirabilite"),
  ]);

  if (companiesR.error) throw new Error(`companies : ${companiesR.error.message}`);
  if (produitsR.error) throw new Error(`company_products : ${produitsR.error.message}`);
  if (marquesR.error) throw new Error(`brand_state : ${marquesR.error.message}`);

  const companies = (companiesR.data ?? []) as LigneCompany[];
  const produits = (produitsR.data ?? []) as LigneCompanyProduit[];
  const marques = (marquesR.data ?? []) as LigneBrandState[];

  const produitsParCompany = new Map<string, LigneCompanyProduit[]>();
  for (const p of produits) {
    if (!produitsParCompany.has(p.company_id)) produitsParCompany.set(p.company_id, []);
    produitsParCompany.get(p.company_id)!.push(p);
  }
  const marqueParCompany = new Map(marques.map((m) => [m.company_id, m]));

  const entreprises: Entreprise[] = companies.map((c) =>
    construireEntreprise(
      c,
      produitsParCompany.get(c.id) ?? [],
      marqueParCompany.get(c.id),
    ),
  );

  const moisDebut = monde.mois_courant;
  const dureeMois = dureeMoisForce ?? 1;
  const moisFin = moisDebut + dureeMois;

  const mondeEngine: Monde = {
    moisCourant: moisJeu(moisDebut),
    entreprises,
    prixMatieres: [],
    franges: [],
    evenements: [],
  };

  const ventes = calculerVentesMois(mondeEngine, dureeMois, params);

  // Construire les ecritures et inserer en bloc
  const ecritures: LigneEcriture[] = [];
  for (const v of ventes) {
    const ecritureId = `vente_${moisFin}_${v.entreprise}_${v.produit}_${v.canal}`;
    ecritures.push(...ecrituresPourVente(v, moisFin, ecritureId));
  }

  if (ecritures.length > 0) {
    const { error: errInsert } = await supabase
      .from("ledger_entries")
      .insert(ecritures);
    if (errInsert) throw new Error(`insert ledger : ${errInsert.message}`);
  }

  // Mettre a jour tresorerie des entreprises (somme des encaissements vente directe)
  const encaissementsParEntreprise = new Map<string, number>();
  for (const v of ventes) {
    if (v.canal !== "vente_directe") continue;
    const total = v.prixUnitaireCentimes * v.quantite;
    encaissementsParEntreprise.set(
      v.entreprise,
      (encaissementsParEntreprise.get(v.entreprise) ?? 0) + total,
    );
  }
  for (const [compId, enc] of encaissementsParEntreprise) {
    const avant = companies.find((c) => c.id === compId);
    if (!avant) continue;
    const nouveau = avant.tresorerie_centimes + enc;
    await supabase
      .from("companies")
      .update({ tresorerie_centimes: nouveau })
      .eq("id", compId);
  }

  // Avancer le mois du monde
  const { error: errWorld } = await supabase
    .from("worlds")
    .update({ mois_courant: moisFin })
    .eq("id", monde.id);
  if (errWorld) throw new Error(`update world : ${errWorld.message}`);

  return {
    monde_id: monde.id,
    mois_debut: moisDebut,
    mois_fin: moisFin,
    duree_mois: dureeMois,
    ventes_generees: ventes.length,
    ecritures_inserees: ecritures.length,
  };
}

