import {
  montantLivraisonMatiere,
  planComptableV1,
  type CumulMois,
  type DonneesFlux,
  type EcritureComptable,
  type Entreprise,
  type ResultatSimulerPas,
} from "@kapital/engine";
import type { DetailCloture, EvenementJournal, PaiementsCloture } from "./types.js";

/** Ce que l'orchestrateur sait du pas, en plus de l'état avant / après. */
export type ContexteEvenementsPas = {
  /** Événements datés qui tombaient dans ce pas (livraisons, créances). */
  readonly flux: DonneesFlux;
  /** État du mois avant ce pas ; null au premier pas du mois. */
  readonly cumulAvant: CumulMois | null;
  /** Mois de jeu du pas (compté depuis 0). */
  readonly mois: number;
  /** Pas absolu sur l'horloge commune. */
  readonly pasAbsolu: number;
  /** Instant réel de fin du pas, en ms. */
  readonly instantMs: number;
};

const TYPES_COMPTES = planComptableV1().comptes;

/** Classe une écriture de clôture d'après son identifiant (voir moteur/cloture.ts). */
function categorie(idEcriture: string): keyof PaiementsCloture {
  if (idEcriture.startsWith("salaire_pmt_")) return "paie";
  if (
    idEcriture.startsWith("loyer_") ||
    idEcriture.startsWith("charges_locatives_") ||
    idEcriture.startsWith("boutique_loyer_") ||
    idEcriture.startsWith("boutique_charges_")
  ) {
    return "loyers";
  }
  if (idEcriture.startsWith("echeance_")) return "echeances";
  if (idEcriture.startsWith("tva_paiement_")) return "tva";
  if (idEcriture.startsWith("is_pmt_")) return "impot";
  if (idEcriture.startsWith("agios_")) return "agios";
  if (idEcriture.startsWith("energie_")) return "energie";
  return "autres";
}

function sortieBanque(ecriture: EcritureComptable): number {
  return ecriture.lignes
    .filter((l) => l.compte === "512" && l.sens === "credit")
    .reduce((s, l) => s + l.montant, 0);
}

/** Paiements de la clôture, par nature (sorties du compte 512). */
export function paiementsDeCloture(ecritures: readonly EcritureComptable[]): PaiementsCloture {
  const p = { paie: 0, loyers: 0, echeances: 0, tva: 0, impot: 0, agios: 0, energie: 0, autres: 0 };
  for (const ec of ecritures) {
    const montant = sortieBanque(ec);
    if (montant > 0) p[categorie(ec.id)] += montant;
  }
  return p;
}

function produitsEtCharges(ecritures: readonly EcritureComptable[]): { produits: number; charges: number; ventes707: number } {
  let produits = 0;
  let charges = 0;
  let ventes707 = 0;
  for (const ec of ecritures) {
    for (const l of ec.lignes) {
      const signe = l.sens === "debit" ? 1 : -1;
      const type = TYPES_COMPTES[l.compte]?.type;
      if (type === "produits") produits -= signe * l.montant;
      else if (type === "charges") charges += signe * l.montant;
      if (l.compte === "707") ventes707 -= signe * l.montant;
    }
  }
  return { produits, charges, ventes707 };
}

function quantitesParProduit(lignes: readonly { produit: string; quantite: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lignes) m.set(l.produit, (m.get(l.produit) ?? 0) + l.quantite);
  return m;
}

/** Produits dont le stock était positif avant le pas et vaut 0 après. */
function produitsEnRupture(
  avant: readonly { produit: string; quantite: number }[],
  apres: readonly { produit: string; quantite: number }[],
): string[] {
  const qAvant = quantitesParProduit(avant);
  const qApres = quantitesParProduit(apres);
  return [...qAvant.entries()]
    .filter(([produit, q]) => q > 0 && (qApres.get(produit) ?? 0) <= 0)
    .map(([produit]) => produit)
    .sort();
}

/**
 * Ce qu'un pas a changé pour le joueur, en événements de journal. Fonction pure : mêmes
 * entrées, mêmes événements, mêmes clés (l'idempotence de l'enregistrement en dépend).
 *
 * - livraison de matière et de production : une par commande livrée ;
 * - rupture de stock : un produit dont le stock tombe à 0 (une par produit et par mois) ;
 * - découvert : la banque passe sous zéro (un par mois) ;
 * - créances revendeurs encaissées (une par mois) ;
 * - étape franchie (une par étape) ;
 * - clôture du mois : paiements, résultat, explications du moteur (une par mois).
 */
