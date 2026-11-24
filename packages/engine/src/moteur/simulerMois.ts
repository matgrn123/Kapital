import type { Parametres } from "@kapital/content";
import { ajouterComptes, enregistrer, planComptableV1, soldeCompte } from "../comptabilite/index.js";
import type { EcritureComptable, GrandLivre } from "../comptabilite/types.js";
import { rendement, capaciteMinutes } from "../atelier/calculs.js";
import {
  calculImpotSocietes,
  enregistrerImpotSocietes,
  parametresIsDepuis,
} from "../impots/calculs.js";
import { coefficientsMarketingDepuisParametres, fluxMarque } from "../marketing/index.js";
import type { DepenseMarketing } from "../marketing/types.js";
import { calculerVentesMois } from "../marche/ventesMois.js";
import type { VenteGeneree } from "../marche/ventesMois.js";
import { genererEcheancier, enregistrerEcheance } from "../prets/calculs.js";
import {
  coefficientsSalairesDepuisParametres,
  cotisationsPatronales,
  enregistrerPaieMensuelle,
} from "../salaires/calculs.js";
import type {
  Entreprise,
  LigneStockFini,
  LigneStockMatiere,
  Pret,
} from "../types/entreprise.js";
import type { MarketInputs } from "../types/marketInputs.js";
import type { Monde } from "../types/monde.js";
import {
  centimes,
  minutes,
  type Centimes,
  type Graine,
  type IdMatiere,
  type IdProduit,
  type MoisJeu,
} from "../types/primitifs.js";
import type { Explication } from "../types/resultatMois.js";
import {
  enregistrerRetour,
  enregistrerVenteDirecte,
  enregistrerVenteRevendeur,
  prixHtDepuisTtc,
} from "../ventes/ventes.js";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Livraison de matière qui arrive ce mois */
export type LivraisonMatiere = {
  readonly id: string;
  readonly matiere: IdMatiere;
  readonly quantite: number;
  readonly prixUnitaire: Centimes;
  readonly modePaiement: "immediat" | "credit";
};

/** Livraison façonnier qui arrive ce mois */
export type LivraisonFaconnier = {
  readonly id: string;
  readonly produit: IdProduit;
  readonly quantite: number;
  readonly prixFaconParPiece: Centimes;
  readonly coutMatiereParPiece: Centimes;
};

/** Dépense marketing ce mois */
export type DepenseMarketingMois = {
  readonly id: string;
  readonly action: string;
  readonly montant: Centimes;
};

/** Créance à encaisser ce mois (vente revendeur d'il y a 2 mois) */
export type CreanceAEncaisser = {
  readonly ecritureId: string;
  readonly montant: Centimes;
};

/** Toutes les données réelles pour la clôture de ce mois */
export type DonneesReellesMois = {
  readonly livraisonsMatiere: readonly LivraisonMatiere[];
  readonly livraisonsFaconniers: readonly LivraisonFaconnier[];
  readonly depensesMarketing: readonly DepenseMarketingMois[];
  readonly creancesAEncaisser: readonly CreanceAEncaisser[];
  readonly tvaAPayerCeMois: Centimes;
  readonly moisDecouvertConsecutifs: number;
};

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/** Produit pour lequel la demande a dépassé le stock */
export type VentePerdueParProduit = {
  readonly produit: IdProduit;
  readonly quantiteDemandee: number;
  readonly quantiteServie: number;
};

