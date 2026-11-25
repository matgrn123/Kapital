// Aperçus affichés AVANT de valider un formulaire (vente et prix, production, achats, publicité).
// Tous les montants et toutes les écritures viennent des fonctions pures du moteur
// (@kapital/engine) ; ce fichier ne fait que les appeler et mettre leurs résultats en forme.
// Exception signalée : la publicité, dont l'écriture est passée par la route
// /api/actions/action-marketing elle-même (voir ecritureMarketing).
// Montants en centimes entiers.

import type { Parametres } from "@kapital/content";
import { COMPTE_MARKETING } from "./marketing";
import {
  besoinMatiere,
  centimes,
  cumulVide,
  enregistrer,
  enregistrerVenteDirecte,
  enregistrerVenteRevendeur,
  ErreurCommande,
  ErreurFaconnier,
  fluxMarque,
  graine,
  idEntreprise,
  idFaconnier,
  idFournisseur,
  idMatiere,
  idProduit,
  livrer,
  piecesPermisesParLaMatiere,
  margeRevendeur,
  margeVenteDirecte,
  moisJeu,
  passerCommande,
  passerOrdreFaconnier,
  planComptableV1,
  prixHtDepuisTtc,
  simulerPas,
  type CoefficientsMarketing,
  type EcritureComptable,
  type Entreprise,
  type GrandLivre,
} from "@kapital/engine";
import type { LigneEcriture } from "../components/ui/calculs";
import { formaterEuros } from "./formatage";

export type Refus = { readonly ok: false; readonly message: string };

/** Lignes d'une écriture du moteur, au format du composant EcritureComptable. */
export function versLignes(e: EcritureComptable): LigneEcriture[] {
  return e.lignes.map((l) =>
    l.sens === "debit" ? { compte: l.compte, debit: l.montant } : { compte: l.compte, credit: l.montant },
  );
}

function derniere(gl: GrandLivre): EcritureComptable {
  const e = gl.ecritures[gl.ecritures.length - 1];
  if (!e) throw new Error("Aucune écriture passée.");
  return e;
}

function valeurParam(params: Parametres, cle: string): number {
  const p = params[cle];
  if (!p) throw new Error(`Paramètre manquant : ${cle}`);
  return p.valeur;
}

