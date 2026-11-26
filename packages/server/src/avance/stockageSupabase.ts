import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerBatimentsV1, chargerModulesV1, type TypeBatiment, type TypeModule } from "@kapital/content";
import {
  centimes,
  type EtapeEntreprise,
  estEmplacementBoutique,
  passantsReferenceBoutiques,
  PREFIXE_AMORTISSEMENT_AGENCEMENT,
  type PointDeVente,
  type Poste,
  debutExercice,
  planComptableV1,
  resoudreModules,
  resultatDepuisLignes,
  tvaRestantDue,
  idEntreprise,
  idMatiere,
  idPret,
  estObjetPret,
  idProduit,
  idSalarie,
  moisJeu,
  montantFactureFaconnier,
  montantLivraisonMatiere,
  type Atelier,
  type CreanceAEncaisser,
  type CumulMois,
  type DetteFournisseurEchue,
  type DonneesFinMois,
  type Entreprise,
  type FicheFabrication,
  type MaterielAtelier,
  type ModulePose,
} from "@kapital/engine";
import {
  ErreurPasDejaTraite,
  type EntrepriseDuMonde,
  type EtatChargeEntreprise,
  type LivraisonsEnAttente,
  type MondeActif,
  type ResultatLotAEnregistrer,
  type StockageMonde,
} from "./port.js";
import { enregistrerEvenementsSupabase } from "../evenements/supabase.js";
import type { EvenementJournal } from "../evenements/types.js";

// ---------------------------------------------------------------------------
// Nomenclature des produits (table products), jointe aux commandes et au catalogue
// ---------------------------------------------------------------------------

type LigneProduitNomenclature = {
  matiere_id: string;
  consommation_par_piece: number;
  fournitures_par_piece_centimes: number;
  temps_standard_minutes: number;
};

const COLONNES_NOMENCLATURE =
  "products(matiere_id, consommation_par_piece, fournitures_par_piece_centimes, temps_standard_minutes)";

// ---------------------------------------------------------------------------
// 3D-3 : modules posés (placed_modules) et matériel au bilan (2154 / 2815)
// ---------------------------------------------------------------------------

export type LigneModulePose = {
  module_type_id: string;
  x: number;
  y: number;
  pivote: boolean | null;
  /** 3D-5 (migration 0037) : 'actif' (plan en service) ou 'prevu' (appliqué à la clôture). */
  statut?: string | null;
};

/**
 * Modules posés lus en base, complétés par le catalogue modules-v1 (effet, prix, durée).
 * 3D-5 : seul le plan en service (statut 'actif') compte ; le plan prévu attend la clôture.
 */
export function modulesDepuisLignes(
  lignes: readonly LigneModulePose[] | null | undefined,
  catalogue: readonly TypeModule[],
): ModulePose[] {
  return resoudreModules(
    (lignes ?? []).filter((m) => (m.statut ?? "actif") === "actif").map((m) => ({ id_type: m.module_type_id, x: m.x, y: m.y, pivote: m.pivote ?? false })),
    catalogue,
  );
}

/** Soldes 2154 (débit) et 2815 (crédit) à partir des lignes du grand livre. */
export function materielDepuisLedger(
  lignes: readonly { compte: string; sens: string; montant_centimes: number }[],
): MaterielAtelier {
  let brut = 0;
  let amorti = 0;
  for (const l of lignes) {
    const signe = l.sens === "debit" ? 1 : -1;
    if (l.compte === "2154") brut += signe * Number(l.montant_centimes);
    if (l.compte === "2815") amorti -= signe * Number(l.montant_centimes);
  }
  return { valeurBrute: centimes(brut), amortissementsCumules: centimes(amorti) };
}

/** Un local (table workshops) tel que chargerEtat le lit, avec ses modules posés. */
export type LigneWorkshop = {
  id: string;
  surface_m2: number;
  loyer_mensuel_centimes: number;
  placed_modules: LigneModulePose[] | null;
  depot_garantie_centimes: number;
  charges_mensuelles_centimes: number;
  mois_signature: number | null;
  mois_fin: number | null;
  mode_detention: string;
  prix_achat_centimes: number;
  apport_centimes: number;
  mois_achat: number | null;
  duree_amortissement_mois: number | null;
};

/**
 * 3D-7 : matériel au bilan (2154 / 2815) réparti entre les locaux. Une écriture dont l'identifiant
 * contient l'id d'un local lui revient (amenagement_<local>_…, amort_<mois>_<société>_<local>) ;
 * les autres (écritures d'avant 3D-7) reviennent au plus ancien local. Avec un seul local, il a
 * tout le matériel, exactement comme avant.
 */
