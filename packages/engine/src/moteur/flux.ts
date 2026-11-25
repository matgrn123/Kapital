import type { Parametres } from "@kapital/content";
import { enregistrer, planComptableV1 } from "../comptabilite/index.js";
import type { EcritureComptable, GrandLivre } from "../comptabilite/types.js";
import { capaciteMinutes, rendement } from "../atelier/calculs.js";
import { postesEquipesAtelier } from "../atelier/effetsPlan.js";
import { artisansAuPoste } from "../personnel/postes.js";
import { calculerVentesMois } from "../marche/ventesMois.js";
import {
  capaciteVendeursMois,
  ecritureVenteBoutique,
  parametresBoutiqueDepuis,
  pointsDeVenteOuverts,
  sortirDesBoutiques,
} from "../boutique/boutique.js";
import { coefficientsMarketingDepuisParametres, fluxMarque } from "../marketing/index.js";
import type { DepenseMarketing } from "../marketing/types.js";
import type { Entreprise, LigneStockFini, LigneStockMatiere } from "../types/entreprise.js";
import type { Monde } from "../types/monde.js";
import {
  centimes,
  minutes,
  type Centimes,
  type IdMatiere,
  type IdProduit,
  type MoisJeu,
} from "../types/primitifs.js";
import {
  enregistrerRetour,
  enregistrerVenteDirecte,
  enregistrerVenteRevendeur,
  prixHtDepuisTtc,
} from "../ventes/ventes.js";
import { agregatsDe, sommeAgregats } from "./agregats.js";
import {
  besoinMatiere,
  montantFactureFaconnier,
  montantLivraisonMatiere,
  parametreObligatoire,
  piecesPermisesParLaMatiere,
} from "./fabrication.js";
import type { CumulMois, DonneesFlux } from "./donneesMois.js";

// ---------------------------------------------------------------------------
// Utilitaires partagés avec la clôture de fin de mois
// ---------------------------------------------------------------------------

/** Somme de tous les mouvements du compte 512 dans une liste d'écritures */
export function netMouvements512(ecritures: readonly EcritureComptable[]): number {
  let net = 0;
  for (const ec of ecritures) {
    for (const ligne of ec.lignes) {
      if (ligne.compte === "512") {
        if (ligne.sens === "debit") net += ligne.montant;
        else net -= ligne.montant;
      }
    }
  }
  return net;
}

/** Somme TVA collectée depuis une liste d'écritures */
export function sommeTvaCollectee(ecritures: readonly EcritureComptable[]): number {
  let total = 0;
  for (const ec of ecritures) {
    for (const ligne of ec.lignes) {
      if (ligne.compte === "44571" && ligne.sens === "credit") total += ligne.montant;
      if (ligne.compte === "44571" && ligne.sens === "debit") total -= ligne.montant;
    }
  }
  return total;
}

/** Incrémente ancienneté et expérience de tous les salariés */
export function incrementerAnciennete(entreprise: Entreprise): Entreprise {
  return {
    ...entreprise,
    salaries: entreprise.salaries.map((s) => ({
      ...s,
      ancienneteMois: s.ancienneteMois + 1,
      experienceMois: s.experienceMois + 1,
    })),
  };
}

// ---------------------------------------------------------------------------
// Stocks
// ---------------------------------------------------------------------------

/** Met à jour ou crée une ligne de stock matière avec CMP recalculé */
function mettreAJourStockMatiere(
  stocks: readonly LigneStockMatiere[],
  matiere: IdMatiere,
  quantiteAjoutee: number,
  valeurAjoutee: Centimes,
): readonly LigneStockMatiere[] {
  const idx = stocks.findIndex((s) => s.matiere === matiere);
  if (idx === -1) {
    return [...stocks, { matiere, quantite: quantiteAjoutee, valeurTotale: valeurAjoutee }];
  }
  const existing = stocks[idx]!;
  const newQte = existing.quantite + quantiteAjoutee;
  const newVal = centimes(existing.valeurTotale + valeurAjoutee);
  return stocks.map((s, i) => (i === idx ? { ...s, quantite: newQte, valeurTotale: newVal } : s));
}