export function evenementsDuPas(
  avant: Entreprise,
  apres: Entreprise,
  resultat: ResultatSimulerPas,
  ctx: ContexteEvenementsPas,
): EvenementJournal[] {
  const { flux, mois, pasAbsolu, instantMs } = ctx;
  const base = { moisJeu: mois, pas: pasAbsolu, instantMs };
  const evenements: EvenementJournal[] = [];

  for (const l of flux.livraisonsMatiere) {
    evenements.push({
      ...base,
      type: "livraison_matiere",
      cle: `livraison_matiere_${l.id}`,
      titre: "Livraison de matière reçue",
      detail: {
        commande: l.id,
        matiere: l.matiere,
        quantite: l.quantite,
        montant: montantLivraisonMatiere(l.quantite, l.prixUnitaire),
        aCredit: l.modePaiement === "credit",
      },
    });
  }

  for (const l of flux.livraisonsFaconniers) {
    evenements.push({
      ...base,
      type: "livraison_production",
      cle: `livraison_production_${l.id}`,
      titre: "Production livrée",
      detail: { ordre: l.id, produit: l.produit, quantite: l.quantite },
    });
  }

  for (const produit of produitsEnRupture(avant.stocksFinis, apres.stocksFinis)) {
    evenements.push({
      ...base,
      type: "rupture_stock",
      cle: `rupture_${mois}_${produit}`,
      titre: "Rupture de stock",
      detail: { produit, lieu: "atelier" },
    });
  }
  for (const pdv of apres.pointsDeVente ?? []) {
    const pdvAvant = (avant.pointsDeVente ?? []).find((p) => p.id === pdv.id);
    if (!pdvAvant) continue;
    for (const produit of produitsEnRupture(pdvAvant.stock, pdv.stock)) {
      evenements.push({
        ...base,
        type: "rupture_stock",
        cle: `rupture_${mois}_${pdv.id}_${produit}`,
        titre: "Rupture de stock en boutique",
        detail: { produit, lieu: "boutique", pointDeVente: pdv.id },
      });
    }
  }

  const creances = flux.creancesAEncaisser.reduce((s, c) => s + c.montant, 0);
  if (creances > 0) {
    evenements.push({
      ...base,
      type: "creance_encaissee",
      cle: `creances_${mois}`,
      titre: "Paiement des revendeurs encaissé",
      detail: { montant: creances, nombre: flux.creancesAEncaisser.length },
    });
  }

  if (avant.tresorerie >= 0 && apres.tresorerie < 0) {
    evenements.push({
      ...base,
      type: "decouvert",
      cle: `decouvert_${mois}`,
      titre: "Compte à découvert",
      detail: { tresorerie: apres.tresorerie },
    });
  }

  if (apres.etape > avant.etape) {
    evenements.push({
      ...base,
      type: "etape_franchie",
      cle: `etape_${apres.etape}`,
      titre: `Étape ${apres.etape} franchie`,
      detail: { etapeAvant: avant.etape, etapeApres: apres.etape },
    });
  }

  const cloture = resultat.cloture;
  if (cloture !== null) {
    const pc = produitsEtCharges(resultat.ecrituresDuPas);
    const produits = (ctx.cumulAvant?.agregats.produits ?? 0) + pc.produits;
    const charges = (ctx.cumulAvant?.agregats.charges ?? 0) + pc.charges;
    const paiements = paiementsDeCloture(cloture.ecritures);
    const ventesPerdues = cloture.ventesPerdues
      .map((v) => ({ produit: v.produit as string, manquantes: v.quantiteDemandee - v.quantiteServie }))
      .filter((v) => v.manquantes > 0);
    const detail: DetailCloture = {
      mois,
      tresorerieDebut: ctx.cumulAvant?.tresorerieDebutMois ?? avant.tresorerie,
      tresorerieFin: cloture.entrepriseApres.tresorerie,
      chiffreAffairesHt: (ctx.cumulAvant?.chiffreAffairesHt ?? 0) + pc.ventes707,
      produits,
      charges,
      resultat: produits - charges,
      paiements,
      totalPaye: Object.values(paiements).reduce((s, x) => s + x, 0),
      piecesNonLivrees: ventesPerdues.reduce((s, v) => s + v.manquantes, 0),
      ventesPerdues,
      explications: cloture.explications.map((e) => ({ cle: e.cle, message: e.message })),
      etapeAvant: avant.etape,
      etapeApres: cloture.etapeApres,
      moisDecouvertConsecutifs: cloture.moisDecouvertConsecutifsApres,
    };
    evenements.push({
      ...base,
      type: "cloture_mois",
      cle: `cloture_${mois}`,
      titre: `Mois ${mois} clos`,
      detail,
    });
  }

  return evenements;
}

/** Mission validée sur le site (apps/web/lib/missions.ts) : une seule fois par mission. */
export function evenementMissionValidee(e: {
  readonly missionId: string;
  readonly titreMission: string;
  readonly moisJeu: number;
  readonly instantMs: number;
}): EvenementJournal {
  return {
    type: "mission_validee",
    cle: `mission_${e.missionId}`,
    moisJeu: e.moisJeu,
    pas: null,
    instantMs: e.instantMs,
    titre: "Mission validée",
    detail: { mission: e.missionId, titreMission: e.titreMission },
  };
}
