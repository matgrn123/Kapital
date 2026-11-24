import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerParametresV1 } from "@kapital/content";
import {
  centimes,
  graine,
  idEntreprise,
  idMatiere,
  idPret,
  idProduit,
  idSalarie,
  moisJeu,
  simulerMoisEntreprise,
  type DonneesReellesMois,
  type Entreprise,
  type EcritureComptable,
  type MarketInputs,
} from "@kapital/engine";

// ---------------------------------------------------------------------------
// Types internes
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
};

export type ResultatCloture = {
  monde_id: string;
  mois_traite: number;
  entreprises_traitees: number;
  ecritures_inserees: number;
};

// ---------------------------------------------------------------------------
// Chargement de l'état d'une entreprise depuis la base
// ---------------------------------------------------------------------------

async function chargerEntreprise(
  supabase: SupabaseClient,
  company: LigneCompany,
  moisCourant: number,
): Promise<Entreprise> {
  const [matStocksR, pfStocksR, employeesR, workshopR, loansR, produitsR, marqueR] =
    await Promise.all([
      supabase
        .from("material_stock")
        .select("material_id, quantite, valeur_totale_centimes")
        .eq("company_id", company.id),
      supabase
        .from("product_stock")
        .select("product_id, quantite_pieces, valeur_totale_centimes")
        .eq("company_id", company.id),
      supabase
        .from("employees")
        .select("id, poste, salaire_brut_mensuel_centimes, anciennete_mois_debut, experience_mois_debut, mois_jeu_debut")
        .eq("company_id", company.id)
        .eq("statut", "actif"),
      supabase
        .from("workshops")
        .select("surface_m2, loyer_mensuel_centimes, nombre_machines")
        .eq("company_id", company.id)
        .maybeSingle(),
      supabase
        .from("loans")
        .select("id, capital_initial_centimes, capital_restant_centimes, taux_annuel, duree_mois, mois_jeu_debut")
        .eq("company_id", company.id)
        .eq("statut", "actif"),
      supabase
        .from("company_products")
        .select("product_id, qualite_visee, prix_vente_directe_centimes, prix_revendeur_centimes, production_mensuelle_cible")
        .eq("company_id", company.id),
      supabase
        .from("brand_state")
        .select("notoriete, desirabilite")
        .eq("company_id", company.id)
        .maybeSingle(),
    ]);

  if (matStocksR.error) throw new Error(`material_stock ${company.id}: ${matStocksR.error.message}`);
  if (pfStocksR.error) throw new Error(`product_stock ${company.id}: ${pfStocksR.error.message}`);
  if (employeesR.error) throw new Error(`employees ${company.id}: ${employeesR.error.message}`);
  if (workshopR.error) throw new Error(`workshops ${company.id}: ${workshopR.error.message}`);
  if (loansR.error) throw new Error(`loans ${company.id}: ${loansR.error.message}`);
  if (produitsR.error) throw new Error(`company_products ${company.id}: ${produitsR.error.message}`);
  if (marqueR.error) throw new Error(`brand_state ${company.id}: ${marqueR.error.message}`);

  const matStocks = (matStocksR.data ?? []) as Array<{
    material_id: string; quantite: number; valeur_totale_centimes: number;
  }>;
  const pfStocks = (pfStocksR.data ?? []) as Array<{
    product_id: string; quantite_pieces: number; valeur_totale_centimes: number;
  }>;
  const employees = (employeesR.data ?? []) as Array<{
    id: string; poste: "artisan" | "encadrement";
    salaire_brut_mensuel_centimes: number;
    anciennete_mois_debut: number; experience_mois_debut: number;
    mois_jeu_debut: number | null;
  }>;
  const workshop = workshopR.data as {
    surface_m2: number; loyer_mensuel_centimes: number; nombre_machines: number;
  } | null;
  const loans = (loansR.data ?? []) as Array<{
    id: string; capital_initial_centimes: number; capital_restant_centimes: number;
    taux_annuel: number; duree_mois: number; mois_jeu_debut: number | null;
  }>;
  const produits = (produitsR.data ?? []) as Array<{
    product_id: string; qualite_visee: number;
    prix_vente_directe_centimes: number; prix_revendeur_centimes: number;
    production_mensuelle_cible: number;
  }>;
  const marque = marqueR.data as { notoriete: number; desirabilite: number } | null;

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
      const moisDebutJeu = e.mois_jeu_debut ?? 0;
      const dureeService = Math.max(0, moisCourant - moisDebutJeu);
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
    marque: {
      notoriete: marque?.notoriete ?? 50,
      desirabilite: marque?.desirabilite ?? 50,
    },
    prets: loans.map((l) => ({
      id: idPret(l.id),
      capitalInitial: centimes(l.capital_initial_centimes),
      capitalRestant: centimes(l.capital_restant_centimes),
      tauxAnnuel: l.taux_annuel,
      dureeTotaleMois: l.duree_mois,
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
}

// ---------------------------------------------------------------------------
// Chargement des données réelles du mois
// ---------------------------------------------------------------------------

async function chargerDonneesMois(
  supabase: SupabaseClient,
  companyId: string,
  moisCourant: number,
): Promise<DonneesReellesMois> {
  const moisPrecedent = moisCourant - 1;
  const moisPrecedentCreances = moisCourant - 2;

  const [poR, prodOrdR, creancesR, tvaR, moisDecouvertR] = await Promise.all([
    // Livraisons matière arrivées ce mois
    supabase
      .from("purchase_orders")
      .select("id, material_id, quantite, prix_unitaire_centimes, supplier_id")
      .eq("company_id", companyId)
      .eq("mois_jeu_livraison", moisCourant)
      .eq("statut", "en_cours"),
    // Livraisons façonniers arrivées ce mois
    supabase
      .from("production_orders")
      .select("id, product_id, quantite, prix_facon_par_piece_centimes")
      .eq("company_id", companyId)
      .eq("lieu_type", "faconnier")
      .eq("mois_jeu_livraison", moisCourant)
      .eq("statut", "en_cours"),
    // Créances revendeurs de il y a 2 mois (411 débits nets)
    moisPrecedentCreances >= 0
      ? supabase
          .from("ledger_entries")
          .select("ecriture_id, sens, montant_centimes")
          .eq("company_id", companyId)
          .eq("compte", "411")
          .eq("mois_jeu", moisPrecedentCreances)
      : Promise.resolve({ data: [], error: null }),
    // TVA à payer ce mois (solde 44551 du mois précédent)
    moisPrecedent >= 0
      ? supabase
          .from("ledger_entries")
          .select("sens, montant_centimes")
          .eq("company_id", companyId)
          .eq("compte", "44551")
          .eq("mois_jeu", moisPrecedent)
      : Promise.resolve({ data: [], error: null }),
    // Nombre de mois de découvert consécutifs
    supabase
      .from("companies")
      .select("mois_decouvert_consecutifs")
      .eq("id", companyId)
      .maybeSingle(),
  ]);

  if (poR.error) throw new Error(`purchase_orders ${companyId}: ${poR.error.message}`);
  if (prodOrdR.error) throw new Error(`production_orders ${companyId}: ${prodOrdR.error.message}`);
  if (creancesR.error) throw new Error(`ledger 411 ${companyId}: ${creancesR.error.message}`);
  if (tvaR.error) throw new Error(`ledger 44551 ${companyId}: ${tvaR.error.message}`);

  // Calculer TVA nette à payer
  const tvaLignes = (tvaR.data ?? []) as Array<{ sens: string; montant_centimes: number }>;
  let tvaNetCentimes = 0;
  for (const l of tvaLignes) {
    if (l.sens === "credit") tvaNetCentimes += l.montant_centimes;
    else tvaNetCentimes -= l.montant_centimes;
  }
  const tvaAPayerCeMois = centimes(Math.max(0, tvaNetCentimes));

  // Regrouper créances par ecriture_id et garder celles qui sont positives
  const creancesLignes = (creancesR.data ?? []) as Array<{ ecriture_id: string; sens: string; montant_centimes: number }>;
  const soldesCreances = new Map<string, number>();
  for (const l of creancesLignes) {
    const prev = soldesCreances.get(l.ecriture_id) ?? 0;
    soldesCreances.set(l.ecriture_id, prev + (l.sens === "debit" ? l.montant_centimes : -l.montant_centimes));
  }
  const creancesAEncaisser = Array.from(soldesCreances.entries())
    .filter(([, solde]) => solde > 0)
    .map(([ecritureId, solde]) => ({
      ecritureId,
      montant: centimes(solde),
    }));

  const po = (poR.data ?? []) as Array<{
    id: string; material_id: string; quantite: number; prix_unitaire_centimes: number; supplier_id: string;
  }>;
  const prodOrd = (prodOrdR.data ?? []) as Array<{
    id: string; product_id: string; quantite: number; prix_facon_par_piece_centimes: number | null;
  }>;

  const moisDecouvert = ((moisDecouvertR.data as { mois_decouvert_consecutifs: number } | null)?.mois_decouvert_consecutifs) ?? 0;

  return {
    livraisonsMatiere: po.map((c) => ({
      id: c.id,
      matiere: idMatiere(c.material_id),
      quantite: Number(c.quantite),
      prixUnitaire: centimes(c.prix_unitaire_centimes),
      modePaiement: "credit" as const, // fournisseurs par défaut à crédit
    })),
    livraisonsFaconniers: prodOrd
      .filter((o) => o.prix_facon_par_piece_centimes != null)
      .map((o) => ({
        id: o.id,
        produit: idProduit(o.product_id),
        quantite: o.quantite,
        prixFaconParPiece: centimes(o.prix_facon_par_piece_centimes!),
        coutMatiereParPiece: centimes(0),
      })),
    depensesMarketing: [], // marketing appliqué en temps réel par server action
    creancesAEncaisser,
    tvaAPayerCeMois,
    moisDecouvertConsecutifs: moisDecouvert,
  };
}

// ---------------------------------------------------------------------------
// Persistance des résultats
// ---------------------------------------------------------------------------

async function persisterResultats(
  supabase: SupabaseClient,
  companyId: string,
  moisFin: number,
  entrepriseApres: Entreprise,
  ecritures: readonly EcritureComptable[],
  livraisonsMatIds: string[],
  livraisonsFacIds: string[],
  moisDecouvertConsecutifsApres: number,
): Promise<number> {
  // 1. Écrire les écritures dans ledger_entries
  const lignesLedger: Array<{
    company_id: string;
    ecriture_id: string;
    mois_jeu: number;
    libelle: string;
    compte: string;
    sens: "debit" | "credit";
    montant_centimes: number;
  }> = [];

  for (const ec of ecritures) {
    for (const ligne of ec.lignes) {
      lignesLedger.push({
        company_id: companyId,
        ecriture_id: ec.id,
        mois_jeu: moisFin,
        libelle: ec.libelle,
        compte: ligne.compte,
        sens: ligne.sens,
        montant_centimes: ligne.montant,
      });
    }
  }

  if (lignesLedger.length > 0) {
    const { error: errLedger } = await supabase
      .from("ledger_entries")
      .insert(lignesLedger);
    if (errLedger) throw new Error(`ledger_entries insert ${companyId}: ${errLedger.message}`);
  }

  // 2. Mettre à jour le stock matières premières
  for (const stock of entrepriseApres.stocksMatiere) {
    const { error } = await supabase
      .from("material_stock")
      .upsert(
        {
          company_id: companyId,
          material_id: stock.matiere as string,
          quantite: stock.quantite,
          valeur_totale_centimes: stock.valeurTotale,
          mise_a_jour_le: new Date().toISOString(),
        },
        { onConflict: "company_id,material_id" },
      );
    if (error) throw new Error(`material_stock upsert: ${error.message}`);
  }

  // 3. Mettre à jour le stock produits finis
  for (const stock of entrepriseApres.stocksFinis) {
    const { error } = await supabase
      .from("product_stock")
      .upsert(
        {
          company_id: companyId,
          product_id: stock.produit as string,
          quantite_pieces: stock.quantite,
          valeur_totale_centimes: stock.valeurTotale,
          mise_a_jour_le: new Date().toISOString(),
        },
        { onConflict: "company_id,product_id" },
      );
    if (error) throw new Error(`product_stock upsert: ${error.message}`);
  }

  // 4. Mettre à jour les prêts (capital restant)
  for (const pret of entrepriseApres.prets) {
    const { error } = await supabase
      .from("loans")
      .update({ capital_restant_centimes: pret.capitalRestant })
      .eq("id", pret.id as string)
      .eq("company_id", companyId);
    if (error) throw new Error(`loans update ${pret.id}: ${error.message}`);

    // Marquer l'échéance comme payée
    const numEcheance = moisFin - pret.moisDebut;
    if (numEcheance >= 1 && numEcheance <= pret.dureeTotaleMois) {
      await supabase
        .from("loan_schedules")
        .update({ statut: "payee" })
        .eq("loan_id", pret.id as string)
        .eq("numero", numEcheance);
    }
    // Marquer le prêt comme soldé si capital = 0
    if (pret.capitalRestant <= 0) {
      await supabase
        .from("loans")
        .update({ statut: "solde" })
        .eq("id", pret.id as string);
    }
  }

  // 5. Mettre à jour la marque
  const { error: errBrand } = await supabase
    .from("brand_state")
    .upsert(
      {
        company_id: companyId,
        notoriete: entrepriseApres.marque.notoriete,
        desirabilite: entrepriseApres.marque.desirabilite,
        mise_a_jour_le: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );
  if (errBrand) throw new Error(`brand_state upsert: ${errBrand.message}`);

  // 6. Mettre à jour le statut et le compteur de découvert de l'entreprise
  const { error: errCompany } = await supabase
    .from("companies")
    .update({
      statut: entrepriseApres.statut,
      mois_decouvert_consecutifs: moisDecouvertConsecutifsApres,
    })
    .eq("id", companyId);
  if (errCompany) throw new Error(`companies update statut: ${errCompany.message}`);

  // 7. Marquer les commandes matière comme livrées
  if (livraisonsMatIds.length > 0) {
    await supabase
      .from("purchase_orders")
      .update({ statut: "livree" })
      .in("id", livraisonsMatIds);
  }

  // 8. Marquer les ordres façonniers comme livrés
  if (livraisonsFacIds.length > 0) {
    await supabase
      .from("production_orders")
      .update({ statut: "livree" })
      .in("id", livraisonsFacIds);
  }

  return lignesLedger.length;
}

// ---------------------------------------------------------------------------
// Fonction principale : clôture mensuelle complète
// ---------------------------------------------------------------------------

export async function simulerMondeComplet(
  supabase: SupabaseClient,
): Promise<ResultatCloture> {
  const params = chargerParametresV1();

  // 1. Charger le monde actif
  const { data: mondes, error: errMonde } = await supabase
    .from("worlds")
    .select("id, mois_courant")
    .eq("etat", "actif")
    .limit(1);
  if (errMonde) throw new Error(`worlds: ${errMonde.message}`);
  const monde = (mondes ?? [])[0] as { id: string; mois_courant: number } | undefined;
  if (!monde) throw new Error("Aucun monde actif");

  const moisCourant = monde.mois_courant;
  const moisFin = moisCourant + 1;

  // 2. Verrou d'idempotence : créer la cloture pour ce mois
  const { data: clotureCree, error: errCloture } = await supabase
    .from("clotures")
    .insert({ monde_id: monde.id, mois: moisCourant, statut: "en_cours" })
    .select("id")
    .single();

  if (errCloture) {
    // Conflit UNIQUE = déjà traitée ou en cours
    const { data: cloturExistante } = await supabase
      .from("clotures")
      .select("statut")
      .eq("monde_id", monde.id)
      .eq("mois", moisCourant)
      .maybeSingle();
    if ((cloturExistante as { statut: string } | null)?.statut === "termine") {
      return {
        monde_id: monde.id,
        mois_traite: moisCourant,
        entreprises_traitees: 0,
        ecritures_inserees: 0,
      };
    }
    throw new Error(`Clôture du mois ${moisCourant} déjà en cours`);
  }
  const clotureId = (clotureCree as { id: string }).id;

  try {
    // 3. Charger toutes les entreprises
    const { data: companiesData, error: errCompanies } = await supabase
      .from("companies")
      .select("id, nom, gamme, etape, statut, tresorerie_centimes, owner_profile_id, mois_decouvert_consecutifs")
      .neq("statut", "liquidee");
    if (errCompanies) throw new Error(`companies: ${errCompanies.message}`);
    const companies = (companiesData ?? []) as LigneCompany[];

    // 4. MarketInputs (valeurs réelles du moment)
    const marketInputs: MarketInputs = {
      mois: moisJeu(moisCourant),
      smicHoraireBrut: centimes(params["smic_horaire_brut"]?.valeur ?? 1231),
      tauxEstrAnnuel: 0.0265,
      prixElectriciteParKwh: centimes(params["prix_electricite_pro"]?.valeur ?? 16),
      coursCotonParKg: centimes(500),
      inflationMensuelle: 0.003,
    };

    // 5. Traiter chaque entreprise
    let totalEcritures = 0;
    for (const company of companies) {
      const entreprise = await chargerEntreprise(supabase, company, moisCourant);
      const donnees = await chargerDonneesMois(supabase, company.id, moisCourant);

      const resultat = simulerMoisEntreprise(
        entreprise,
        donnees,
        marketInputs,
        params,
        graine(moisCourant * 1000 + Math.abs(company.id.charCodeAt(0))),
        moisJeu(moisFin),
      );

      const livraisonsMatIds = donnees.livraisonsMatiere.map((l) => l.id);
      const livraisonsFacIds = donnees.livraisonsFaconniers.map((l) => l.id);

      const nbEcritures = await persisterResultats(
        supabase,
        company.id,
        moisFin,
        resultat.entrepriseApres,
        resultat.ecritures,
        livraisonsMatIds,
        livraisonsFacIds,
        resultat.moisDecouvertConsecutifsApres,
      );
      totalEcritures += nbEcritures;
    }

    // 6. Avancer le mois du monde
    const { error: errWorld } = await supabase
      .from("worlds")
      .update({ mois_courant: moisFin })
      .eq("id", monde.id);
    if (errWorld) throw new Error(`update world: ${errWorld.message}`);

    // 7. Marquer la clôture comme terminée
    await supabase
      .from("clotures")
      .update({ statut: "termine", fin: new Date().toISOString() })
      .eq("id", clotureId);

    return {
      monde_id: monde.id,
      mois_traite: moisCourant,
      entreprises_traitees: companies.length,
      ecritures_inserees: totalEcritures,
    };
  } catch (err) {
    // Marquer la clôture en erreur
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    await supabase
      .from("clotures")
      .update({ statut: "erreur", fin: new Date().toISOString(), erreur: message })
      .eq("id", clotureId);
    throw err;
  }
}
