import type { Parametres } from "@kapital/content";
import { enregistrer, planComptableV1 } from "../comptabilite/index.js";
import type { EcritureComptable, GrandLivre } from "../comptabilite/types.js";
import {
  calculImpotSocietes,
  enregistrerImpotSocietes,
  parametresIsDepuis,
} from "../impots/calculs.js";
import { enregistrerEcheance, genererEcheancier } from "../prets/calculs.js";
import {
  coefficientsSalairesDepuisParametres,
  cotisationsPatronales,
  enregistrerPaieMensuelle,
} from "../salaires/calculs.js";
import type { Entreprise, Pret } from "../types/entreprise.js";
import { centimes, type MoisJeu } from "../types/primitifs.js";
import type { Explication } from "../types/resultatMois.js";
import type {
  CumulMois,
  DonneesFinMois,
  ResultatClotureEntreprise,
  VentePerdueParProduit,
} from "./donneesMois.js";
import { incrementerAnciennete, netMouvements512, sommeTvaCollectee } from "./flux.js";

/** Lignes de vente où la demande a dépassé le stock, directes d'abord. */
function ventesPerduesDepuisCumul(cumul: CumulMois): readonly VentePerdueParProduit[] {
  const lignes = Object.keys(cumul.demandeParLigne).map((cle) => {
    const [produit, canal] = cle.split("|") as [string, string];
    return { cle, produit, direct: canal === "vente_directe" };
  });
  // tri stable : ventes directes avant revendeurs, sinon ordre d'apparition
  const triees = [...lignes].sort((a, b) => Number(b.direct) - Number(a.direct));
  const perdues: VentePerdueParProduit[] = [];
  for (const l of triees) {
    const demandee = cumul.demandeParLigne[l.cle] ?? 0;
    const servie = cumul.serviParLigne[l.cle] ?? 0;
    if (servie < demandee) {
      perdues.push({
        produit: l.produit as VentePerdueParProduit["produit"],
        quantiteDemandee: demandee,
        quantiteServie: servie,
      });
    }
  }
  return perdues;
}

/**
 * Fin de mois : tout ce qui tombe à l'échéance du mois de jeu.
 * Paiement de la TVA du mois précédent, salaires et cotisations, loyer,
 * énergie, amortissement, échéance de prêt, déclaration de TVA, agios,
 * impôt de fin d'exercice, explications, ancienneté des salariés.
 *
 * `entreprise` est l'entreprise après les flux du mois ; `cumul` contient
 * toutes les écritures du mois déjà passées.
 */
export function cloturerMois(
  entreprise: Entreprise,
  cumul: CumulMois,
  donnees: DonneesFinMois,
  params: Parametres,
  mois: MoisJeu,
): ResultatClotureEntreprise {
  let ent = { ...entreprise };
  let gl: GrandLivre = planComptableV1();
  const ecrituresAccumulees: EcritureComptable[] = [...cumul.ecritures];

  function enr(ecriture: EcritureComptable): void {
    gl = enregistrer(gl, ecriture);
    ecrituresAccumulees.push(ecriture);
  }

  // Paiement TVA du mois précédent (44551 → 512)
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

  // Salaires
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

  // Atelier : loyer, énergie, amortissement
  if (ent.atelier !== null) {
    const atelier = ent.atelier;

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
    const prixElecParKwh = centimes(Math.round(params["prix_electricite_pro"]?.valeur ?? 16));
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

  // Prêts : échéances
  const pretsApres: Pret[] = [];
  for (const pret of ent.prets) {
    if (pret.capitalRestant <= 0) {
      pretsApres.push(pret);
      continue;
    }
    const numEcheance = mois - pret.moisDebut;
    if (numEcheance >= 1 && numEcheance <= pret.dureeTotaleMois) {
      const echeancier = genererEcheancier(pret.capitalInitial, pret.tauxAnnuel, pret.dureeTotaleMois);
      const echeance = echeancier[numEcheance - 1];
      if (echeance) {
        gl = enregistrerEcheance(gl, {
          idEcriture: `echeance_${mois}_${pret.id}`,
          mois,
          echeance,
        });
        ecrituresAccumulees.push(gl.ecritures[gl.ecritures.length - 1]!);
        pretsApres.push({ ...pret, capitalRestant: echeance.capitalRestantApres });
        continue;
      }
    }
    pretsApres.push(pret);
  }
  ent = { ...ent, prets: pretsApres };

  // Déclaration TVA du mois (toute la TVA collectée pendant le mois)
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

  // Découvert et agios (sur la trésorerie de début de mois et tous les mouvements du mois)
  const tresorerieFinAvantStatut = cumul.tresorerieDebutMois + netMouvements512(ecrituresAccumulees);

  let moisDecouvertConsecutifsApres = donnees.moisDecouvertConsecutifs;
  if (tresorerieFinAvantStatut < 0) {
    // Agios à 15 % annuel
    const agios = centimes(Math.round((Math.abs(tresorerieFinAvantStatut) * 0.15) / 12));
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

  // IS de fin d'exercice (tous les 12 mois)
  if (mois > 0 && mois % 12 === 0) {
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
    const is = calculImpotSocietes(resultatImposable, parametresIsDepuis(params));

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

  // Explications
  const ventesPerdues = ventesPerduesDepuisCumul(cumul);
  const tresorerieFin = centimes(cumul.tresorerieDebutMois + netMouvements512(ecrituresAccumulees));
  const variationTresorerie = centimes(tresorerieFin - cumul.tresorerieDebutMois);
  const signVariation = variationTresorerie >= 0 ? "+" : "";

  const explications: Explication[] = [
    {
      cle: "tresorerie",
      message: `Trésorerie : ${(cumul.tresorerieDebutMois / 100).toFixed(2)} € → ${(tresorerieFin / 100).toFixed(2)} € (variation : ${signVariation}${(variationTresorerie / 100).toFixed(2)} €)`,
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

  if (cumul.chiffreAffairesHt > 0) {
    explications.push({
      cle: "ventes",
      message: `Chiffre d'affaires HT : ${(cumul.chiffreAffairesHt / 100).toFixed(2)} €, ventes directes : ${cumul.piecesDirectes} pièces`,
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

  // Mise à jour de l'état de l'entreprise
  ent = incrementerAnciennete(ent);
  ent = { ...ent, tresorerie: tresorerieFin, statut: nouveauStatut };

  return {
    entrepriseApres: ent,
    ecritures: ecrituresAccumulees,
    ventesPerdues,
    explications,
    moisDecouvertConsecutifsApres,
  };
}