/** Consomme de la matière en CMP et retourne la valeur consommée + stocks mis à jour */
function consommerStockMatiere(
  stocks: readonly LigneStockMatiere[],
  matiere: IdMatiere,
  quantite: number,
): { valeur: Centimes; stocks: readonly LigneStockMatiere[] } {
  const idx = stocks.findIndex((s) => s.matiere === matiere);
  if (idx === -1 || stocks[idx]!.quantite < quantite) {
    // Si stock insuffisant, on consomme ce qu'on peut
    const existing = idx === -1 ? { quantite: 0, valeurTotale: centimes(0) } : stocks[idx]!;
    const qteConsommee = Math.min(existing.quantite, quantite);
    const cmp = existing.quantite > 0 ? existing.valeurTotale / existing.quantite : 0;
    const valeur = centimes(Math.round(cmp * qteConsommee));
    const newStocks = stocks.map((s, i) =>
      i === idx
        ? { ...s, quantite: s.quantite - qteConsommee, valeurTotale: centimes(s.valeurTotale - valeur) }
        : s,
    );
    return { valeur, stocks: idx === -1 ? stocks : newStocks };
  }
  const ligne = stocks[idx]!;
  const cmp = ligne.valeurTotale / ligne.quantite;
  const valeur = centimes(Math.round(cmp * quantite));
  const newStocks = stocks.map((s, i) =>
    i === idx
      ? { ...s, quantite: s.quantite - quantite, valeurTotale: centimes(s.valeurTotale - valeur) }
      : s,
  );
  return { valeur, stocks: newStocks };
}

/** Augmente un stock de produits finis */
function augmenterStockFini(
  stocks: readonly LigneStockFini[],
  produit: IdProduit,
  quantite: number,
  valeur: Centimes,
): readonly LigneStockFini[] {
  const idx = stocks.findIndex((s) => s.produit === produit);
  if (idx === -1) {
    return [...stocks, { produit, quantite, valeurTotale: valeur }];
  }
  return stocks.map((s, i) =>
    i === idx
      ? { ...s, quantite: s.quantite + quantite, valeurTotale: centimes(s.valeurTotale + valeur) }
      : s,
  );
}

/** Diminue un stock de produits finis et retourne le coût de revient CMP unitaire */
function diminuerStockFini(
  stocks: readonly LigneStockFini[],
  produit: IdProduit,
  quantite: number,
): { coutRevientUnitaire: Centimes; valeurTotale: Centimes; stocks: readonly LigneStockFini[] } {
  const idx = stocks.findIndex((s) => s.produit === produit);
  if (idx === -1 || stocks[idx]!.quantite === 0) {
    return { coutRevientUnitaire: centimes(0), valeurTotale: centimes(0), stocks };
  }
  const ligne = stocks[idx]!;
  const cmp = ligne.valeurTotale / ligne.quantite;
  const coutRevientUnitaire = centimes(Math.round(cmp));
  const valeurSortie = centimes(Math.round(cmp * quantite));
  const newStocks = stocks.map((s, i) =>
    i === idx
      ? { ...s, quantite: s.quantite - quantite, valeurTotale: centimes(s.valeurTotale - valeurSortie) }
      : s,
  );
  return { coutRevientUnitaire, valeurTotale: valeurSortie, stocks: newStocks };
}

// ---------------------------------------------------------------------------
// Plan de production du mois
// ---------------------------------------------------------------------------

type LignePlanProduction = { readonly produit: IdProduit; readonly pieces: number };

/**
 * Ce que l'atelier peut produire sur un mois entier, produit par produit,
 * selon le nombre d'artisans, l'expérience et le nombre de machines.
 * Un pas n'en fait qu'une part (voir `avancerFlux`).
 */