function entier(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

/**
 * Fait passer au moteur un pas « à vide » ne contenant qu'une livraison, et rend
 * les écritures qu'il passe : c'est exactement ce que le serveur enregistrera
 * quand la livraison arrivera (orchestrateur → simulerPas → avancerFlux).
 */
function ecrituresDuMoteurPourLivraison(
  params: Parametres,
  mois: number,
  livraison:
    | { type: "matiere"; matiere: string; quantite: number; prixUnitaire: number }
    | {
        type: "faconnier";
        produit: string;
        quantite: number;
        prixFaconParPiece: number;
        /** Matière prise dans le stock du joueur (null : le façonnier fournit tout). */
        matiere?: MatiereDuJoueur | null;
      },
): EcritureComptable[] {
  const matiere = livraison.type === "faconnier" ? (livraison.matiere ?? null) : null;
  const idMat = idMatiere("apercu_matiere");
  const bacASable: Entreprise = {
    id: idEntreprise("apercu"),
    nom: "Aperçu",
    gamme: "entree",
    etape: 0,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(0),
    stocksMatiere: matiere?.stock
      ? [{ matiere: idMat, quantite: matiere.stock.quantite, valeurTotale: centimes(matiere.stock.valeurTotale) }]
      : [],
    stocksFinis: [],
    salaries: [],
    atelier: null,
    marque: { notoriete: 0, desirabilite: 0 },
    prets: [],
    catalogue: [],
  };
  const m = moisJeu(mois);
  const r = simulerPas(
    bacASable,
    cumulVide(m, centimes(0)),
    {
      livraisonsMatiere:
        livraison.type === "matiere"
          ? [
              {
                id: "apercu",
                matiere: idMatiere(livraison.matiere),
                quantite: livraison.quantite,
                prixUnitaire: centimes(livraison.prixUnitaire),
                // Comme le serveur (stockageSupabase.chargerLivraisons) : fournisseurs à crédit.
                modePaiement: "credit",
              },
            ]
          : [],
      livraisonsFaconniers:
        livraison.type === "faconnier"
          ? [
              {
                id: "apercu",
                produit: idProduit(livraison.produit),
                quantite: livraison.quantite,
                prixFaconParPiece: centimes(livraison.prixFaconParPiece),
                // Matière du joueur : sortie du stock 31 au coût moyen, chute comprise (moteur/flux.ts).
                matiereDuJoueur: matiere
                  ? {
                      matiere: idMat,
                      consommationParPiece: matiere.consommationParPiece,
                      fournituresParPiece: centimes(matiere.fournituresParPiece),
                      tempsStandardMinutes: 0,
                    }
                  : null,
              },
            ]
          : [],
      depensesMarketing: [],
      creancesAEncaisser: [],
    },
    null,
    {
      mois: m,
      smicHoraireBrut: centimes(0),
      tauxEstrAnnuel: 0,
      prixElectriciteParKwh: centimes(0),
      coursCotonParKg: centimes(0),
      inflationMensuelle: 0,
    },
    params,
    graine(1),
    m,
    0,
  );
  return [...r.ecrituresDuPas];
}

/* ------------------------------------------------------------ Vente et prix */

export type ApercuVente = {
  readonly ok: true;
  readonly prixHt: number;
  readonly tva: number;
  readonly margeDirecte: number;
  /** Marge rapportée au prix HT, entre -∞ et 1. */
  readonly tauxMargeDirecte: number;
  readonly margeRevendeur: number;
  readonly tauxMargeRevendeur: number;
  /** Écriture d'une pièce vendue en direct, telle que le moteur la passe. */
  readonly ecritureDirecte: LigneEcriture[];
  /** Écriture d'une pièce vendue à un revendeur (payée plus tard : compte 411). */
  readonly ecritureRevendeur: LigneEcriture[];
};

export function apercuVente(e: {
  produit: string;
  prixTtc: number;
  prixGrosHt: number;
  coutRevient: number;
  params: Parametres;
  mois: number;
}): ApercuVente | Refus {
  if (!entier(e.prixTtc) || !entier(e.prixGrosHt)) {
    return { ok: false, message: "Les prix doivent être des montants positifs." };
  }
  if (!entier(e.coutRevient)) {
    return { ok: false, message: "Coût de revient inconnu : produis ou commande d'abord ce produit." };
  }
  const tauxTva = valeurParam(e.params, "tva_standard");
  const tauxRetour = valeurParam(e.params, "taux_retour_vente_en_ligne");
  const coutRetour = centimes(Math.round(valeurParam(e.params, "cout_traitement_retour")));
  const prixTtc = centimes(e.prixTtc);
  const cout = centimes(e.coutRevient);
  const prixHt = prixHtDepuisTtc(prixTtc, tauxTva);
  const md = margeVenteDirecte({
    prixTtcUnitaire: prixTtc,
    coutRevientUnitaire: cout,
    tauxTva,
    tauxRetour,
    coutTraitementRetourUnitaire: coutRetour,
  });
  const mr = margeRevendeur({ prixGrosHtUnitaire: centimes(e.prixGrosHt), coutRevientUnitaire: cout });
  const mois = moisJeu(e.mois);
  const directe = derniere(
    enregistrerVenteDirecte(planComptableV1(), {
      idEcriture: "apercu_directe",
      mois,
      produit: idProduit(e.produit),
      quantite: 1,
      prixTtcUnitaire: prixTtc,
      coutRevientUnitaire: cout,
      tauxTva,
    }),
  );
  const revendeur = derniere(
    enregistrerVenteRevendeur(planComptableV1(), {
      idEcriture: "apercu_revendeur",
      mois,
      produit: idProduit(e.produit),
      quantite: 1,
      prixGrosHtUnitaire: centimes(e.prixGrosHt),
      coutRevientUnitaire: cout,
    }),
  );
  return {
    ok: true,
    prixHt,
    tva: prixTtc - prixHt,
    margeDirecte: md,
    tauxMargeDirecte: prixHt > 0 ? md / prixHt : 0,
    margeRevendeur: mr,
    tauxMargeRevendeur: e.prixGrosHt > 0 ? mr / e.prixGrosHt : 0,
    ecritureDirecte: versLignes(directe),
    ecritureRevendeur: versLignes(revendeur),
  };
}

/* ------------------------------------------------------------------ Achats */

export type ApercuCommandeMatiere = {
  readonly ok: true;
  readonly total: number;
  readonly moisLivraison: number;
  readonly delaiMois: number;
  /** Écriture que le moteur passera à la livraison (rien n'est écrit à la commande). */
  readonly ecritureLivraison: LigneEcriture[];
};

export function apercuCommandeMatiere(e: {
  fournisseur: { id: string; nom: string; delaiMois: number; minimumCommande: number };
  matiere: string;
  prixUnitaire: number;
  quantite: number;
  moisCourant: number;
  params: Parametres;
}): ApercuCommandeMatiere | Refus {
  if (!Number.isFinite(e.quantite) || e.quantite <= 0) {
    return { ok: false, message: "Indique une quantité positive." };
  }
  if (e.quantite < e.fournisseur.minimumCommande) {
    return {
      ok: false,
      message: `${e.fournisseur.nom} n'accepte pas moins de ${e.fournisseur.minimumCommande} unités par commande.`,
    };
  }
  try {
    const commande = passerCommande({
      id: "apercu",
      entreprise: idEntreprise("apercu"),
      fournisseur: {
        id: idFournisseur(e.fournisseur.id),
        nom: e.fournisseur.nom,
        qualite: 0,
        delaiMois: e.fournisseur.delaiMois,
        fiabilite: 1,
        minimumCommande: e.fournisseur.minimumCommande,
        delaiPaiementMois: 0,
      },
      catalogue: {
        fournisseur: idFournisseur(e.fournisseur.id),
        lignes: [{ matiere: idMatiere(e.matiere), prix: centimes(e.prixUnitaire) }],
      },
      matiere: idMatiere(e.matiere),
      quantite: e.quantite,
      moisCommande: moisJeu(e.moisCourant),
    });
    // Contrôle croisé : la fonction de livraison du module achats et le pas du moteur
    // (ce que le serveur exécute) doivent donner le même montant.
    const total = derniere(livrer(planComptableV1(), commande).grandLivre).lignes[0]!.montant;
    const ecritures = ecrituresDuMoteurPourLivraison(e.params, commande.moisLivraisonPrevu, {
      type: "matiere",
      matiere: e.matiere,
      quantite: e.quantite,
      prixUnitaire: e.prixUnitaire,
    });
    const ecriture = ecritures[0];
    if (!ecriture) return { ok: false, message: "Le moteur n'a pas pu calculer la livraison." };
    return {
      ok: true,
      total,
      moisLivraison: commande.moisLivraisonPrevu,
      delaiMois: e.fournisseur.delaiMois,
      ecritureLivraison: versLignes(ecriture),
    };
  } catch (err) {
    if (err instanceof ErreurCommande) return { ok: false, message: "Commande impossible avec ces valeurs." };
    throw err;
  }
}

/* -------------------------------------------------------------- Production */

/** Nomenclature du produit et stock de sa matière chez le joueur. */
export type MatiereDuJoueur = {
  readonly consommationParPiece: number;
  readonly fournituresParPiece: number;
  readonly stock: { readonly quantite: number; readonly valeurTotale: number } | null;
};

export type ApercuFaconnier = {
  readonly ok: true;
  readonly prixParPiece: number;
  /** Coût complet d'une pièce livrée (débit 35 ÷ quantité), calculé par le moteur. */
  readonly coutParPiece: number;
  readonly total: number;
  readonly moisLivraison: number;
  readonly ecritureLivraison: LigneEcriture[];
  /** Marge par pièce vendue en direct au prix actuel (null si pas de prix). */
  readonly margeParPiece: number | null;
};

export function apercuFaconnier(e: {
  faconnier: { id: string; nom: string; pays: string; delaiMois: number; minimumCommande: number };
  produit: string;
  prixParPiece: number;
  quantite: number;
  moisCourant: number;
  prixVenteTtc: number | null;
  params: Parametres;
  /** Matière du joueur ; absente ou null pour le grossiste, qui fournit tout. */
  matiere?: MatiereDuJoueur | null;
}): ApercuFaconnier | Refus {
  if (e.matiere) {
    const tauxChute = valeurParam(e.params, "taux_chute_matiere_defaut");
    const fiche = {
      matiere: idMatiere("apercu_matiere"),
      consommationParPiece: e.matiere.consommationParPiece,
      fournituresParPiece: centimes(e.matiere.fournituresParPiece),
      tempsStandardMinutes: 0,
    };
    const besoin = besoinMatiere(e.quantite, fiche, tauxChute);
    if (!e.matiere.stock || e.matiere.stock.quantite < besoin) {
      return {
        ok: false,
        message: `Le façonnier travaille avec ta matière : il en faut ${besoin.toLocaleString("fr-FR")} unités (chutes comprises), tu en as ${(e.matiere.stock?.quantite ?? 0).toLocaleString("fr-FR")}. Commande-la d'abord (écran Achats).`,
      };
    }
  }
  if (!entier(e.quantite)) return { ok: false, message: "Indique un nombre entier de pièces." };
  if (e.quantite < e.faconnier.minimumCommande) {
    return {
      ok: false,
      message: `${e.faconnier.nom} ne travaille pas pour moins de ${e.faconnier.minimumCommande} pièces.`,
    };
  }
  try {
    const ordre = passerOrdreFaconnier({
      id: "apercu",
      entreprise: idEntreprise("apercu"),
      faconnier: {
        id: idFaconnier(e.faconnier.id),
        nom: e.faconnier.nom,
        pays: e.faconnier.pays,
        delaiMois: e.faconnier.delaiMois,
        fiabilite: 1,
        minimumCommande: e.faconnier.minimumCommande,
        delaiPaiementMois: 0,
        prix: [{ produit: idProduit(e.produit), prixParPiece: centimes(e.prixParPiece) }],
      },
      produit: idProduit(e.produit),
      quantite: e.quantite,
      moisCommande: moisJeu(e.moisCourant),
    });
    const ecriture = ecrituresDuMoteurPourLivraison(e.params, ordre.moisLivraisonPrevu, {
      type: "faconnier",
      produit: e.produit,
      quantite: e.quantite,
      prixFaconParPiece: ordre.prixFaconParPiece,
      matiere: e.matiere ?? null,
    })[0];
    if (!ecriture) return { ok: false, message: "Le moteur n'a pas pu calculer la livraison." };
    const debitStock = ecriture.lignes.filter((l) => l.compte === "35" && l.sens === "debit").reduce((x, l) => x + l.montant, 0);
    const coutParPiece = Math.round(debitStock / e.quantite);
    const margeParPiece =
      e.prixVenteTtc && e.prixVenteTtc > 0
        ? margeVenteDirecte({
            prixTtcUnitaire: centimes(e.prixVenteTtc),
            coutRevientUnitaire: centimes(coutParPiece),
            tauxTva: valeurParam(e.params, "tva_standard"),
            tauxRetour: valeurParam(e.params, "taux_retour_vente_en_ligne"),
            coutTraitementRetourUnitaire: centimes(Math.round(valeurParam(e.params, "cout_traitement_retour"))),
          })
        : null;
    return {
      ok: true,
      prixParPiece: ordre.prixFaconParPiece,
      coutParPiece,
      total: ordre.prixFaconParPiece * ordre.quantite,
      moisLivraison: ordre.moisLivraisonPrevu,
      ecritureLivraison: versLignes(ecriture),
      margeParPiece,
    };
  } catch (err) {
    if (err instanceof ErreurFaconnier) return { ok: false, message: "Commande impossible chez ce façonnier." };
    throw err;
  }
}

/* --------------------------------------------------------------- Publicité */

export type TypeActionMarketing = "publicite" | "image_marque" | "promotion" | "relations_presse";

export type ApercuMarketing = {
  readonly ok: true;
  readonly apres: { readonly notoriete: number; readonly desirabilite: number };
  readonly tresorerieApres: number;
  readonly ecriture: LigneEcriture[];
};

/**
 * Écriture que la route /api/actions/action-marketing passe au moment de l'action :
 * charge au compte de publicité (623, COMPTE_MARKETING, le même que la route) au débit, banque 512 au crédit. Elle est vérifiée par le moteur
 * (enregistrer refuse une écriture déséquilibrée ou un compte inconnu).
 */
export function ecritureMarketing(montant: number): LigneEcriture[] {
  const gl = enregistrer(planComptableV1(), {
    id: "apercu_marketing",
    mois: moisJeu(0),
    libelle: "Marketing",
    lignes: [
      { compte: COMPTE_MARKETING, sens: "debit", montant: centimes(montant) },
      { compte: "512", sens: "credit", montant: centimes(montant) },
    ],
  });
  return versLignes(derniere(gl));
}

export function apercuMarketing(e: {
  action: TypeActionMarketing;
  montant: number;
  tresorerie: number;
  marque: { notoriete: number; desirabilite: number };
  coefficients: CoefficientsMarketing;
}): ApercuMarketing | Refus {
  if (!entier(e.montant)) return { ok: false, message: "Indique un montant positif." };
  if (e.montant > e.tresorerie) {
    return {
      ok: false,
      message: `Trésorerie insuffisante : il te manque ${formaterEuros(e.montant - e.tresorerie)} €.`,
    };
  }
  // La route applique l'effet tout de suite, sans décroissance : durée 0.
  const apres = fluxMarque(e.marque, 0, [{ action: e.action, montant: centimes(e.montant) }], e.coefficients);
  return {
    ok: true,
    apres,
    tresorerieApres: e.tresorerie - e.montant,
    ecriture: ecritureMarketing(e.montant),
  };
}

/** Écart attendu sur chaque jauge pour les quatre actions, au budget donné (moteur : fluxMarque). */
export function effetsMarketing(e: {
  montant: number;
  marque: { notoriete: number; desirabilite: number };
  coefficients: CoefficientsMarketing;
}): Record<TypeActionMarketing, { notoriete: number; desirabilite: number }> {
  const types: TypeActionMarketing[] = ["publicite", "image_marque", "promotion", "relations_presse"];
  const sortie = {} as Record<TypeActionMarketing, { notoriete: number; desirabilite: number }>;
  for (const action of types) {
    if (!entier(e.montant)) {
      sortie[action] = { notoriete: 0, desirabilite: 0 };
      continue;
    }
    const apres = fluxMarque(e.marque, 0, [{ action, montant: centimes(e.montant) }], e.coefficients);
    sortie[action] = {
      notoriete: apres.notoriete - e.marque.notoriete,
      desirabilite: apres.desirabilite - e.marque.desirabilite,
    };
  }
  return sortie;
}

/* -------------------------------------------------------- Bornes de curseur */

/**
 * Bornes d'un curseur de quantité : du minimum imposé (au moins 1) au plus grand
 * plafond tiré des données (trésorerie / prix, stock de matière…), jamais sous le minimum.
 */
export function bornesQuantite(e: { minimum: number; plafonds: readonly number[] }): { min: number; max: number } {
  const min = Math.max(1, Math.floor(e.minimum));
  const valides = e.plafonds.filter((p) => Number.isFinite(p)).map((p) => Math.floor(p));
  return { min, max: Math.max(min, ...valides) };
}

/* ------------------------------------------------------------------ Délais */

/** « 2 mois de jeu (2 jours réels) », d'après le ratio des paramètres. */
export function texteDelai(mois: number, params: Parametres): string {
  const minutes = mois * valeurParam(params, "temps_minutes_reelles_par_mois_jeu");
  const heures = minutes / 60;
  const reel =
    heures >= 24
      ? `${(heures / 24).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} jour${heures / 24 >= 2 ? "s" : ""} réel${heures / 24 >= 2 ? "s" : ""}`
      : `${Math.round(heures)} h réelles`;
  return `${mois} mois de jeu (${reel})`;
}

/* ---------------------------------------------------------- Atelier propre */

export type ApercuAtelier = {
  readonly ok: true;
  /** Pièces que la matière du produit en stock permet de fabriquer (règle du moteur, chute comprise). */
  readonly piecesCouvertes: number;
  readonly valeurMatiere: number;
  readonly valeurFournitures: number;
  readonly ecritureFabrication: LigneEcriture[];
};

/**
 * Aperçu d'une fabrication en atelier, avec les fonctions du moteur (moteur/fabrication.ts) :
 * la matière du produit sort du stock au coût moyen (pièces × consommation × (1 + chute)),
 * les fournitures sont payées comptant. Débit 35, crédit 31 et 512, comme moteur/flux.ts.
 */
export function apercuAtelier(e: {
  quantite: number;
  /** Nomenclature du produit (null si le catalogue ne la donne pas). */
  fiche: { consommationParPiece: number; fournituresParPiece: number } | null;
  /** Stock de LA matière du produit, ou null. */
  stockMatiere: { quantite: number; valeurTotale: number } | null;
  tauxChute: number;
}): ApercuAtelier | Refus {
  if (!entier(e.quantite)) return { ok: false, message: "Indique un nombre entier de pièces." };
  if (!e.fiche) return { ok: false, message: "La fiche de fabrication de ce produit est introuvable." };
  const stock = e.stockMatiere;
  if (!stock || stock.quantite <= 0 || stock.valeurTotale <= 0) {
    return { ok: false, message: "Tu n'as pas la matière de ce produit en stock : commande-la d'abord (écran Achats)." };
  }
  const fiche = {
    matiere: idMatiere("apercu"),
    consommationParPiece: e.fiche.consommationParPiece,
    fournituresParPiece: centimes(e.fiche.fournituresParPiece),
    tempsStandardMinutes: 0,
  };
  const pieces = Math.min(e.quantite, piecesPermisesParLaMatiere(stock.quantite, fiche, e.tauxChute));
  if (pieces <= 0) return { ok: false, message: "Pas assez de matière pour fabriquer une seule pièce." };
  const valeurMatiere = Math.round((stock.valeurTotale / stock.quantite) * besoinMatiere(pieces, fiche, e.tauxChute));
  if (valeurMatiere <= 0) return { ok: false, message: "Pas assez de matière pour fabriquer." };
  const valeurFournitures = pieces * e.fiche.fournituresParPiece;
  const gl = enregistrer(planComptableV1(), {
    id: "apercu_atelier",
    mois: moisJeu(0),
    libelle: "Production atelier",
    lignes: [
      { compte: "35", sens: "debit", montant: centimes(valeurMatiere + valeurFournitures) },
      { compte: "31", sens: "credit", montant: centimes(valeurMatiere) },
      ...(valeurFournitures > 0 ? [{ compte: "512", sens: "credit" as const, montant: centimes(valeurFournitures) }] : []),
    ],
  });
  return { ok: true, piecesCouvertes: pieces, valeurMatiere, valeurFournitures, ecritureFabrication: versLignes(derniere(gl)) };
}