/** Résultat de la clôture mensuelle pour une entreprise */
export type ResultatClotureEntreprise = {
  readonly entrepriseApres: Entreprise;
  readonly ecritures: readonly EcritureComptable[];
  readonly ventesPerdues: readonly VentePerdueParProduit[];
  readonly explications: readonly Explication[];
  readonly moisDecouvertConsecutifsApres: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Somme de tous les mouvements du compte 512 dans une liste d'écritures */
function netMouvements512(ecritures: readonly EcritureComptable[]): number {
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

/** Met à jour ou crée une ligne de stock matière avec CMP recalculé */
function mettreAJourStockMatiere(
  stocks: readonly LigneStockMatiere[],
  matiere: IdMatiere,
  quantiteAjoutee: number,
  valeurAjoutee: Centimes,
): readonly LigneStockMatiere[] {
  const idx = stocks.findIndex((s) => s.matiere === matiere);
  if (idx === -1) {
    return [
      ...stocks,
      { matiere, quantite: quantiteAjoutee, valeurTotale: valeurAjoutee },
    ];
  }
  const existing = stocks[idx]!;
  const newQte = existing.quantite + quantiteAjoutee;
  const newVal = centimes(existing.valeurTotale + valeurAjoutee);
  return stocks.map((s, i) =>
    i === idx ? { ...s, quantite: newQte, valeurTotale: newVal } : s,
  );
}

/** Consomme de la matière en FIFO/CMP et retourne la valeur consommée + stocks mis à jour */
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
  const existing = stocks[idx]!;
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

/** Somme TVA collectée depuis les écritures du grand livre de ce mois */
function sommeTvaCollectee(ecritures: readonly EcritureComptable[]): number {
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
function incrementerAnciennete(entreprise: Entreprise): Entreprise {
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
// Fonction principale
// ---------------------------------------------------------------------------

export function simulerMoisEntreprise(
  entreprise: Entreprise,
  donnees: DonneesReellesMois,
  marketInputs: MarketInputs,
  params: Parametres,
  _graine: Graine,
  mois: MoisJeu,
): ResultatClotureEntreprise {
  // État mutable en cours de traitement (on part de copies immutables)
  let ent = { ...entreprise };
  let gl: GrandLivre = planComptableV1();
  const ecrituresAccumulees: EcritureComptable[] = [];

  // Helper pour enregistrer dans le GL et garder trace
  function enr(ecriture: EcritureComptable): void {
    gl = enregistrer(gl, ecriture);
    ecrituresAccumulees.push(ecriture);
  }

  // -------------------------------------------------------------------------
  // Étape 1 : Livraisons de matière
  // -------------------------------------------------------------------------
  for (const livraison of donnees.livraisonsMatiere) {
    const montantTotal = centimes(livraison.quantite * livraison.prixUnitaire);
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
    const sensContrepartie = livraison.modePaiement === "immediat" ? "credit" : "credit";
    enr({
      id: `livraison_mat_${mois}_${livraison.id}`,
      mois,
      libelle: `Livraison matière ${livraison.matiere} ×${livraison.quantite}`,
      lignes: [
        { compte: "31", sens: "debit", montant: montantTotal },
        { compte: compteContrepartie, sens: sensContrepartie, montant: montantTotal },
      ],
    });
  }

  // -------------------------------------------------------------------------
  // Étape 2 : Livraisons façonniers
  // -------------------------------------------------------------------------
  for (const livraison of donnees.livraisonsFaconniers) {
    const totalMatiere = centimes(livraison.coutMatiereParPiece * livraison.quantite);
    const totalFacon = centimes(livraison.prixFaconParPiece * livraison.quantite);
    const totalPF = centimes(totalMatiere + totalFacon);
    ent = {
      ...ent,
      stocksFinis: augmenterStockFini(ent.stocksFinis, livraison.produit, livraison.quantite, totalPF),
    };
    enr({
      id: `livraison_fac_${mois}_${livraison.id}`,
      mois,
      libelle: `Livraison façonnier ${livraison.produit} ×${livraison.quantite}`,
      lignes: [
        { compte: "35", sens: "debit", montant: totalPF },
        { compte: "31", sens: "credit", montant: totalMatiere },
        { compte: "401", sens: "credit", montant: totalFacon },
      ],
    });
  }

  // -------------------------------------------------------------------------
  // Étape 3 : Production atelier
  // -------------------------------------------------------------------------
  if (ent.atelier !== null) {
    const artisans = ent.salaries.filter((s) => s.poste === "artisan");
    const nbArtisans = artisans.length;
    if (nbArtisans > 0) {
      const avgExperience =
        artisans.reduce((sum, s) => sum + s.experienceMois, 0) / nbArtisans;
      const rMin = params["rendement_atelier_min"]?.valeur ?? 0.4;
      const rMax = params["rendement_atelier_max"]?.valeur ?? 0.75;
      const tau = params["rendement_tau_mois"]?.valeur ?? 6;
      const heuresMensuelles = params["heures_mensuelles_legales"]?.valeur ?? 151.67;
      const rendementEffectif = rendement(avgExperience, rMin, rMax, tau);
      const capMinutes = capaciteMinutes(
        nbArtisans,
        ent.atelier.nombreMachines,
        heuresMensuelles,
        rendementEffectif,
      );
      let remainingCapacity = capMinutes;

      // Temps standard par pièce (simplification : 30 min/pièce si non disponible)
      const TEMPS_STANDARD_PAR_PIECE_MINUTES = 30;

      for (const produitEnt of ent.catalogue) {
        if (produitEnt.productionMensuelleCible <= 0) continue;
        if (remainingCapacity <= 0) break;

        const piecesProducibles = Math.floor(
          remainingCapacity / TEMPS_STANDARD_PAR_PIECE_MINUTES,
        );
        const piecesAProduits = Math.min(
          produitEnt.productionMensuelleCible,
          piecesProducibles,
        );
        if (piecesAProduits <= 0) continue;

        // Trouver la première matière disponible
        const premierStock = ent.stocksMatiere.find((s) => s.quantite > 0);
        if (!premierStock) break;

        // Consommation : 1 unité de matière par pièce (simplification)
        const qteMatiere = piecesAProduits;
        const { valeur: valeurMatiere, stocks: stocksAprès } = consommerStockMatiere(
          ent.stocksMatiere,
          premierStock.matiere,
          qteMatiere,
        );

        if (valeurMatiere <= 0) {
          // Pas de valeur matière, on produit quand même mais à coût 0 (ateliers sans stock)
          ent = {
            ...ent,
            stocksFinis: augmenterStockFini(
              ent.stocksFinis,
              produitEnt.produit,
              piecesAProduits,
              centimes(0),
            ),
          };
        } else {
          ent = {
            ...ent,
            stocksMatiere: stocksAprès,
            stocksFinis: augmenterStockFini(
              ent.stocksFinis,
              produitEnt.produit,
              piecesAProduits,
              valeurMatiere,
            ),
          };
          enr({
            id: `production_atelier_${mois}_${ent.id}_${produitEnt.produit}`,
            mois,
            libelle: `Production atelier ${produitEnt.produit} ×${piecesAProduits}`,
            lignes: [
              { compte: "35", sens: "debit", montant: valeurMatiere },
              { compte: "31", sens: "credit", montant: valeurMatiere },
            ],
          });
        }

        remainingCapacity = minutes(remainingCapacity - piecesAProduits * TEMPS_STANDARD_PAR_PIECE_MINUTES);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Étape 4 : Marketing
  // -------------------------------------------------------------------------
  const coeffsMarketing = coefficientsMarketingDepuisParametres(params);
  const depensesMarketingPourFlux: DepenseMarketing[] = donnees.depensesMarketing
    .filter((d) => d.montant > 0)
    .map((d) => ({
      action: d.action as DepenseMarketing["action"],
      montant: d.montant,
    }));
  const nouvelleMarque = fluxMarque(
    ent.marque,
    1,
    depensesMarketingPourFlux,
    coeffsMarketing,
  );
  ent = { ...ent, marque: nouvelleMarque };

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

  // -------------------------------------------------------------------------
  // Étape 5 : Ventes et clamp au stock
  // -------------------------------------------------------------------------
  const tvaStandard = params["tva_standard"]?.valeur ?? 0.2;
  const coutTraitementRetour = centimes(
    Math.round(params["cout_traitement_retour"]?.valeur ?? 1750),
  );
  const tauxRetourEnLigne = params["taux_retour_vente_en_ligne"]?.valeur ?? 0.19;

  // Construction d'un Monde minimal pour calculerVentesMois
  const mondePourVentes: Monde = {
    moisCourant: mois,
    entreprises: [ent],
    prixMatieres: [],
    franges: [],
    evenements: [],
  };

  const ventesGenerees: readonly VenteGeneree[] = calculerVentesMois(
    mondePourVentes,
    1,
    params,
  );

  // Stocks disponibles par produit (map mutable pour le clamp)
  const stockRestant = new Map<string, number>();
  for (const sf of ent.stocksFinis) {
    stockRestant.set(sf.produit as string, sf.quantite);
  }

  // Prioriser vente_directe avant revendeur
  const ventesTriees = [...ventesGenerees].sort((a, b) => {
    if (a.canal === "vente_directe" && b.canal === "revendeur") return -1;
    if (a.canal === "revendeur" && b.canal === "vente_directe") return 1;
    return 0;
  });

  const ventesPerdues: VentePerdueParProduit[] = [];
  let totalCA = 0;
  let totalPiecesDirect = 0;
  let stocksFinis = ent.stocksFinis;

  for (const vente of ventesTriees) {
    // On ne traite que les ventes de notre entreprise
    if (vente.entreprise !== ent.id) continue;

    const stockDispo = stockRestant.get(vente.produit as string) ?? 0;
    const quantiteServie = Math.min(vente.quantite, stockDispo);

    if (quantiteServie < vente.quantite) {
      ventesPerdues.push({
        produit: vente.produit,
        quantiteDemandee: vente.quantite,
        quantiteServie,
      });
    }

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
        idEcriture: `vente_${mois}_${ent.id}_${vente.produit}_${vente.canal}`,
        mois,
        produit: vente.produit,
        quantite: quantiteServie,
        prixTtcUnitaire: vente.prixUnitaireCentimes,
        coutRevientUnitaire,
        tauxTva: tvaStandard,
      });
      ecrituresAccumulees.push(
        gl.ecritures[gl.ecritures.length - 1]!,
      );
      totalCA += prixHtDepuisTtc(vente.prixUnitaireCentimes, tvaStandard) * quantiteServie;
      totalPiecesDirect += quantiteServie;

      // -----------------------------------------------------------------------
      // Étape 6 : Retours en ligne (19 %)
      // -----------------------------------------------------------------------
      const quantiteRetournee = Math.round(quantiteServie * tauxRetourEnLigne);
      if (quantiteRetournee > 0) {
        gl = enregistrerRetour(gl, {
          idEcriture: `retour_${mois}_${ent.id}_${vente.produit}`,
          mois,
          produit: vente.produit,
          quantiteRetournee,
          prixTtcUnitaire: vente.prixUnitaireCentimes,
          coutRevientUnitaire,
          coutTraitementRetourUnitaire: coutTraitementRetour,
          tauxTva: tvaStandard,
        });
        ecrituresAccumulees.push(
          gl.ecritures[gl.ecritures.length - 1]!,
        );
        // Remettre en stock
        const valeurRetour = centimes(coutRevientUnitaire * quantiteRetournee);
        stocksFinis = augmenterStockFini(stocksFinis, vente.produit, quantiteRetournee, valeurRetour);
        stockRestant.set(
          vente.produit as string,
          (stockRestant.get(vente.produit as string) ?? 0) + quantiteRetournee,
        );
      }
    } else {
      // revendeur — pas de TVA sur les ventes en gros (HT direct)
      const prixHt = prixHtDepuisTtc(vente.prixUnitaireCentimes, tvaStandard);
      gl = enregistrerVenteRevendeur(gl, {
        idEcriture: `vente_${mois}_${ent.id}_${vente.produit}_${vente.canal}`,
        mois,
        produit: vente.produit,
        quantite: quantiteServie,
        prixGrosHtUnitaire: prixHt,
        coutRevientUnitaire,
      });
      ecrituresAccumulees.push(
        gl.ecritures[gl.ecritures.length - 1]!,
      );
      totalCA += prixHt * quantiteServie;
    }
  }

  ent = { ...ent, stocksFinis };

  // -------------------------------------------------------------------------
  // Étape 7 : Encaissements créances revendeurs
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Étape 8 : Paiement TVA du mois précédent (44551 → 512)
  // -------------------------------------------------------------------------
  if (donnees.tvaAPayerCeMois > 0) {
    enr({
      id: `tva_paiement_${mois}_${ent.id}`,
      mois,
      libelle: `Paiement TVA mois précédent`,
      lignes: [
        { compte: "44551", sens: "debit", montant: donnees.tvaAPayerCeMois },
        { compte: "512", sens: "credit", montant: donnees.tvaAPayerCeMois },
      ],
    });
  }

  // -------------------------------------------------------------------------
  // Étape 9 : Charges fixes
  // -------------------------------------------------------------------------

  // 9a. Salaires
  const coeffsSalaires = coefficientsSalairesDepuisParametres(params);
  let totalSalairesBruts = 0;

  for (const salarie of ent.salaries) {
    if (salarie.id === undefined) continue;
    const cotisations = cotisationsPatronales({
      salaireBrutMensuel: salarie.salaireBrutMensuel,
      smicMensuelBrut: coeffsSalaires.smicMensuelBrut,
      tauxCotisationsSmic: coeffsSalaires.tauxCotisationsSmic,
      tauxCotisationsPleines: coeffsSalaires.tauxCotisationsPleines,
      seuilCotisationsPleinesEnSmic: coeffsSalaires.seuilCotisationsPleinesEnSmic,
    });
    // Enregistrement comptable 641+645 / 421+431
    gl = enregistrerPaieMensuelle(gl, {
      idEcriture: `salaire_${mois}_${salarie.id}`,
      mois,
      salaireBrutMensuel: salarie.salaireBrutMensuel,
      cotisationsPatronales: cotisations,
    });
    ecrituresAccumulees.push(gl.ecritures[gl.ecritures.length - 1]!);

    // Paiement immédiat : 421+431 débit, 512 crédit
    const totalAPayer = centimes(salarie.salaireBrutMensuel + cotisations);
    enr({
      id: `salaire_pmt_${mois}_${salarie.id}`,
      mois,
      libelle: `Paiement salaire ${salarie.id}`,
      lignes: [
        { compte: "421", sens: "debit", montant: salarie.salaireBrutMensuel },
        { compte: "431", sens: "debit", montant: cotisations },
        { compte: "512", sens: "credit", montant: totalAPayer },
      ],
    });

    totalSalairesBruts += salarie.salaireBrutMensuel;
  }

  // 9b. Atelier : loyer, énergie, amortissement
  if (ent.atelier !== null) {
    const atelier = ent.atelier;

    // Loyer
    if (atelier.loyerMensuel > 0) {
      enr({
        id: `loyer_${mois}_${ent.id}`,
        mois,
        libelle: `Loyer atelier`,
        lignes: [
          { compte: "613", sens: "debit", montant: atelier.loyerMensuel },
          { compte: "512", sens: "credit", montant: atelier.loyerMensuel },
        ],
      });
    }

    // Énergie : 100 kwh/machine/mois
    const prixElecParKwh = centimes(
      Math.round(params["prix_electricite_pro"]?.valeur ?? 16),
    );
    const energieCentimes = centimes(atelier.nombreMachines * 100 * prixElecParKwh);
    if (energieCentimes > 0) {
      enr({
        id: `energie_${mois}_${ent.id}`,
        mois,
        libelle: `Énergie atelier (${atelier.nombreMachines} machines)`,
        lignes: [
          { compte: "606", sens: "debit", montant: energieCentimes },
          { compte: "512", sens: "credit", montant: energieCentimes },
        ],
      });
    }

    // Amortissement machines (non-cash) : 5000€ par machine, 5 ans = 60 mois
    const valeurMachineUnitaire = centimes(500000);
    const amortMensuel = centimes(
      Math.round((valeurMachineUnitaire * atelier.nombreMachines) / 60),
    );
    if (amortMensuel > 0) {
      enr({
        id: `amort_${mois}_${ent.id}`,
        mois,
        libelle: `Amortissement machines`,
        lignes: [
          { compte: "681", sens: "debit", montant: amortMensuel },
          { compte: "2815", sens: "credit", montant: amortMensuel },
        ],
      });
    }
  }

  // 9c. Prêts : échéances
  const pretsAprés: Pret[] = [];
  for (const pret of ent.prets) {
    if (pret.capitalRestant <= 0) {
      pretsAprés.push(pret);
      continue;
    }
    const numEcheance = mois - pret.moisDebut;
    if (numEcheance >= 1 && numEcheance <= pret.dureeTotaleMois) {
      const echeancier = genererEcheancier(
        pret.capitalInitial,
        pret.tauxAnnuel,
        pret.dureeTotaleMois,
      );
      const echeance = echeancier[numEcheance - 1];
      if (echeance) {
        gl = enregistrerEcheance(gl, {
          idEcriture: `echeance_${mois}_${pret.id}`,
          mois,
          echeance,
        });
        ecrituresAccumulees.push(gl.ecritures[gl.ecritures.length - 1]!);
        pretsAprés.push({ ...pret, capitalRestant: echeance.capitalRestantApres });
        continue;
      }
    }
    pretsAprés.push(pret);
  }
  ent = { ...ent, prets: pretsAprés };

  // -------------------------------------------------------------------------
  // Étape 10 : Déclaration TVA du mois
  // -------------------------------------------------------------------------
  const tvaCollecteeCeMois = sommeTvaCollectee(ecrituresAccumulees);
  if (tvaCollecteeCeMois > 0) {
    const tvaCollecteeArrondie = centimes(Math.round(tvaCollecteeCeMois));
    enr({
      id: `tva_declaration_${mois}_${ent.id}`,
      mois,
      libelle: `Déclaration TVA mensuelle`,
      lignes: [
        { compte: "44571", sens: "debit", montant: tvaCollecteeArrondie },
        { compte: "44551", sens: "credit", montant: tvaCollecteeArrondie },
      ],
    });
  }

  // -------------------------------------------------------------------------
  // Étape 11 : Découvert et agios
  // -------------------------------------------------------------------------
  const net512 = netMouvements512(ecrituresAccumulees);
  const tresorerieFinAvantStatut = ent.tresorerie + net512;

  let moisDecouvertConsecutifsApres = donnees.moisDecouvertConsecutifs;
  if (tresorerieFinAvantStatut < 0) {
    // Agios à 15 % annuel
    const agios = centimes(
      Math.round(Math.abs(tresorerieFinAvantStatut) * 0.15 / 12),
    );
    if (agios > 0) {
      enr({
        id: `agios_${mois}_${ent.id}`,
        mois,
        libelle: `Agios découvert bancaire`,
        lignes: [
          { compte: "661", sens: "debit", montant: agios },
          { compte: "512", sens: "credit", montant: agios },
        ],
      });
    }
    moisDecouvertConsecutifsApres = donnees.moisDecouvertConsecutifs + 1;
  } else {
    moisDecouvertConsecutifsApres = 0;
  }

  let nouveauStatut = ent.statut;
  if (moisDecouvertConsecutifsApres >= 3) {
    nouveauStatut = "en_difficulte";
  }

  // -------------------------------------------------------------------------
  // Étape 12 : IS de fin d'exercice (tous les 12 mois)
  // -------------------------------------------------------------------------
  if (mois > 0 && mois % 12 === 0) {
    // Calculer le résultat imposable depuis le grand livre
    let totalProduits = 0;
    let totalCharges = 0;
    for (const ec of ecrituresAccumulees) {
      for (const ligne of ec.lignes) {
        const compte = gl.comptes[ligne.compte];
        if (!compte) continue;
        if (compte.type === "produits") {
          totalProduits += ligne.sens === "credit" ? ligne.montant : -ligne.montant;
        } else if (compte.type === "charges") {
          totalCharges += ligne.sens === "debit" ? ligne.montant : -ligne.montant;
        }
      }
    }
    const resultatImposable = centimes(Math.max(0, totalProduits - totalCharges));
    const paramsIS = parametresIsDepuis(params);
    const is = calculImpotSocietes(resultatImposable, paramsIS);

    if (is > 0) {
      gl = enregistrerImpotSocietes(gl, {
        idEcriture: `is_${mois}_${ent.id}`,
        mois,
        montant: is,
      });
      ecrituresAccumulees.push(gl.ecritures[gl.ecritures.length - 1]!);
      // Paiement immédiat de l'IS
      enr({
        id: `is_pmt_${mois}_${ent.id}`,
        mois,
        libelle: `Paiement IS annuel`,
        lignes: [
          { compte: "444", sens: "debit", montant: is },
          { compte: "512", sens: "credit", montant: is },
        ],
      });
    }
  }

  // -------------------------------------------------------------------------
  // Étape 13 : Explications
  // -------------------------------------------------------------------------
  const net512Final = netMouvements512(ecrituresAccumulees);
  const tresorerieFin = centimes(ent.tresorerie + net512Final);
  const variationTresorerie = centimes(tresorerieFin - entreprise.tresorerie);
  const signVariation = variationTresorerie >= 0 ? "+" : "";

  const explications: Explication[] = [
    {
      cle: "tresorerie",
      message: `Trésorerie : ${(entreprise.tresorerie / 100).toFixed(2)} € → ${(tresorerieFin / 100).toFixed(2)} € (variation : ${signVariation}${(variationTresorerie / 100).toFixed(2)} €)`,
    },
  ];

  if (totalSalairesBruts > 0) {
    explications.push({
      cle: "salaires",
      message: `Salaires bruts : ${(totalSalairesBruts / 100).toFixed(2)} €`,
    });
  }

  if (ent.atelier !== null && ent.atelier.loyerMensuel > 0) {
    explications.push({
      cle: "loyer",
      message: `Loyer atelier : ${(ent.atelier.loyerMensuel / 100).toFixed(2)} €`,
    });
  }

  if (totalCA > 0) {
    explications.push({
      cle: "ventes",
      message: `Chiffre d'affaires HT : ${(totalCA / 100).toFixed(2)} €, ventes directes : ${totalPiecesDirect} pièces`,
    });
  }

  if (ventesPerdues.length > 0) {
    const totalPerdues = ventesPerdues.reduce(
      (sum, v) => sum + (v.quantiteDemandee - v.quantiteServie),
      0,
    );
    explications.push({
      cle: "ventes_perdues",
      message: `Stock insuffisant : ${totalPerdues} pièces non livrées`,
    });
  }

  // -------------------------------------------------------------------------
  // Étape 14 : Mise à jour de l'état de l'entreprise
  // -------------------------------------------------------------------------
  ent = incrementerAnciennete(ent);
  ent = {
    ...ent,
    tresorerie: tresorerieFin,
    statut: nouveauStatut,
  };

  return {
    entrepriseApres: ent,
    ecritures: ecrituresAccumulees,
    ventesPerdues,
    explications,
    moisDecouvertConsecutifsApres,
  };
}