export function planProductionDuMois(ent: Entreprise, params: Parametres): readonly LignePlanProduction[] {
  if (ent.atelier === null) return [];
  // AE-7 : seuls les artisans qui occupent un poste équipé produisent et comptent dans le
  // rendement (les plus expérimentés d'abord) ; embaucher sans poste libre ne change rien.
  // 3D-3 : les postes sont les modules réellement posés dans le plan d'aménagement.
  const postesEquipes = postesEquipesAtelier(ent.atelier);
  const artisans = artisansAuPoste(ent.salaries, postesEquipes);
  const nbArtisans = artisans.length;
  if (nbArtisans === 0) return [];

  const avgExperience = artisans.reduce((sum, s) => sum + s.experienceMois, 0) / nbArtisans;
  const rMin = parametreObligatoire(params, "rendement_atelier_min");
  const rMax = parametreObligatoire(params, "rendement_atelier_max");
  const tau = parametreObligatoire(params, "rendement_tau_mois");
  const heuresMensuelles = parametreObligatoire(params, "heures_mensuelles_legales");
  const rendementEffectif = rendement(avgExperience, rMin, rMax, tau);
  let capaciteRestante = capaciteMinutes(
    nbArtisans,
    postesEquipes,
    heuresMensuelles,
    rendementEffectif,
  );

  const plan: LignePlanProduction[] = [];
  for (const produitEnt of ent.catalogue) {
    if (produitEnt.productionMensuelleCible <= 0) continue;
    if (capaciteRestante <= 0) break;
    const fiche = produitEnt.fabrication;
    if (fiche === undefined) {
      throw new Error(
        `Produit ${produitEnt.produit} sans nomenclature (matière, consommation, temps) : production atelier impossible.`,
      );
    }
    if (!(fiche.tempsStandardMinutes > 0)) {
      throw new Error(`Temps standard invalide pour ${produitEnt.produit} : ${fiche.tempsStandardMinutes}`);
    }
    const piecesProducibles = Math.floor(capaciteRestante / fiche.tempsStandardMinutes);
    const pieces = Math.min(produitEnt.productionMensuelleCible, piecesProducibles);
    if (pieces <= 0) continue;
    plan.push({ produit: produitEnt.produit, pieces });
    capaciteRestante = minutes(capaciteRestante - pieces * fiche.tempsStandardMinutes);
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Flux continus : production, marque, ventes, retours, encaissements
// ---------------------------------------------------------------------------

export type ContexteFlux = {
  readonly params: Parametres;
  readonly mois: MoisJeu;
  /**
   * Portion du mois couverte par ce flux, en nombre de pas entiers :
   * du pas `pasDebut` (inclus) au pas `pasFin` (exclu), sur `pasParMois` pas.
   * Un mois pris d'un bloc : pasDebut 0, pasFin 1, pasParMois 1.
   * Des entiers, pour que le dernier pas retombe exactement sur 1 mois.
   */
  readonly pasDebut: number;
  readonly pasFin: number;
  readonly pasParMois: number;
  /** Ajouté à l'identifiant des écritures qui se répètent à chaque pas ("" pour un mois en bloc). */
  readonly suffixeId: string;
};

export type ResultatFlux = {
  readonly entreprise: Entreprise;
  readonly cumul: CumulMois;
  /** Écritures passées pendant ce flux seulement. */
  readonly ecritures: readonly EcritureComptable[];
};

function incrementer(table: Record<string, number>, cle: string, valeur: number): void {
  table[cle] = (table[cle] ?? 0) + valeur;
}

/**
 * Fait avancer une entreprise sur une portion de mois : livraisons arrivées,
 * production de l'atelier, marque, ventes, retours et encaissements.
 * Ne passe aucune échéance de fin de mois (paie, loyer, prêt, TVA, impôt).
 */
export function avancerFlux(
  entreprise: Entreprise,
  cumulAvant: CumulMois,
  donnees: DonneesFlux,
  ctx: ContexteFlux,
): ResultatFlux {
  const { params, mois, pasDebut, pasFin, pasParMois, suffixeId } = ctx;
  // Part du mois vécue par l'entreprise depuis son démarrage, à la fin de ce flux
  const pasVecus = pasFin - cumulAvant.pasDemarrage;
  let ent = { ...entreprise };
  let gl: GrandLivre = planComptableV1();
  const ecritures: EcritureComptable[] = [];

  const produitParProduit = { ...cumulAvant.produitParProduit };
  const demandeParLigne = { ...cumulAvant.demandeParLigne };
  const serviParLigne = { ...cumulAvant.serviParLigne };
  const serviDirectParProduit = { ...cumulAvant.serviDirectParProduit };
  const retourneParProduit = { ...cumulAvant.retourneParProduit };
  let chiffreAffairesHt = cumulAvant.chiffreAffairesHt;
  let piecesDirectes = cumulAvant.piecesDirectes;

  function enr(ecriture: EcritureComptable): void {
    gl = enregistrer(gl, ecriture);
    ecritures.push(ecriture);
  }
  /** Les fonctions de ventes.ts rendent un grand livre : on en retire la dernière écriture. */
  function derniereEcritureDuGl(): void {
    ecritures.push(gl.ecritures[gl.ecritures.length - 1]!);
  }

  // Livraisons de matière arrivées
  for (const livraison of donnees.livraisonsMatiere) {
    const montantTotal = montantLivraisonMatiere(livraison.quantite, livraison.prixUnitaire);
    ent = {
      ...ent,
      stocksMatiere: mettreAJourStockMatiere(
        ent.stocksMatiere,
        livraison.matiere,
        livraison.quantite,
        montantTotal,
      ),
    };
    const compteContrepartie = livraison.modePaiement === "immediat" ? "512" : "401";
    enr({
      id: `livraison_mat_${mois}_${livraison.id}`,
      mois,
      libelle: `Livraison matière ${livraison.matiere} ×${livraison.quantite}`,
      lignes: [
        { compte: "31", sens: "debit", montant: montantTotal },
        { compte: compteContrepartie, sens: "credit", montant: montantTotal },
      ],
    });
  }

  const tauxChute = parametreObligatoire(params, "taux_chute_matiere_defaut");

  // Livraisons des façonniers arrivées. Coût complet de la pièce :
  // matière × (1 + chute) prise dans le stock du joueur (au coût moyen) + fournitures + façon.
  for (const livraison of donnees.livraisonsFaconniers) {
    let totalMatiere = centimes(0);
    const fiche = livraison.matiereDuJoueur;
    if (fiche !== null) {
      // Si le stock ne couvre pas tout le besoin, on sort ce qu'il y a (le serveur refuse
      // déjà la commande sans matière suffisante ; ce cas ne vient que d'une matière
      // consommée entre-temps par l'atelier).
      const sortie = consommerStockMatiere(
        ent.stocksMatiere,
        fiche.matiere,
        besoinMatiere(livraison.quantite, fiche, tauxChute),
      );
      totalMatiere = sortie.valeur;
      ent = { ...ent, stocksMatiere: sortie.stocks };
    }
    const totalFacon = montantFactureFaconnier(livraison.quantite, livraison.prixFaconParPiece, fiche);
    const totalPF = centimes(totalMatiere + totalFacon);
    ent = {
      ...ent,
      stocksFinis: augmenterStockFini(ent.stocksFinis, livraison.produit, livraison.quantite, totalPF),
    };
    enr({
      id: `livraison_fac_${mois}_${livraison.id}`,
      mois,
      libelle: `Livraison façonnier ${livraison.produit} ×${livraison.quantite}`,
      // Un produit fini acheté tel quel (grossiste) n'a pas de matière à sortir du stock :
      // le grand livre refuse les lignes à zéro.
      lignes: [
        { compte: "35", sens: "debit", montant: totalPF },
        ...(totalMatiere > 0
          ? [{ compte: "31", sens: "credit" as const, montant: totalMatiere }]
          : []),
        { compte: "401", sens: "credit", montant: totalFacon },
      ],
    });
  }

  // Production atelier : on produit la part du mois écoulée depuis le début du mois,
  // moins ce qui est déjà produit
  for (const ligne of planProductionDuMois(ent, params)) {
    const dejaProduit = produitParProduit[ligne.produit] ?? 0;
    const piecesAProduire = Math.floor((ligne.pieces * pasVecus) / pasParMois) - dejaProduit;
    if (piecesAProduire <= 0) continue;

    // Bonne matière, consommation de la nomenclature, chute comprise ; on ne produit
    // que ce que la matière en stock permet (jamais de pièce à coût nul).
    const fiche = ent.catalogue.find((p) => p.produit === ligne.produit)!.fabrication!;
    const stockMatiere = ent.stocksMatiere.find((s) => s.matiere === fiche.matiere);
    const pieces = Math.min(
      piecesAProduire,
      piecesPermisesParLaMatiere(stockMatiere?.quantite ?? 0, fiche, tauxChute),
    );
    if (pieces <= 0) continue;
    const { valeur: valeurMatiere, stocks: stocksApres } = consommerStockMatiere(
      ent.stocksMatiere,
      fiche.matiere,
      besoinMatiere(pieces, fiche, tauxChute),
    );
    if (valeurMatiere <= 0) continue; // matière sans valeur : on ne fabrique pas de pièce gratuite
    const valeurFournitures = centimes(pieces * fiche.fournituresParPiece);
    const valeurPieces = centimes(valeurMatiere + valeurFournitures);
    ent = {
      ...ent,
      stocksMatiere: stocksApres,
      stocksFinis: augmenterStockFini(ent.stocksFinis, ligne.produit, pieces, valeurPieces),
    };
    enr({
      id: `production_atelier_${mois}_${ent.id}_${ligne.produit}${suffixeId}`,
      mois,
      libelle: `Production atelier ${ligne.produit} ×${pieces}`,
      // Fournitures (boutons, étiquettes) achetées au fil de la production, payées comptant.
      lignes: [
        { compte: "35", sens: "debit", montant: valeurPieces },
        { compte: "31", sens: "credit", montant: valeurMatiere },
        ...(valeurFournitures > 0
          ? [{ compte: "512", sens: "credit" as const, montant: valeurFournitures }]
          : []),
      ],
    });
    produitParProduit[ligne.produit] = dejaProduit + pieces;
  }

  // Marque : décroissance sur la durée écoulée + effet des dépenses de ce flux
  const coeffsMarketing = coefficientsMarketingDepuisParametres(params);
  const depensesMarketingPourFlux: DepenseMarketing[] = donnees.depensesMarketing
    .filter((d) => d.montant > 0)
    .map((d) => ({ action: d.action as DepenseMarketing["action"], montant: d.montant }));
  ent = {
    ...ent,
    marque: fluxMarque(
      ent.marque,
      (pasFin - pasDebut) / pasParMois,
      depensesMarketingPourFlux,
      coeffsMarketing,
    ),
  };
  // AE-10 : chaque boutique ouverte ajoute le bonus de son emplacement (points par mois,
  // catalogue des bâtiments) à la désirabilité, au prorata de la part du mois écoulée.
  const bonusBoutiques = pointsDeVenteOuverts(ent, mois).reduce((s, p) => s + p.bonusDesirabiliteParMois, 0);
  if (bonusBoutiques > 0) {
    const desirabilite = ent.marque.desirabilite + (bonusBoutiques * (pasFin - pasDebut)) / pasParMois;
    ent = { ...ent, marque: { ...ent.marque, desirabilite: Math.min(100, desirabilite) } };
  }
  for (const depense of donnees.depensesMarketing) {
    if (depense.montant <= 0) continue;
    enr({
      id: `marketing_${mois}_${depense.id}`,
      mois,
      libelle: `Marketing ${depense.action}`,
      lignes: [
        { compte: "623", sens: "debit", montant: depense.montant },
        { compte: "512", sens: "credit", montant: depense.montant },
      ],
    });
  }

  // Ventes (plafonnées au stock) et retours en ligne
  const tvaStandard = parametreObligatoire(params, "tva_standard");
  const coutTraitementRetour = centimes(Math.round(parametreObligatoire(params, "cout_traitement_retour")));
  const tauxRetourEnLigne = parametreObligatoire(params, "taux_retour_vente_en_ligne");

  const mondePourVentes: Monde = {
    moisCourant: mois,
    entreprises: [ent],
    prixMatieres: [],
    franges: [],
    evenements: [],
  };
  // Demande cumulée depuis le démarrage de l'entreprise jusqu'à la fin de ce flux
  const ventesGenerees = calculerVentesMois(mondePourVentes, pasVecus / pasParMois, params);

  const stockRestant = new Map<string, number>();
  for (const sf of ent.stocksFinis) stockRestant.set(sf.produit as string, sf.quantite);

  // Vente directe avant revendeur
  const ventesTriees = [...ventesGenerees].sort((a, b) => {
    if (a.canal === "vente_directe" && b.canal === "revendeur") return -1;
    if (a.canal === "revendeur" && b.canal === "vente_directe") return 1;
    return 0;
  });

  let stocksFinis = ent.stocksFinis;

  // AE-10 : boutiques ouvertes ce mois (pendant les travaux, aucune vente) et plafond des
  // vendeurs, cumulé depuis le début du mois comme la demande : vendeurs × ventes max × part du mois.
  let pointsDeVente = ent.pointsDeVente ?? [];
  const ouverts = new Set(pointsDeVenteOuverts(ent, mois).map((p) => p.id));
  const plafondVendeursCumule =
    ouverts.size === 0
      ? 0
      : Math.floor(
          (capaciteVendeursMois(ent, mois, parametresBoutiqueDepuis(params)) * pasVecus) / pasParMois,
        );
  const serviBoutique = (): number =>
    Object.entries(serviParLigne).reduce((s, [cle, q]) => (cle.endsWith("|boutique") ? s + q : s), 0);

  for (const vente of ventesTriees) {
    if (vente.entreprise !== ent.id) continue;

    const cle = `${vente.produit}|${vente.canal}`;
    const dejaTraite = demandeParLigne[cle] ?? 0;
    const demandeDuFlux = Math.max(0, vente.quantite - dejaTraite);
    if (demandeDuFlux <= 0) continue;
    demandeParLigne[cle] = dejaTraite + demandeDuFlux;

    if (vente.canal === "boutique") {
      // Vente en boutique : plafonnée par le stock de la boutique ET par les vendeurs.
      // Sans vendeur ou sans stock en boutique, aucune vente (le stock de l'atelier n'est pas servi).
      let stockBoutique = 0;
      for (const pdv of pointsDeVente) {
        if (!ouverts.has(pdv.id)) continue;
        for (const s of pdv.stock) if (s.produit === vente.produit) stockBoutique += s.quantite;
      }
      const resteVendeurs = Math.max(0, plafondVendeursCumule - serviBoutique());
      const quantiteBoutique = Math.min(demandeDuFlux, stockBoutique, resteVendeurs);
      incrementer(serviParLigne, cle, quantiteBoutique);
      if (quantiteBoutique <= 0) continue;
      const sortie = sortirDesBoutiques(pointsDeVente, ouverts, vente.produit, quantiteBoutique);
      pointsDeVente = sortie.pointsDeVente;
      enr(
        ecritureVenteBoutique({
          idEcriture: `vente_${mois}_${ent.id}_${vente.produit}_boutique${suffixeId}`,
          mois,
          produit: vente.produit,
          quantite: quantiteBoutique,
          prixTtcUnitaire: vente.prixUnitaireCentimes,
          tauxTva: tvaStandard,
          coutRevientTotal: sortie.valeur,
        }),
      );
      chiffreAffairesHt += prixHtDepuisTtc(vente.prixUnitaireCentimes, tvaStandard) * quantiteBoutique;
      continue;
    }

    const stockDispo = stockRestant.get(vente.produit as string) ?? 0;
    const quantiteServie = Math.min(demandeDuFlux, stockDispo);
    incrementer(serviParLigne, cle, quantiteServie);
    if (quantiteServie <= 0) continue;

    // CMP avant sortie
    const { coutRevientUnitaire, stocks: stocksApres } = diminuerStockFini(
      stocksFinis,
      vente.produit,
      quantiteServie,
    );
    stocksFinis = stocksApres;
    stockRestant.set(vente.produit as string, stockDispo - quantiteServie);

    if (vente.canal === "vente_directe") {
      gl = enregistrerVenteDirecte(gl, {
        idEcriture: `vente_${mois}_${ent.id}_${vente.produit}_${vente.canal}${suffixeId}`,
        mois,
        produit: vente.produit,
        quantite: quantiteServie,
        prixTtcUnitaire: vente.prixUnitaireCentimes,
        coutRevientUnitaire,
        tauxTva: tvaStandard,
      });
      derniereEcritureDuGl();
      chiffreAffairesHt += prixHtDepuisTtc(vente.prixUnitaireCentimes, tvaStandard) * quantiteServie;
      piecesDirectes += quantiteServie;

      // Retours en ligne : part des pièces vendues en direct depuis le début du mois,
      // moins celles déjà retournées (on arrondit le cumul, pas chaque pas)
      incrementer(serviDirectParProduit, vente.produit as string, quantiteServie);
      const dejaRetourne = retourneParProduit[vente.produit as string] ?? 0;
      const quantiteRetournee =
        Math.round((serviDirectParProduit[vente.produit as string] ?? 0) * tauxRetourEnLigne) -
        dejaRetourne;
      if (quantiteRetournee > 0) {
        gl = enregistrerRetour(gl, {
          idEcriture: `retour_${mois}_${ent.id}_${vente.produit}${suffixeId}`,
          mois,
          produit: vente.produit,
          quantiteRetournee,
          prixTtcUnitaire: vente.prixUnitaireCentimes,
          coutRevientUnitaire,
          coutTraitementRetourUnitaire: coutTraitementRetour,
          tauxTva: tvaStandard,
        });
        derniereEcritureDuGl();
        // Le retour annule la vente au compte 707 : le CA cumulé (seuil de l'étape 2) suit.
        chiffreAffairesHt -= prixHtDepuisTtc(vente.prixUnitaireCentimes, tvaStandard) * quantiteRetournee;
        retourneParProduit[vente.produit as string] = dejaRetourne + quantiteRetournee;
        // Remettre en stock
        const valeurRetour = centimes(coutRevientUnitaire * quantiteRetournee);
        stocksFinis = augmenterStockFini(stocksFinis, vente.produit, quantiteRetournee, valeurRetour);
        stockRestant.set(
          vente.produit as string,
          (stockRestant.get(vente.produit as string) ?? 0) + quantiteRetournee,
        );
      }
    } else {
      // Revendeur : pas de TVA sur les ventes en gros (HT direct)
      gl = enregistrerVenteRevendeur(gl, {
        idEcriture: `vente_${mois}_${ent.id}_${vente.produit}_${vente.canal}${suffixeId}`,
        mois,
        produit: vente.produit,
        quantite: quantiteServie,
        prixGrosHtUnitaire: prixHtDepuisTtc(vente.prixUnitaireCentimes, tvaStandard),
        coutRevientUnitaire,
      });
      derniereEcritureDuGl();
      chiffreAffairesHt += prixHtDepuisTtc(vente.prixUnitaireCentimes, tvaStandard) * quantiteServie;
    }
  }
  ent = { ...ent, stocksFinis, ...(ent.pointsDeVente === undefined ? {} : { pointsDeVente }) };

  // Encaissements des créances revendeurs arrivées à échéance
  for (const creance of donnees.creancesAEncaisser) {
    if (creance.montant <= 0) continue;
    enr({
      id: `encaissement_${mois}_${creance.ecritureId}`,
      mois,
      libelle: `Encaissement créance revendeur`,
      lignes: [
        { compte: "512", sens: "debit", montant: creance.montant },
        { compte: "411", sens: "credit", montant: creance.montant },
      ],
    });
  }

  // Règlement des fournisseurs et façonniers arrivés à échéance (401 débit / 512 crédit).
  // Payé même si la banque passe sous zéro : le découvert est facturé à la clôture.
  for (const dette of donnees.dettesEchues ?? []) {
    if (dette.montant <= 0) continue;
    enr({
      id: `reglement_${dette.nature}_${dette.ordreId}`,
      mois,
      libelle:
        dette.nature === "matiere" ? "Règlement fournisseur de matière" : "Règlement façonnier",
      lignes: [
        { compte: "401", sens: "debit", montant: dette.montant },
        { compte: "512", sens: "credit", montant: dette.montant },
      ],
    });
  }

  // La trésorerie affichée suit la banque (512) au fil des pas
  ent = { ...ent, tresorerie: centimes(ent.tresorerie + netMouvements512(ecritures)) };

  return {
    entreprise: ent,
    ecritures,
    cumul: {
      ...cumulAvant,
      agregats: sommeAgregats(cumulAvant.agregats, agregatsDe(ecritures, gl.comptes)),
      produitParProduit,
      demandeParLigne,
      serviParLigne,
      serviDirectParProduit,
      retourneParProduit,
      chiffreAffairesHt,
      piecesDirectes,
    },
  };
}