export function materielParLocal(
  lignes: readonly { ecriture_id?: string | null; compte: string; sens: string; montant_centimes: number }[],
  idsLocaux: readonly string[],
): Map<string, MaterielAtelier> {
  const parLocal = new Map<string, typeof lignes[number][]>(idsLocaux.map((id) => [id, []]));
  const premier = idsLocaux[0];
  if (premier === undefined) return new Map();
  for (const l of lignes) {
    const id = idsLocaux.find((w) => (l.ecriture_id ?? "").includes(w)) ?? premier;
    parLocal.get(id)!.push(l);
  }
  return new Map([...parLocal].map(([id, ls]) => [id, materielDepuisLedger(ls)]));
}

/** Un local lu en base, pour le moteur : loué (bail) ou acheté (AE-6). */
export function atelierDepuisLigne(w: LigneWorkshop, modules: ModulePose[], materiel: MaterielAtelier): Atelier {
  if (w.mode_detention === "bail") {
    return {
      id: w.id,
      surfaceM2: w.surface_m2,
      loyerMensuel: centimes(w.loyer_mensuel_centimes),
      modules,
      materiel,
      bail: {
        depotGarantie: centimes(Number(w.depot_garantie_centimes)),
        chargesMensuelles: centimes(Number(w.charges_mensuelles_centimes)),
        moisSignature: moisJeu(w.mois_signature ?? 0),
        moisFin: w.mois_fin === null ? null : moisJeu(w.mois_fin),
      },
    };
  }
  // Local acheté à crédit (AE-6) : plus de loyer, une immobilisation à amortir.
  return {
    id: w.id,
    surfaceM2: w.surface_m2,
    loyerMensuel: centimes(0),
    modules,
    materiel,
    achat: {
      prixAchat: centimes(Number(w.prix_achat_centimes)),
      apport: centimes(Number(w.apport_centimes)),
      chargesMensuelles: centimes(Number(w.charges_mensuelles_centimes)),
      moisAchat: moisJeu(w.mois_achat ?? 0),
      dureeAmortissementMois: w.duree_amortissement_mois ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// AE-10 : boutiques (points_de_vente, stock_boutique), migration 0038
// ---------------------------------------------------------------------------

export type LignePointDeVente = {
  id: string;
  batiment_id: string;
  surface_m2: number;
  loyer_mensuel_centimes: number;
  charges_mensuelles_centimes: number;
  depot_garantie_centimes: number;
  travaux_centimes: number;
  duree_amortissement_mois: number;
  mois_signature: number;
  mois_ouverture: number;
  stock_boutique: { product_id: string; quantite_pieces: number; valeur_totale_centimes: number }[] | null;
};

/**
 * Boutiques lues en base, complétées par le catalogue (passants, bonus de désirabilité) et par
 * les amortissements déjà passés (écritures 28135 « boutique_amort_<mois>_<id> » de chacune).
 */
export function pointsDeVenteDepuisLignes(
  lignes: readonly LignePointDeVente[] | null | undefined,
  amortissements: readonly { ecriture_id: string; sens: string; montant_centimes: number }[],
  catalogue: readonly TypeBatiment[],
): PointDeVente[] {
  if (!lignes || lignes.length === 0) return [];
  const reference = passantsReferenceBoutiques(catalogue);
  return lignes.map((l) => {
    const b = catalogue.find((x) => x.id === l.batiment_id);
    const effet = b && estEmplacementBoutique(b) ? b.effet : null;
    let amorti = 0;
    for (const a of amortissements) {
      if (!a.ecriture_id.startsWith(PREFIXE_AMORTISSEMENT_AGENCEMENT) || !a.ecriture_id.endsWith(`_${l.id}`)) continue;
      amorti += a.sens === "credit" ? Number(a.montant_centimes) : -Number(a.montant_centimes);
    }
    return {
      id: l.id,
      batimentId: l.batiment_id,
      surfaceM2: l.surface_m2,
      loyerMensuel: centimes(Number(l.loyer_mensuel_centimes)),
      chargesMensuelles: centimes(Number(l.charges_mensuelles_centimes)),
      depotGarantie: centimes(Number(l.depot_garantie_centimes)),
      moisSignature: moisJeu(l.mois_signature),
      moisOuverture: moisJeu(l.mois_ouverture),
      agencement: {
        valeurBrute: centimes(Number(l.travaux_centimes)),
        amortissementsCumules: centimes(amorti),
        dureeAmortissementMois: l.duree_amortissement_mois,
      },
      // Emplacement retiré du catalogue : la boutique vend encore (référence), sans bonus.
      passantsParJour: effet?.passants_par_jour ?? reference,
      passantsReference: reference,
      bonusDesirabiliteParMois: effet?.bonus_desirabilite_points_par_mois ?? 0,
      stock: (l.stock_boutique ?? []).map((s) => ({
        produit: idProduit(s.product_id),
        quantite: s.quantite_pieces,
        valeurTotale: centimes(Number(s.valeur_totale_centimes)),
      })),
    };
  });
}

/** Avant la migration 0038, la table points_de_vente n'existe pas : aucune boutique. */
function tableAbsente(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /points_de_vente|stock_boutique/.test(error.message);
}

/** Une jointure PostgREST rend un objet, parfois une liste d'un élément. */
function uneLigne<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export function ficheDepuisLigne(p: LigneProduitNomenclature): FicheFabrication {
  return {
    matiere: idMatiere(p.matiere_id),
    consommationParPiece: Number(p.consommation_par_piece),
    fournituresParPiece: centimes(Number(p.fournitures_par_piece_centimes)),
    tempsStandardMinutes: Number(p.temps_standard_minutes),
  };
}

// ---------------------------------------------------------------------------
// Contrat avec la fonction Postgres appliquer_pas_entreprise (migration 0020, remplacée par 0025 puis 0027)
// ---------------------------------------------------------------------------

/** Charge utile JSON de la fonction Postgres : les clés doivent rester celles du SQL. */
export type ChargeUtilePas = {
  readonly ecritures: readonly {
    readonly ecriture_id: string;
    readonly mois_jeu: number;
    readonly libelle: string;
    readonly compte: string;
    readonly sens: "debit" | "credit";
    readonly montant_centimes: number;
  }[];
  readonly stocks_matiere: readonly {
    readonly material_id: string;
    readonly quantite: number;
    readonly valeur_totale_centimes: number;
  }[];
  readonly stocks_finis: readonly {
    readonly product_id: string;
    readonly quantite_pieces: number;
    readonly valeur_totale_centimes: number;
  }[];
  /** AE-10 : stocks des boutiques (lus par appliquer_pas_boutique, migration 0038). */
  readonly stocks_boutique?: readonly {
    readonly point_de_vente_id: string;
    readonly product_id: string;
    readonly quantite_pieces: number;
    readonly valeur_totale_centimes: number;
  }[];
  readonly prets: readonly { readonly id: string; readonly capital_restant_centimes: number }[];
  readonly echeances_payees: readonly { readonly loan_id: string; readonly numero: number }[];
  readonly marque: { readonly notoriete: number; readonly desirabilite: number };
  readonly entreprise: {
    readonly statut: string;
    readonly mois_decouvert_consecutifs?: number;
    /** Étape constatée (migration 0025 : la base ne la fait jamais redescendre). */
    readonly etape: number;
    readonly pieces_vendues_total: number;
    readonly chiffre_affaires_cumule_ht_centimes: number;
  };
  readonly commandes_matiere_livrees: readonly string[];
  readonly ordres_faconnier_livres: readonly string[];
  readonly cumul: CumulMois | null;
};

export function chargeUtileDepuisLot(lot: ResultatLotAEnregistrer): ChargeUtilePas {
  const e = lot.entreprise;
  return {
    ecritures: lot.ecritures.flatMap((ec) =>
      ec.lignes.map((l) => ({
        ecriture_id: ec.id,
        mois_jeu: ec.mois,
        libelle: ec.libelle,
        compte: l.compte,
        sens: l.sens,
        montant_centimes: l.montant,
      })),
    ),
    stocks_matiere: e.stocksMatiere.map((s) => ({
      material_id: s.matiere as string,
      quantite: s.quantite,
      valeur_totale_centimes: s.valeurTotale,
    })),
    stocks_finis: e.stocksFinis.map((s) => ({
      product_id: s.produit as string,
      quantite_pieces: s.quantite,
      valeur_totale_centimes: s.valeurTotale,
    })),
    ...(e.pointsDeVente && e.pointsDeVente.length > 0
      ? {
          stocks_boutique: e.pointsDeVente.flatMap((pdv) =>
            pdv.stock.map((s) => ({
              point_de_vente_id: pdv.id,
              product_id: s.produit as string,
              quantite_pieces: s.quantite,
              valeur_totale_centimes: s.valeurTotale,
            })),
          ),
        }
      : {}),
    prets: e.prets.map((p) => ({
      id: p.id as string,
      capital_restant_centimes: p.capitalRestant,
    })),
    echeances_payees: lot.echeancesPayees.map((p) => ({ loan_id: p.pretId, numero: p.numero })),
    marque: { notoriete: e.marque.notoriete, desirabilite: e.marque.desirabilite },
    entreprise: {
      statut: e.statut,
      ...(lot.moisDecouvertConsecutifs === null
        ? {}
        : { mois_decouvert_consecutifs: lot.moisDecouvertConsecutifs }),
      etape: e.etape,
      pieces_vendues_total: e.cumulsEtape?.piecesVendues ?? 0,
      chiffre_affaires_cumule_ht_centimes: e.cumulsEtape?.chiffreAffairesHt ?? 0,
    },
    commandes_matiere_livrees: lot.commandesMatiereLivrees,
    ordres_faconnier_livres: lot.ordresFaconnierLivres,
    cumul: lot.cumul,
  };
}

/** Fonction Postgres du pas : celle des boutiques seulement quand la société en a une (0038). */
export function fonctionDePas(etat: ChargeUtilePas): "appliquer_pas_entreprise" | "appliquer_pas_boutique" {
  return etat.stocks_boutique === undefined ? "appliquer_pas_entreprise" : "appliquer_pas_boutique";
}

// ---------------------------------------------------------------------------
// Adaptateur Supabase
// ---------------------------------------------------------------------------

type LigneCompany = {
  id: string;
  nom: string;
  gamme: "entree" | "milieu" | "haut";
  etape: EtapeEntreprise;
  statut: "active" | "en_difficulte" | "liquidee";
  tresorerie_centimes: number;
  owner_profile_id: string | null;
  mois_decouvert_consecutifs: number;
  pieces_vendues_total: number;
  chiffre_affaires_cumule_ht_centimes: number;
};

function verifier<T>(nom: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${nom} : ${r.error.message}`);
  return r.data as T;
}

/** Nomenclature à sortir du stock du joueur à la livraison d'un façonnier ; null s'il fournit tout. */
function matiereDuJoueur(
  faconnier: { fournit_matiere: boolean } | { fournit_matiere: boolean }[] | null,
  produit: LigneProduitNomenclature | LigneProduitNomenclature[] | null,
  productId: string,
): FicheFabrication | null {
  if (uneLigne(faconnier)?.fournit_matiere === true) return null;
  const p = uneLigne(produit);
  if (!p) throw new Error(`Nomenclature introuvable pour le produit ${productId}.`);
  return ficheDepuisLigne(p);
}

export class StockageSupabase implements StockageMonde {
  constructor(private readonly supabase: SupabaseClient) {}

  async chargerMondeActif(): Promise<MondeActif | null> {
    const r = await this.supabase
      .from("worlds")
      .select("id, mois_courant, debut_reel")
      .eq("etat", "actif")
      .limit(1);
    const lignes = verifier("worlds", r) as
      | { id: string; mois_courant: number; debut_reel: string | null }[]
      | null;
    const monde = (lignes ?? [])[0];
    if (!monde) return null;
    return {
      id: monde.id,
      moisCourant: monde.mois_courant,
      debutReelMs: monde.debut_reel === null ? null : Date.parse(monde.debut_reel),
    };
  }

  async definirDebutReel(mondeId: string, debutReelMs: number): Promise<void> {
    verifier(
      "worlds.debut_reel",
      await this.supabase
        .from("worlds")
        .update({ debut_reel: new Date(debutReelMs).toISOString() })
        .eq("id", mondeId),
    );
  }

  async definirMoisCourant(mondeId: string, mois: number): Promise<void> {
    verifier(
      "worlds.mois_courant",
      await this.supabase.from("worlds").update({ mois_courant: mois }).eq("id", mondeId),
    );
  }

  async listerEntreprises(mondeId: string): Promise<readonly EntrepriseDuMonde[]> {
    const lignes = verifier(
      "companies",
      await this.supabase
        .from("companies")
        .select("id, pas_traites")
        .eq("world_id", mondeId)
        .neq("statut", "liquidee")
        .order("id"),
    ) as { id: string; pas_traites: number | null }[] | null;
    return (lignes ?? []).map((l) => ({ id: l.id, pasTraites: l.pas_traites }));
  }

  async demarrerEntreprise(companyId: string, pas: number, cumul: CumulMois | null): Promise<void> {
    // Seulement si elle n'a pas encore démarré : un autre traitement a pu passer avant nous.
    verifier(
      "companies.pas_traites",
      await this.supabase
        .from("companies")
        .update({ pas_traites: pas })
        .eq("id", companyId)
        .is("pas_traites", null),
    );
    if (cumul !== null) {
      verifier(
        "etat_mois_entreprise",
        await this.supabase
          .from("etat_mois_entreprise")
          .upsert({ company_id: companyId, mois: cumul.mois, cumul }, { onConflict: "company_id" }),
      );
    }
  }

  async chargerEtat(companyId: string, moisEnCours: number): Promise<EtatChargeEntreprise> {
    const [companyR, matR, pfR, empR, atelierR, pretsR, produitsR, marqueR, etatR, materielR, boutiquesR, amortBoutiqueR] =
      await Promise.all([
        this.supabase
          .from("companies")
          .select("id, nom, gamme, etape, statut, tresorerie_centimes, owner_profile_id, mois_decouvert_consecutifs, pieces_vendues_total, chiffre_affaires_cumule_ht_centimes")
          .eq("id", companyId)
          .maybeSingle(),
        this.supabase
          .from("material_stock")
          .select("material_id, quantite, valeur_totale_centimes")
          .eq("company_id", companyId),
        this.supabase
          .from("product_stock")
          .select("product_id, quantite_pieces, valeur_totale_centimes")
          .eq("company_id", companyId),
        this.supabase
          .from("employees")
          .select("id, poste, salaire_brut_mensuel_centimes, anciennete_mois_debut, experience_mois_debut, mois_jeu_debut, cree_le")
          .eq("company_id", companyId)
          .eq("statut", "actif"),
        this.supabase
          .from("workshops")
          .select("id, surface_m2, loyer_mensuel_centimes, depot_garantie_centimes, charges_mensuelles_centimes, mois_signature, mois_fin, mode_detention, prix_achat_centimes, apport_centimes, mois_achat, duree_amortissement_mois, placed_modules(module_type_id, x, y, pivote, statut)")
          .eq("company_id", companyId)
          // 3D-7 : tous les locaux de la société, du plus ancien au plus récent.
          .order("cree_le")
          .order("id"),
        this.supabase
          .from("loans")
          .select("id, capital_initial_centimes, capital_restant_centimes, taux_annuel, duree_mois, mois_jeu_debut, objet")
          .eq("company_id", companyId)
          .eq("statut", "actif"),
        this.supabase
          .from("company_products")
          // « * » : prix_boutique_centimes (0038) est lu quand la colonne existe, sans casser avant.
          .select(`*, ${COLONNES_NOMENCLATURE}`)
          .eq("company_id", companyId),
        this.supabase
          .from("brand_state")
          .select("notoriete, desirabilite")
          .eq("company_id", companyId)
          .maybeSingle(),
        this.supabase
          .from("etat_mois_entreprise")
          .select("cumul")
          .eq("company_id", companyId)
          .maybeSingle(),
        this.supabase
          .from("ledger_entries")
          .select("ecriture_id, compte, sens, montant_centimes")
          .eq("company_id", companyId)
          .in("compte", ["2154", "2815"]),
        this.supabase
          .from("points_de_vente")
          .select("id, batiment_id, surface_m2, loyer_mensuel_centimes, charges_mensuelles_centimes, depot_garantie_centimes, travaux_centimes, duree_amortissement_mois, mois_signature, mois_ouverture, stock_boutique(product_id, quantite_pieces, valeur_totale_centimes)")
          .eq("company_id", companyId)
          .eq("statut", "actif")
          .order("cree_le"),
        this.supabase
          .from("ledger_entries")
          .select("ecriture_id, sens, montant_centimes")
          .eq("company_id", companyId)
          .eq("compte", "28135"),
      ]);

    const company = verifier("companies", companyR) as LigneCompany | null;
    if (!company) throw new Error(`entreprise introuvable : ${companyId}`);
    const matStocks = (verifier("material_stock", matR) ?? []) as Array<{
      material_id: string; quantite: number; valeur_totale_centimes: number;
    }>;
    const pfStocks = (verifier("product_stock", pfR) ?? []) as Array<{
      product_id: string; quantite_pieces: number; valeur_totale_centimes: number;
    }>;
    const employees = (verifier("employees", empR) ?? []) as Array<{
      id: string; poste: Poste; salaire_brut_mensuel_centimes: number;
      anciennete_mois_debut: number; experience_mois_debut: number; mois_jeu_debut: number | null;
      cree_le?: string | null;
    }>;
    const workshops = (verifier("workshops", atelierR) ?? []) as LigneWorkshop[];
    const loans = (verifier("loans", pretsR) ?? []) as Array<{
      id: string; capital_initial_centimes: number; capital_restant_centimes: number;
      taux_annuel: number; duree_mois: number; mois_jeu_debut: number | null; objet: string | null;
    }>;
    const produits = (verifier("company_products", produitsR) ?? []) as Array<{
      product_id: string; qualite_visee: number; prix_vente_directe_centimes: number;
      prix_revendeur_centimes: number; production_mensuelle_cible: number;
      prix_boutique_centimes?: number | null;
      products: LigneProduitNomenclature | LigneProduitNomenclature[] | null;
    }>;
    const marque = verifier("brand_state", marqueR) as { notoriete: number; desirabilite: number } | null;
    const etat = verifier("etat_mois_entreprise", etatR) as { cumul: CumulMois } | null;
    const materiels = materielParLocal(
      (verifier("ledger 2154 / 2815", materielR) ?? []) as Array<{ ecriture_id: string; compte: string; sens: string; montant_centimes: number }>,
      workshops.map((w) => w.id),
    );
    const catalogueModules = chargerModulesV1();
    // 3D-7 : chaque local avec ses modules en service (statut 'actif') et sa part du matériel.
    const ateliers = workshops.map((w) =>
      atelierDepuisLigne(w, modulesDepuisLignes(w.placed_modules, catalogueModules), materiels.get(w.id)!),
    );
    // AE-10 : boutiques (aucune tant que la migration 0038 n'est pas appliquée).
    const lignesBoutiques = tableAbsente(boutiquesR.error)
      ? []
      : ((verifier("points_de_vente", boutiquesR) ?? []) as LignePointDeVente[]);
    const pointsDeVente = pointsDeVenteDepuisLignes(
      lignesBoutiques,
      lignesBoutiques.length === 0
        ? []
        : ((verifier("ledger 28135", amortBoutiqueR) ?? []) as Array<{ ecriture_id: string; sens: string; montant_centimes: number }>),
      chargerBatimentsV1(),
    );

    const entreprise: Entreprise = {
      id: idEntreprise(company.id),
      nom: company.nom,
      gamme: company.gamme,
      etape: company.etape,
      cumulsEtape: {
        piecesVendues: Number(company.pieces_vendues_total),
        chiffreAffairesHt: centimes(Number(company.chiffre_affaires_cumule_ht_centimes)),
      },
      proprietaire: company.owner_profile_id
        ? { type: "joueur", idProfil: company.owner_profile_id }
        : { type: "pnj" },
      statut: company.statut,
      tresorerie: centimes(company.tresorerie_centimes),
      stocksMatiere: matStocks.map((s) => ({
        matiere: idMatiere(s.material_id),
        quantite: Number(s.quantite),
        valeurTotale: centimes(s.valeur_totale_centimes),
      })),
      stocksFinis: pfStocks.map((s) => ({
        produit: idProduit(s.product_id),
        quantite: s.quantite_pieces,
        valeurTotale: centimes(s.valeur_totale_centimes),
      })),
      salaries: employees.map((e) => {
        const dureeService = Math.max(0, moisEnCours - (e.mois_jeu_debut ?? 0));
        // Rendement : expérience en jours depuis l'embauche (horloge réelle, rendement_tau_jours).
        // cree_le est un instant réel ; en production worlds.debut_reel = 1er janvier 1970, il se
        // confond avec l'heure du jeu (l'outil « avancer le temps » de la recette l'en écarte).
        const embaucheMs = e.cree_le ? Date.parse(e.cree_le) : Number.NaN;
        return {
          id: idSalarie(e.id),
          poste: e.poste,
          salaireBrutMensuel: centimes(e.salaire_brut_mensuel_centimes),
          ancienneteMois: e.anciennete_mois_debut + dureeService,
          experienceMois: e.experience_mois_debut + dureeService,
          ...(Number.isFinite(embaucheMs) ? { embaucheMs } : {}),
        };
      }),
      ateliers,
      marque: { notoriete: marque?.notoriete ?? 50, desirabilite: marque?.desirabilite ?? 50 },
      prets: loans.map((l) => ({
        id: idPret(l.id),
        capitalInitial: centimes(l.capital_initial_centimes),
        capitalRestant: centimes(l.capital_restant_centimes),
        tauxAnnuel: l.taux_annuel,
        dureeTotaleMois: l.duree_mois,
        objet: estObjetPret(l.objet) ? l.objet : "tresorerie",
        moisDebut: moisJeu(l.mois_jeu_debut ?? 1),
      })),
      catalogue: produits.map((p) => ({
        produit: idProduit(p.product_id),
        qualiteVisee: p.qualite_visee,
        prix: {
          vente_directe: centimes(p.prix_vente_directe_centimes),
          revendeur: centimes(p.prix_revendeur_centimes),
          // AE-10 : null ou absent (avant 0038) = prix de la vente directe.
          ...(p.prix_boutique_centimes == null ? {} : { boutique: centimes(Number(p.prix_boutique_centimes)) }),
        },
        productionMensuelleCible: p.production_mensuelle_cible,
        ...(uneLigne(p.products) ? { fabrication: ficheDepuisLigne(uneLigne(p.products)!) } : {}),
      })),
      ...(pointsDeVente.length > 0 ? { pointsDeVente } : {}),
    };
    return { entreprise, cumul: etat?.cumul ?? null };
  }

  async chargerLivraisons(companyId: string, avantMs: number): Promise<LivraisonsEnAttente> {
    const avant = new Date(avantMs).toISOString();
    const [poR, prodR] = await Promise.all([
      this.supabase
        .from("purchase_orders")
        .select("id, material_id, quantite, prix_unitaire_centimes, instant_livraison_prevue")
        .eq("company_id", companyId)
        .eq("statut", "en_cours")
        .lt("instant_livraison_prevue", avant),
      this.supabase
        .from("production_orders")
        .select(`id, product_id, quantite, prix_facon_par_piece_centimes, instant_livraison_prevue, faconniers(fournit_matiere), ${COLONNES_NOMENCLATURE}`)
        .eq("company_id", companyId)
        .eq("lieu_type", "faconnier")
        .eq("statut", "en_cours")
        .lt("instant_livraison_prevue", avant),
    ]);
    const po = (verifier("purchase_orders", poR) ?? []) as Array<{
      id: string; material_id: string; quantite: number; prix_unitaire_centimes: number;
      instant_livraison_prevue: string;
    }>;
    const prod = (verifier("production_orders", prodR) ?? []) as Array<{
      id: string; product_id: string; quantite: number; prix_facon_par_piece_centimes: number | null;
      instant_livraison_prevue: string;
      faconniers: { fournit_matiere: boolean } | { fournit_matiere: boolean }[] | null;
      products: LigneProduitNomenclature | LigneProduitNomenclature[] | null;
    }>;
    return {
      matiere: po.map((c) => ({
        id: c.id,
        matiere: idMatiere(c.material_id),
        quantite: Number(c.quantite),
        prixUnitaire: centimes(c.prix_unitaire_centimes),
        modePaiement: "credit" as const, // fournisseurs à crédit par défaut
        instantMs: Date.parse(c.instant_livraison_prevue),
      })),
      faconniers: prod
        .filter((o) => o.prix_facon_par_piece_centimes != null)
        .map((o) => ({
          id: o.id,
          produit: idProduit(o.product_id),
          quantite: o.quantite,
          prixFaconParPiece: centimes(o.prix_facon_par_piece_centimes!),
          // Le façonnier travaille la matière du joueur, sauf s'il fournit tout (grossiste).
          matiereDuJoueur: matiereDuJoueur(o.faconniers, o.products, o.product_id),
          instantMs: Date.parse(o.instant_livraison_prevue),
        })),
    };
  }

  async chargerDettesEchues(
    companyId: string,
    moisEnCours: number,
  ): Promise<readonly DetteFournisseurEchue[]> {
    const [poR, prodR] = await Promise.all([
      this.supabase
        .from("purchase_orders")
        .select("id, quantite, prix_unitaire_centimes, mois_jeu_livraison, suppliers(delai_paiement_mois)")
        .eq("company_id", companyId)
        .eq("statut", "livree")
        .is("mois_jeu_reglement", null),
      this.supabase
        .from("production_orders")
        .select(`id, product_id, quantite, prix_facon_par_piece_centimes, mois_jeu_livraison, fournitures_facturees, faconniers(delai_paiement_mois, fournit_matiere), ${COLONNES_NOMENCLATURE}`)
        .eq("company_id", companyId)
        .eq("lieu_type", "faconnier")
        .eq("statut", "livree")
        .is("mois_jeu_reglement", null),
    ]);
    type Delai = { delai_paiement_mois: number };
    const po = (verifier("purchase_orders (dettes)", poR) ?? []) as Array<{
      id: string; quantite: number; prix_unitaire_centimes: number; mois_jeu_livraison: number | null;
      suppliers: Delai | Delai[] | null;
    }>;
    type Fac = { delai_paiement_mois: number; fournit_matiere: boolean };
    const prod = (verifier("production_orders (dettes)", prodR) ?? []) as Array<{
      id: string; product_id: string; quantite: number; prix_facon_par_piece_centimes: number | null;
      mois_jeu_livraison: number | null; fournitures_facturees: boolean;
      faconniers: Fac | Fac[] | null;
      products: LigneProduitNomenclature | LigneProduitNomenclature[] | null;
    }>;
    // Échéance = mois de livraison + délai de paiement. Une commande ancienne sans mois de
    // livraison connu est considérée comme due tout de suite.
    const echue = (moisLivraison: number | null, delai: number | undefined): boolean =>
      (moisLivraison ?? 0) + (delai ?? 0) <= moisEnCours;
    const dettes: DetteFournisseurEchue[] = [];
    for (const c of po) {
      if (!echue(c.mois_jeu_livraison, uneLigne(c.suppliers)?.delai_paiement_mois)) continue;
      dettes.push({
        ordreId: c.id,
        nature: "matiere",
        montant: montantLivraisonMatiere(Number(c.quantite), centimes(c.prix_unitaire_centimes)),
      });
    }
    for (const o of prod) {
      if (o.prix_facon_par_piece_centimes == null) continue;
      if (!echue(o.mois_jeu_livraison, uneLigne(o.faconniers)?.delai_paiement_mois)) continue;
      // Même calcul qu'à la livraison : façon + fournitures (si elles ont été facturées).
      const fiche = o.fournitures_facturees
        ? matiereDuJoueur(o.faconniers, o.products, o.product_id)
        : null;
      dettes.push({
        ordreId: o.id,
        nature: "faconnier",
        montant: montantFactureFaconnier(o.quantite, centimes(o.prix_facon_par_piece_centimes), fiche),
      });
    }
    return dettes;
  }

  async chargerCreances(companyId: string, moisEnCours: number): Promise<readonly CreanceAEncaisser[]> {
    const moisDesCreances = moisEnCours - 2;
    if (moisDesCreances < 0) return [];
    const lignes = (verifier(
      "ledger 411",
      await this.supabase
        .from("ledger_entries")
        .select("ecriture_id, sens, montant_centimes")
        .eq("company_id", companyId)
        .eq("compte", "411")
        .eq("mois_jeu", moisDesCreances),
    ) ?? []) as Array<{ ecriture_id: string; sens: string; montant_centimes: number }>;
    const soldes = new Map<string, number>();
    for (const l of lignes) {
      soldes.set(l.ecriture_id, (soldes.get(l.ecriture_id) ?? 0) + (l.sens === "debit" ? l.montant_centimes : -l.montant_centimes));
    }
    return [...soldes.entries()]
      .filter(([, solde]) => solde > 0)
      .map(([ecritureId, solde]) => ({ ecritureId, montant: centimes(solde) }));
  }

  /** Toutes les lignes d'une requête du grand livre, page par page (Supabase rend 1 000 lignes au plus). */
  private async toutesLesLignes<T>(
    nom: string,
    requete: (de: number, a: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ): Promise<T[]> {
    const PAGE = 1000;
    const lignes: T[] = [];
    for (let de = 0; ; de += PAGE) {
      const page = (verifier(nom, await requete(de, de + PAGE - 1)) ?? []) as T[];
      lignes.push(...page);
      if (page.length < PAGE) return lignes;
    }
  }

  async chargerFinDeMois(companyId: string, moisEnCours: number): Promise<DonneesFinMois> {
    const moisPrecedent = moisEnCours - 1;
    // TVA : ce qui reste dû au 44551 à la fin du mois précédent (déclarations moins paiements).
    const lignesTva =
      moisPrecedent >= 0
        ? await this.toutesLesLignes<{ sens: string; montant_centimes: number }>("ledger 44551", (de, a) =>
            this.supabase
              .from("ledger_entries")
              .select("sens, montant_centimes")
              .eq("company_id", companyId)
              .eq("compte", "44551")
              .lte("mois_jeu", moisPrecedent)
              .order("id")
              .range(de, a),
          )
        : [];
    // IS : au dernier mois de l'exercice, résultat de l'exercice lu dans le grand livre, mois en
    // cours compris, moins ce que les pas de ce mois ont déjà compté (cumul.agregats, que la
    // clôture ajoute elle-même). Une écriture passée par une route pendant le mois (publicité 623,
    // par exemple) entre ainsi dans la base de l'impôt, sans compter deux fois celles des pas.
    const dernierMoisExercice = (moisEnCours + 1) % 12 === 0;
    const debut = debutExercice(moisEnCours);
    const lignesResultat = dernierMoisExercice
      ? await this.toutesLesLignes<{ compte: string; sens: string; montant_centimes: number }>(
          "ledger exercice",
          (de, a) =>
            this.supabase
              .from("ledger_entries")
              .select("compte, sens, montant_centimes")
              .eq("company_id", companyId)
              .gte("mois_jeu", debut)
              .lte("mois_jeu", moisEnCours)
              .or("compte.like.6%,compte.like.7%")
              .order("id")
              .range(de, a),
        )
      : [];
    const etatDuMois = dernierMoisExercice
      ? (verifier(
          "etat_mois_entreprise (fin de mois)",
          await this.supabase
            .from("etat_mois_entreprise")
            .select("cumul")
            .eq("company_id", companyId)
            .maybeSingle(),
        ) as { cumul: CumulMois | null } | null)
      : null;
    // Un état d'un autre mois (resté d'un mois clos) ne compte pas : aucun pas de ce mois en base.
    const cumulDuMois = etatDuMois?.cumul?.mois === moisEnCours ? etatDuMois.cumul : null;
    const resultatDejaCompteParLesPas =
      (cumulDuMois?.agregats?.produits ?? 0) - (cumulDuMois?.agregats?.charges ?? 0);
    const companyR = await this.supabase
      .from("companies")
      .select("mois_decouvert_consecutifs")
      .eq("id", companyId)
      .maybeSingle();
    const company = verifier("companies", companyR) as { mois_decouvert_consecutifs: number } | null;
    return {
      tvaAPayerCeMois: centimes(
        tvaRestantDue(lignesTva.map((l) => ({ sens: l.sens, montant: Number(l.montant_centimes) }))),
      ),
      moisDecouvertConsecutifs: company?.mois_decouvert_consecutifs ?? 0,
      ...(dernierMoisExercice
        ? {
            resultatExerciceAvantMois: centimes(
              resultatDepuisLignes(
                lignesResultat.map((l) => ({ compte: l.compte, sens: l.sens, montant: Number(l.montant_centimes) })),
                planComptableV1().comptes,
              ) - resultatDejaCompteParLesPas,
            ),
          }
        : {}),
    };
  }

  async appliquerPas(
    companyId: string,
    pasAttendu: number,
    nbPas: number,
    lot: ResultatLotAEnregistrer,
  ): Promise<void> {
    const etat = chargeUtileDepuisLot(lot);
    // AE-10 : une société avec boutique passe par appliquer_pas_boutique (0038), qui appelle
    // appliquer_pas_entreprise puis enregistre les stocks des boutiques, dans la même transaction.
    const fonction = fonctionDePas(etat);
    const { error } = await this.supabase.rpc(fonction, {
      p_company_id: companyId,
      p_pas_attendu: pasAttendu,
      p_etat: etat,
      p_nb_pas: nbPas,
    });
    if (error) {
      if (error.code === "KP409" || /pas_deja_traite/.test(error.message)) {
        throw new ErreurPasDejaTraite(error.message);
      }
      throw new Error(`${fonction} ${companyId} : ${error.message}`);
    }
  }

  async enregistrerEvenements(companyId: string, evenements: readonly EvenementJournal[]): Promise<void> {
    await enregistrerEvenementsSupabase(this.supabase, companyId, evenements);
  }
}
