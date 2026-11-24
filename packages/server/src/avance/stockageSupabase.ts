import type { SupabaseClient } from "@supabase/supabase-js";
import {
  centimes,
  idEntreprise,
  idMatiere,
  idPret,
  estObjetPret,
  idProduit,
  idSalarie,
  moisJeu,
  type CreanceAEncaisser,
  type CumulMois,
  type DonneesFinMois,
  type Entreprise,
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
// Contrat avec la fonction Postgres appliquer_pas_entreprise (migration 0020, remplacée par 0025)
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
    const [companyR, matR, pfR, empR, atelierR, pretsR, produitsR, marqueR, etatR] =
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
          .select("surface_m2, loyer_mensuel_centimes, nombre_machines")
          .eq("company_id", companyId)
          .maybeSingle(),
        this.supabase
          .from("loans")
          .select("id, capital_initial_centimes, capital_restant_centimes, taux_annuel, duree_mois, mois_jeu_debut, objet")
          .eq("company_id", companyId)
          .eq("statut", "actif"),
        this.supabase
          .from("company_products")
          .select("product_id, qualite_visee, prix_vente_directe_centimes, prix_revendeur_centimes, production_mensuelle_cible")
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
      surface_m2: number; loyer_mensuel_centimes: number; nombre_machines: number;
    } | null;
    const loans = (verifier("loans", pretsR) ?? []) as Array<{
      id: string; capital_initial_centimes: number; capital_restant_centimes: number;
      taux_annuel: number; duree_mois: number; mois_jeu_debut: number | null; objet: string | null;
    }>;
    const produits = (verifier("company_products", produitsR) ?? []) as Array<{
      product_id: string; qualite_visee: number; prix_vente_directe_centimes: number;
      prix_revendeur_centimes: number; production_mensuelle_cible: number;
    }>;
    const marque = verifier("brand_state", marqueR) as { notoriete: number; desirabilite: number } | null;
    const etat = verifier("etat_mois_entreprise", etatR) as { cumul: CumulMois } | null;

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
        ? {
            surfaceM2: workshop.surface_m2,
            loyerMensuel: centimes(workshop.loyer_mensuel_centimes),
            nombreMachines: workshop.nombre_machines,
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
        .select("id, product_id, quantite, prix_facon_par_piece_centimes, instant_livraison_prevue")
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
          coutMatiereParPiece: centimes(0),
          instantMs: Date.parse(o.instant_livraison_prevue),
        })),
    };
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

  async chargerFinDeMois(companyId: string, moisEnCours: number): Promise<DonneesFinMois> {
    const moisPrecedent = moisEnCours - 1;
    const [tvaR, companyR] = await Promise.all([
      moisPrecedent >= 0
        ? this.supabase
            .from("ledger_entries")
            .select("sens, montant_centimes")
            .eq("company_id", companyId)
            .eq("compte", "44551")
            .eq("mois_jeu", moisPrecedent)
        : Promise.resolve({ data: [], error: null }),
      this.supabase
        .from("companies")
        .select("mois_decouvert_consecutifs")
        .eq("id", companyId)
        .maybeSingle(),
    ]);
    const tva = (verifier("ledger 44551", tvaR as { data: unknown; error: { message: string } | null }) ?? []) as Array<{
      sens: string; montant_centimes: number;
    }>;
    let net = 0;
    for (const l of tva) net += l.sens === "credit" ? l.montant_centimes : -l.montant_centimes;
    const company = verifier("companies", companyR) as { mois_decouvert_consecutifs: number } | null;
    return {
      tvaAPayerCeMois: centimes(Math.max(0, net)),
      moisDecouvertConsecutifs: company?.mois_decouvert_consecutifs ?? 0,
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
