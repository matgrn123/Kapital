import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerModulesV1, type TypeModule } from "@kapital/content";
import {
  centimes,
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
};

/** Modules posés lus en base, complétés par le catalogue modules-v1 (effet, prix, durée). */
export function modulesDepuisLignes(
  lignes: readonly LigneModulePose[] | null | undefined,
  catalogue: readonly TypeModule[],
): ModulePose[] {
  return resoudreModules(
    (lignes ?? []).map((m) => ({ id_type: m.module_type_id, x: m.x, y: m.y, pivote: m.pivote ?? false })),
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

// ---------------------------------------------------------------------------
// Adaptateur Supabase
// ---------------------------------------------------------------------------

type LigneCompany = {
  id: string;
  nom: string;
  gamme: "entree" | "milieu" | "haut";
  etape: 0 | 1 | 2;
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
    const [companyR, matR, pfR, empR, atelierR, pretsR, produitsR, marqueR, etatR, materielR] =
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
          .select("id, poste, salaire_brut_mensuel_centimes, anciennete_mois_debut, experience_mois_debut, mois_jeu_debut")
          .eq("company_id", companyId)
          .eq("statut", "actif"),
        this.supabase
          .from("workshops")
          .select("surface_m2, loyer_mensuel_centimes, depot_garantie_centimes, charges_mensuelles_centimes, mois_signature, mois_fin, mode_detention, prix_achat_centimes, apport_centimes, mois_achat, duree_amortissement_mois, placed_modules(module_type_id, x, y, pivote)")
          .eq("company_id", companyId)
          .maybeSingle(),
        this.supabase
          .from("loans")
          .select("id, capital_initial_centimes, capital_restant_centimes, taux_annuel, duree_mois, mois_jeu_debut, objet")
          .eq("company_id", companyId)
          .eq("statut", "actif"),
        this.supabase
          .from("company_products")
          .select(`product_id, qualite_visee, prix_vente_directe_centimes, prix_revendeur_centimes, production_mensuelle_cible, ${COLONNES_NOMENCLATURE}`)
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
          .select("compte, sens, montant_centimes")
          .eq("company_id", companyId)
          .in("compte", ["2154", "2815"]),
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
      id: string; poste: "artisan" | "encadrement"; salaire_brut_mensuel_centimes: number;
      anciennete_mois_debut: number; experience_mois_debut: number; mois_jeu_debut: number | null;
    }>;
    const workshop = verifier("workshops", atelierR) as {
      surface_m2: number; loyer_mensuel_centimes: number;
      placed_modules: LigneModulePose[] | null;
      depot_garantie_centimes: number; charges_mensuelles_centimes: number;
      mois_signature: number | null; mois_fin: number | null;
      mode_detention: string; prix_achat_centimes: number; apport_centimes: number;
      mois_achat: number | null; duree_amortissement_mois: number | null;
    } | null;
    const loans = (verifier("loans", pretsR) ?? []) as Array<{
      id: string; capital_initial_centimes: number; capital_restant_centimes: number;
      taux_annuel: number; duree_mois: number; mois_jeu_debut: number | null; objet: string | null;
    }>;
    const produits = (verifier("company_products", produitsR) ?? []) as Array<{
      product_id: string; qualite_visee: number; prix_vente_directe_centimes: number;
      prix_revendeur_centimes: number; production_mensuelle_cible: number;
      products: LigneProduitNomenclature | LigneProduitNomenclature[] | null;
    }>;
    const marque = verifier("brand_state", marqueR) as { notoriete: number; desirabilite: number } | null;
    const etat = verifier("etat_mois_entreprise", etatR) as { cumul: CumulMois } | null;
    const materiel = materielDepuisLedger(
      (verifier("ledger 2154 / 2815", materielR) ?? []) as Array<{ compte: string; sens: string; montant_centimes: number }>,
    );
    const modules = modulesDepuisLignes(workshop?.placed_modules, chargerModulesV1());

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
        return {
          id: idSalarie(e.id),
          poste: e.poste,
          salaireBrutMensuel: centimes(e.salaire_brut_mensuel_centimes),
          ancienneteMois: e.anciennete_mois_debut + dureeService,
          experienceMois: e.experience_mois_debut + dureeService,
        };
      }),
      atelier: workshop
        ? workshop.mode_detention === "bail"
          ? {
              surfaceM2: workshop.surface_m2,
              loyerMensuel: centimes(workshop.loyer_mensuel_centimes),
              modules,
              materiel,
              bail: {
                depotGarantie: centimes(Number(workshop.depot_garantie_centimes)),
                chargesMensuelles: centimes(Number(workshop.charges_mensuelles_centimes)),
                moisSignature: moisJeu(workshop.mois_signature ?? 0),
                moisFin: workshop.mois_fin === null ? null : moisJeu(workshop.mois_fin),
              },
            }
          : {
              // Local acheté à crédit (AE-6) : plus de loyer, une immobilisation à amortir.
              surfaceM2: workshop.surface_m2,
              loyerMensuel: centimes(0),
              modules,
              materiel,
              achat: {
                prixAchat: centimes(Number(workshop.prix_achat_centimes)),
                apport: centimes(Number(workshop.apport_centimes)),
                chargesMensuelles: centimes(Number(workshop.charges_mensuelles_centimes)),
                moisAchat: moisJeu(workshop.mois_achat ?? 0),
                dureeAmortissementMois: workshop.duree_amortissement_mois ?? 0,
              },
            }
        : null,
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
        },
        productionMensuelleCible: p.production_mensuelle_cible,
        ...(uneLigne(p.products) ? { fabrication: ficheDepuisLigne(uneLigne(p.products)!) } : {}),
      })),
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
    // IS : au dernier mois de l'exercice, résultat des mois déjà clos de cet exercice.
    const dernierMoisExercice = (moisEnCours + 1) % 12 === 0;
    const debut = debutExercice(moisEnCours);
    const lignesResultat =
      dernierMoisExercice && moisPrecedent >= debut
        ? await this.toutesLesLignes<{ compte: string; sens: string; montant_centimes: number }>(
            "ledger exercice",
            (de, a) =>
              this.supabase
                .from("ledger_entries")
                .select("compte, sens, montant_centimes")
                .eq("company_id", companyId)
                .gte("mois_jeu", debut)
                .lte("mois_jeu", moisPrecedent)
                .or("compte.like.6%,compte.like.7%")
                .order("id")
                .range(de, a),
          )
        : [];
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
              ),
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
    const { error } = await this.supabase.rpc("appliquer_pas_entreprise", {
      p_company_id: companyId,
      p_pas_attendu: pasAttendu,
      p_etat: chargeUtileDepuisLot(lot),
      p_nb_pas: nbPas,
    });
    if (error) {
      if (error.code === "KP409" || /pas_deja_traite/.test(error.message)) {
        throw new ErreurPasDejaTraite(error.message);
      }
      throw new Error(`appliquer_pas_entreprise ${companyId} : ${error.message}`);
    }
  }
}
