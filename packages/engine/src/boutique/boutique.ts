import type { Parametres, TypeBatiment } from "@kapital/content";
import type { EcritureComptable } from "../comptabilite/types.js";
import {
  coefficientsSalairesDepuisParametres,
  coutEmployeur,
} from "../salaires/calculs.js";
import type {
  Entreprise,
  LigneStockFini,
  PointDeVente,
  ProduitEntreprise,
  Salarie,
} from "../types/entreprise.js";
import { centimes, type Centimes, type IdProduit, type MoisJeu } from "../types/primitifs.js";
import { debutDuMoisMs, finDuMoisMs, moisDeLInstantMs } from "../moteur/temps.js";
import { prixHtDepuisTtc } from "../ventes/ventes.js";

// AE-10 : la boutique (point de vente). Fonctions pures : les montants de l'emplacement
// (loyer, charges, surface, passants, bonus) viennent du catalogue des bâtiments
// (catégorie boutique), les règles (travaux au m², durée des travaux, amortissement,
// dépôt, vendeur) des paramètres sourcés boutique_* et vendeur_*.
//
// Horloge réelle (lot T3, décision du 26 novembre 2026) : les travaux durent
// boutique_travaux_duree_heures heures réelles (24 h) ; la boutique ouvre à un instant précis,
// signature + durée des travaux, et non plus « le mois suivant ». Les instants sont en heure
// du jeu (millisecondes, voir moteur/temps.ts) ; le loyer et l'amortissement restent mensuels.
//
// Comptabilité (à valider par Mathieu) :
//   ouverture   275 / 512 (dépôt de garantie)  et  2135 / 512 (travaux d'agencement)
//   transfert   aucune écriture : le stock de la boutique reste au compte 35
//   vente       512 / 707 + 44571  et  7135 / 35 (coût de revient des pièces sorties)
//   clôture     613 / 512 (loyer), 614 / 512 (charges), 681 / 28135 (amortissement)

export class ErreurBoutique extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurBoutique";
  }
}

// ---------------------------------------------------------------------------
// Paramètres
// ---------------------------------------------------------------------------

export type ParametresBoutique = {
  readonly travauxCentimesParM2: number;
  /** Durée des travaux d'agencement, en heures réelles (boutique_travaux_duree_heures). */
  readonly dureeTravauxHeures: number;
  readonly amortissementAgencementMois: number;
  readonly depotMoisDeLoyer: number;
  readonly salaireVendeur: Centimes;
  readonly ventesMaxParVendeur: number;
};

function lire(params: Parametres, cle: string): number {
  const p = params[cle];
  if (!p || !Number.isFinite(p.valeur)) throw new ErreurBoutique(`Paramètre manquant : ${cle}`);
  return p.valeur;
}

function entierPositifOuNul(params: Parametres, cle: string): number {
  const v = lire(params, cle);
  if (!Number.isInteger(v) || v < 0) throw new ErreurBoutique(`${cle} doit être un entier >= 0, reçu ${v}.`);
  return v;
}

function positifOuNul(params: Parametres, cle: string): number {
  const v = lire(params, cle);
  if (v < 0) throw new ErreurBoutique(`${cle} doit être >= 0, reçu ${v}.`);
  return v;
}

const MS_PAR_HEURE = 3_600_000;

/** Durée des travaux en millisecondes (entier). */
export function dureeTravauxMs(p: ParametresBoutique): number {
  return Math.round(p.dureeTravauxHeures * MS_PAR_HEURE);
}

export function parametresBoutiqueDepuis(params: Parametres): ParametresBoutique {
  const amort = entierPositifOuNul(params, "boutique_amortissement_agencement_mois");
  if (amort === 0) throw new ErreurBoutique("boutique_amortissement_agencement_mois doit être > 0.");
  return {
    travauxCentimesParM2: entierPositifOuNul(params, "boutique_travaux_amenagement_centimes_par_m2"),
    dureeTravauxHeures: positifOuNul(params, "boutique_travaux_duree_heures"),
    amortissementAgencementMois: amort,
    depotMoisDeLoyer: lire(params, "boutique_depot_garantie_mois_de_loyer"),
    salaireVendeur: centimes(entierPositifOuNul(params, "vendeur_salaire_brut_mensuel_centimes")),
    ventesMaxParVendeur: entierPositifOuNul(params, "vendeur_ventes_max_pieces_par_mois"),
  };
}

// ---------------------------------------------------------------------------
// Emplacements du catalogue
// ---------------------------------------------------------------------------

export type EmplacementBoutique = TypeBatiment & {
  readonly effet: { type: "point_de_vente"; passants_par_jour: number; bonus_desirabilite_points_par_mois: number };
};

export function estEmplacementBoutique(b: TypeBatiment): b is EmplacementBoutique {
  return b.categorie === "boutique" && b.effet.type === "point_de_vente";
}

/**
 * Passants moyens des boutiques du catalogue (référence de la demande : une boutique
 * « moyenne » vend autant que la vente en ligne, voir marche/ventesMois). Arrondi à l'unité.
 */
export function passantsReferenceBoutiques(catalogue: readonly TypeBatiment[]): number {
  const boutiques = catalogue.filter(estEmplacementBoutique);
  if (boutiques.length === 0) throw new ErreurBoutique("Aucune boutique au catalogue des bâtiments.");
  const total = boutiques.reduce((s, b) => s + b.effet.passants_par_jour, 0);
  return Math.round(total / boutiques.length);
}

/** Facteur de demande de l'emplacement : passants / passants de référence (1 = boutique moyenne). */
export function facteurEmplacement(pdv: PointDeVente): number {
  if (!(pdv.passantsReference > 0)) return 0;
  return pdv.passantsParJour / pdv.passantsReference;
}

// ---------------------------------------------------------------------------
// Ouverture
// ---------------------------------------------------------------------------

export type ApercuOuvertureBoutique = {
  readonly batimentId: string;
  readonly nom: string;
  readonly surfaceM2: number;
  readonly loyerMensuel: Centimes;
  readonly chargesMensuelles: Centimes;
  readonly depotGarantie: Centimes;
  readonly travaux: Centimes;
  /** Dépôt + travaux : ce qui sort de la banque à la signature. */
  readonly totalALaSignature: Centimes;
  readonly moisSignature: MoisJeu;
  /** Instant d'ouverture (heure du jeu, ms) : signature + durée des travaux. */
  readonly ouvertureMs: number;
  /** Mois de jeu qui contient l'instant d'ouverture (l'amortissement commence ce mois-là). */
  readonly moisOuverture: MoisJeu;
  readonly dureeTravauxHeures: number;
  readonly amortissementMensuel: Centimes;
  /** Coût employeur d'un vendeur payé au salaire du paramètre. */
  readonly coutEmployeurVendeur: Centimes;
  /** Un mois d'exploitation avec un vendeur : loyer + charges + vendeur + amortissement. */
  readonly chargesFixesMensuellesAvecUnVendeur: Centimes;
  readonly passantsParJour: number;
  readonly bonusDesirabiliteParMois: number;
  readonly etapeRequise: number;
  readonly tresorerieSuffisante: boolean;
  /** Ce qui manque en banque pour signer (0 si la trésorerie suffit). */
  readonly manque: Centimes;
};

export function depotGarantieBoutique(loyerMensuel: Centimes, p: ParametresBoutique): Centimes {
  return centimes(Math.round(loyerMensuel * p.depotMoisDeLoyer));
}

export function travauxAgencement(surfaceM2: number, p: ParametresBoutique): Centimes {
  return centimes(Math.round(surfaceM2 * p.travauxCentimesParM2));
}

/** Amortissement linéaire d'un mois, arrondi au centime. */
export function amortissementMensuelAgencement(valeurBrute: Centimes, dureeMois: number): Centimes {
  if (!(dureeMois > 0)) return centimes(0);
  return centimes(Math.round(valeurBrute / dureeMois));
}

function coutEmployeurVendeur(params: Parametres, salaireBrut: Centimes): Centimes {
  const c = coefficientsSalairesDepuisParametres(params);
  return coutEmployeur({
    salaireBrutMensuel: salaireBrut,
    smicMensuelBrut: c.smicMensuelBrut,
    tauxCotisationsSmic: c.tauxCotisationsSmic,
    tauxCotisationsPleines: c.tauxCotisationsPleines,
    seuilCotisationsPleinesEnSmic: c.seuilCotisationsPleinesEnSmic,
  });
}

/**
 * Instant et mois d'ouverture d'une boutique signée au mois `mois`, à l'instant `instantMs`
 * (heure du jeu ; par défaut le début du mois de signature). Le mois d'ouverture n'est jamais
 * avant le mois de signature (contrainte de points_de_vente).
 */
export function ouvertureBoutique(
  mois: MoisJeu,
  instantMs: number | undefined,
  p: ParametresBoutique,
): { readonly ouvertureMs: number; readonly moisOuverture: MoisJeu } {
  const signature = instantMs ?? debutDuMoisMs(mois);
  if (!Number.isFinite(signature)) throw new ErreurBoutique(`Instant de signature invalide : ${signature}.`);
  const ouvertureMs = signature + dureeTravauxMs(p);
  return { ouvertureMs, moisOuverture: Math.max(mois, moisDeLInstantMs(ouvertureMs)) as MoisJeu };
}

/** Tout ce que coûte l'ouverture d'un emplacement, sans rien écrire (aperçu de l'écran Magasin). */
export function apercuOuvertureBoutique(args: {
  readonly batiment: TypeBatiment;
  readonly params: Parametres;
  /** Mois de la signature. */
  readonly mois: MoisJeu;
  /** Instant de la signature (heure du jeu, ms) ; par défaut le début du mois de signature. */
  readonly instantMs?: number;
  readonly tresorerie: Centimes;
}): ApercuOuvertureBoutique {
  const b = args.batiment;
  if (!estEmplacementBoutique(b)) throw new ErreurBoutique(`${b.id} n'est pas une boutique.`);
  const p = parametresBoutiqueDepuis(args.params);
  const loyer = centimes(b.loyer_mensuel_centimes);
  const charges = centimes(b.charges_mensuelles_centimes);
  const depot = depotGarantieBoutique(loyer, p);
  const travaux = travauxAgencement(b.surface_m2, p);
  const total = centimes(depot + travaux);
  const amort = amortissementMensuelAgencement(travaux, p.amortissementAgencementMois);
  const vendeur = coutEmployeurVendeur(args.params, p.salaireVendeur);
  const ouverture = ouvertureBoutique(args.mois, args.instantMs, p);
  return {
    batimentId: b.id,
    nom: b.nom,
    surfaceM2: b.surface_m2,
    loyerMensuel: loyer,
    chargesMensuelles: charges,
    depotGarantie: depot,
    travaux,
    totalALaSignature: total,
    moisSignature: args.mois,
    ouvertureMs: ouverture.ouvertureMs,
    moisOuverture: ouverture.moisOuverture,
    dureeTravauxHeures: p.dureeTravauxHeures,
    amortissementMensuel: amort,
    coutEmployeurVendeur: vendeur,
    chargesFixesMensuellesAvecUnVendeur: centimes(loyer + charges + vendeur + amort),
    passantsParJour: b.effet.passants_par_jour,
    bonusDesirabiliteParMois: b.effet.bonus_desirabilite_points_par_mois,
    etapeRequise: b.etape_debloquee,
    tresorerieSuffisante: args.tresorerie >= total,
    manque: centimes(Math.max(0, total - args.tresorerie)),
  };
}

/** Le point de vente tel que l'enregistre la fonction SQL ouvrir_boutique. */
export function nouveauPointDeVente(args: {
  readonly id: string;
  readonly batiment: TypeBatiment;
  /** Mois de la signature. */
  readonly mois: MoisJeu;
  /** Instant de la signature (heure du jeu, ms) ; par défaut le début du mois de signature. */
  readonly instantMs?: number;
  readonly params: Parametres;
  readonly passantsReference: number;
}): PointDeVente {
  const b = args.batiment;
  if (!estEmplacementBoutique(b)) throw new ErreurBoutique(`${b.id} n'est pas une boutique.`);
  const p = parametresBoutiqueDepuis(args.params);
  const loyer = centimes(b.loyer_mensuel_centimes);
  const ouverture = ouvertureBoutique(args.mois, args.instantMs, p);
  return {
    id: args.id,
    batimentId: b.id,
    surfaceM2: b.surface_m2,
    loyerMensuel: loyer,
    chargesMensuelles: centimes(b.charges_mensuelles_centimes),
    depotGarantie: depotGarantieBoutique(loyer, p),
    moisSignature: args.mois,
    moisOuverture: ouverture.moisOuverture,
    ouvertureMs: ouverture.ouvertureMs,
    agencement: {
      valeurBrute: travauxAgencement(b.surface_m2, p),
      amortissementsCumules: centimes(0),
      dureeAmortissementMois: p.amortissementAgencementMois,
    },
    passantsParJour: b.effet.passants_par_jour,
    passantsReference: args.passantsReference,
    bonusDesirabiliteParMois: b.effet.bonus_desirabilite_points_par_mois,
    stock: [],
  };
}

/** Identifiants des écritures d'ouverture : les mêmes que la fonction SQL ouvrir_boutique. */
export const PREFIXE_DEPOT_BOUTIQUE = "boutique_depot_";
export const PREFIXE_TRAVAUX_BOUTIQUE = "boutique_travaux_";
export const PREFIXE_AMORTISSEMENT_AGENCEMENT = "boutique_amort_";

/** Signature : dépôt (275 / 512) puis travaux d'agencement (2135 / 512). Un montant nul ne donne rien. */
export function ecrituresOuvertureBoutique(pdv: PointDeVente): EcritureComptable[] {
  const ecritures: EcritureComptable[] = [];
  if (pdv.depotGarantie > 0) {
    ecritures.push({
      id: `${PREFIXE_DEPOT_BOUTIQUE}${pdv.id}`,
      mois: pdv.moisSignature,
      libelle: "Dépôt de garantie versé (bail commercial de la boutique)",
      lignes: [
        { compte: "275", sens: "debit", montant: pdv.depotGarantie },
        { compte: "512", sens: "credit", montant: pdv.depotGarantie },
      ],
    });
  }
  if (pdv.agencement.valeurBrute > 0) {
    ecritures.push({
      id: `${PREFIXE_TRAVAUX_BOUTIQUE}${pdv.id}`,
      mois: pdv.moisSignature,
      libelle: "Travaux d'agencement de la boutique",
      lignes: [
        { compte: "2135", sens: "debit", montant: pdv.agencement.valeurBrute },
        { compte: "512", sens: "credit", montant: pdv.agencement.valeurBrute },
      ],
    });
  }
  return ecritures;
}

// ---------------------------------------------------------------------------
// État d'une boutique dans le temps
// ---------------------------------------------------------------------------

/**
 * Vrai si la boutique est ouverte. Avec un instant (heure du jeu, ms) et une boutique datée
 * (ouvertureMs), la comparaison se fait à l'instant près ; sinon au mois (boutiques
 * enregistrées avant la migration 0045, clôture du mois).
 */
export function boutiqueOuverte(pdv: PointDeVente, mois: MoisJeu, instantMs?: number): boolean {
  if (instantMs !== undefined && pdv.ouvertureMs !== undefined) return instantMs >= pdv.ouvertureMs;
  return mois >= pdv.moisOuverture;
}

export function boutiqueEnTravaux(pdv: PointDeVente, mois: MoisJeu, instantMs?: number): boolean {
  return mois >= pdv.moisSignature && !boutiqueOuverte(pdv, mois, instantMs);
}

export function pointsDeVenteOuverts(e: Entreprise, mois: MoisJeu, instantMs?: number): readonly PointDeVente[] {
  return (e.pointsDeVente ?? []).filter((p) => boutiqueOuverte(p, mois, instantMs));
}

/**
 * Premier pas du mois (sur `pasParMois`) où l'une des boutiques données est ouverte : 0 si
 * elle l'était dès le début du mois (ou si elle n'est pas datée). Sert à proratiser le plafond
 * des vendeurs le mois de l'ouverture : avant l'ouverture, ils ne vendent rien.
 */
export function premierPasOuvert(pointsDeVente: readonly PointDeVente[], mois: MoisJeu, pasParMois: number): number {
  const debut = debutDuMoisMs(mois);
  const duree = finDuMoisMs(mois) - debut;
  let premier = pasParMois;
  for (const p of pointsDeVente) {
    const ecoule = p.ouvertureMs === undefined ? 0 : p.ouvertureMs - debut;
    const pas = ecoule <= 0 ? 0 : Math.min(pasParMois, Math.floor((ecoule * pasParMois) / duree));
    premier = Math.min(premier, pas);
  }
  return premier;
}

export function vendeurs(salaries: readonly Salarie[]): readonly Salarie[] {
  return salaries.filter((s) => s.poste === "vendeur");
}

/**
 * Pièces que les vendeurs peuvent vendre sur un mois entier, toutes boutiques ouvertes
 * confondues : vendeurs × ventes max par vendeur. Sans boutique ouverte, 0.
 * (En V1, une seule boutique par société : tous les vendeurs y travaillent.)
 */
export function capaciteVendeursMois(
  e: Entreprise,
  mois: MoisJeu,
  p: ParametresBoutique,
  instantMs?: number,
): number {
  if (pointsDeVenteOuverts(e, mois, instantMs).length === 0) return 0;
  return vendeurs(e.salaries).length * p.ventesMaxParVendeur;
}

/** Prix TTC en boutique : le prix boutique s'il est fixé, sinon celui de la vente directe. */
export function prixBoutique(produit: ProduitEntreprise): Centimes {
  return produit.prix.boutique ?? produit.prix.vente_directe;
}

/** Pièces en stock dans toutes les boutiques, pour un produit. */
export function stockBoutiquePieces(e: Entreprise, produit: IdProduit): number {
  let n = 0;
  for (const pdv of e.pointsDeVente ?? []) {
    for (const s of pdv.stock) if (s.produit === produit) n += s.quantite;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Stock : transfert de l'atelier vers la boutique, sortie à la vente
// ---------------------------------------------------------------------------

/**
 * Valeur sortie d'un stock au coût moyen pondéré : valeur × quantité sortie / quantité,
 * arrondie au centime. Tout le stock sorti = toute sa valeur (pas de reste d'arrondi).
 * Même formule que la fonction SQL transferer_stock_boutique.
 */
export function valeurSortieCmp(ligne: LigneStockFini, quantite: number): Centimes {
  if (quantite >= ligne.quantite) return ligne.valeurTotale;
  return centimes(Math.round((ligne.valeurTotale * quantite) / ligne.quantite));
}

function retirer(stock: readonly LigneStockFini[], produit: IdProduit, quantite: number, valeur: Centimes): LigneStockFini[] {
  return stock.map((s) =>
    s.produit === produit
      ? { ...s, quantite: s.quantite - quantite, valeurTotale: centimes(s.valeurTotale - valeur) }
      : s,
  );
}

function ajouter(stock: readonly LigneStockFini[], produit: IdProduit, quantite: number, valeur: Centimes): LigneStockFini[] {
  if (!stock.some((s) => s.produit === produit)) return [...stock, { produit, quantite, valeurTotale: valeur }];
  return stock.map((s) =>
    s.produit === produit
      ? { ...s, quantite: s.quantite + quantite, valeurTotale: centimes(s.valeurTotale + valeur) }
      : s,
  );
}

export type ResultatTransfert =
  | { readonly ok: true; readonly entreprise: Entreprise; readonly valeur: Centimes }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * Transfert de pièces du stock de l'atelier vers le stock d'une boutique, au coût moyen.
 * Aucune écriture : les deux stocks sont au compte 35. Permis pendant les travaux
 * (on prépare l'ouverture).
 */
export function transfererStockVersBoutique(
  e: Entreprise,
  idPointDeVente: string,
  produit: IdProduit,
  quantite: number,
): ResultatTransfert {
  if (!Number.isInteger(quantite) || quantite <= 0) {
    return { ok: false, code: "quantite_invalide", message: "La quantité à transférer doit être un entier positif." };
  }
  const pdv = (e.pointsDeVente ?? []).find((p) => p.id === idPointDeVente);
  if (!pdv) return { ok: false, code: "boutique_introuvable", message: "Cette boutique n'existe pas." };
  const ligne = e.stocksFinis.find((s) => s.produit === produit);
  const dispo = ligne?.quantite ?? 0;
  if (!ligne || dispo < quantite) {
    return {
      ok: false,
      code: "stock_insuffisant",
      message: `Stock de l'atelier insuffisant : ${dispo} pièce${dispo > 1 ? "s" : ""} disponible${dispo > 1 ? "s" : ""}, ${quantite} demandée${quantite > 1 ? "s" : ""}.`,
    };
  }
  const valeur = valeurSortieCmp(ligne, quantite);
  return {
    ok: true,
    valeur,
    entreprise: {
      ...e,
      stocksFinis: retirer(e.stocksFinis, produit, quantite, valeur),
      pointsDeVente: (e.pointsDeVente ?? []).map((p) =>
        p.id === idPointDeVente ? { ...p, stock: ajouter(p.stock, produit, quantite, valeur) } : p,
      ),
    },
  };
}

/**
 * Sort `quantite` pièces des boutiques ouvertes (dans l'ordre), au coût moyen de chacune.
 * Rend la valeur sortie (le coût de revient des pièces vendues) et les points de vente à jour.
 */
export function sortirDesBoutiques(
  pointsDeVente: readonly PointDeVente[],
  ouverts: ReadonlySet<string>,
  produit: IdProduit,
  quantite: number,
): { readonly valeur: Centimes; readonly servi: number; readonly pointsDeVente: readonly PointDeVente[] } {
  let reste = quantite;
  let valeur = 0;
  const apres = pointsDeVente.map((pdv) => {
    if (reste <= 0 || !ouverts.has(pdv.id)) return pdv;
    const ligne = pdv.stock.find((s) => s.produit === produit);
    if (!ligne || ligne.quantite <= 0) return pdv;
    const q = Math.min(reste, ligne.quantite);
    const v = valeurSortieCmp(ligne, q);
    reste -= q;
    valeur += v;
    return { ...pdv, stock: retirer(pdv.stock, produit, q, v) };
  });
  return { valeur: centimes(valeur), servi: quantite - reste, pointsDeVente: apres };
}

// ---------------------------------------------------------------------------
// Vente en boutique : écriture comptable
// ---------------------------------------------------------------------------

export type EntreesEcritureVenteBoutique = {
  readonly idEcriture: string;
  readonly mois: MoisJeu;
  readonly produit: IdProduit;
  readonly quantite: number;
  readonly prixTtcUnitaire: Centimes;
  readonly tauxTva: number;
  /** Valeur exacte des pièces sorties du stock de la boutique (coût moyen). */
  readonly coutRevientTotal: Centimes;
};

/**
 * Vente au comptoir, payée tout de suite : 512 au débit (TTC), 707 (HT) et 44571 (TVA) au
 * crédit ; puis 7135 au débit et 35 au crédit pour le coût de revient des pièces sorties.
 * Pas de retour (le taux de retour est celui de la vente en ligne).
 */
export function ecritureVenteBoutique(e: EntreesEcritureVenteBoutique): EcritureComptable {
  if (!Number.isInteger(e.quantite) || e.quantite <= 0) {
    throw new ErreurBoutique("quantité doit être strictement positive");
  }
  const totalTtc = centimes(e.prixTtcUnitaire * e.quantite);
  const totalHt = centimes(prixHtDepuisTtc(e.prixTtcUnitaire, e.tauxTva) * e.quantite);
  const totalTva = centimes(totalTtc - totalHt);
  return {
    id: e.idEcriture,
    mois: e.mois,
    libelle: `Vente boutique ${e.quantite} ${e.produit}`,
    lignes: [
      { compte: "512", sens: "debit", montant: totalTtc },
      { compte: "707", sens: "credit", montant: totalHt },
      ...(totalTva > 0 ? [{ compte: "44571", sens: "credit" as const, montant: totalTva }] : []),
      ...(e.coutRevientTotal > 0
        ? [
            { compte: "7135", sens: "debit" as const, montant: e.coutRevientTotal },
            { compte: "35", sens: "credit" as const, montant: e.coutRevientTotal },
          ]
        : []),
    ],
  };
}

// ---------------------------------------------------------------------------
// Clôture du mois : loyer, charges, amortissement
// ---------------------------------------------------------------------------

/**
 * Fin de mois d'une boutique : loyer (613) et charges (614) dès le mois de signature (le bail
 * court pendant les travaux) ; amortissement des agencements (681 / 28135) à partir du mois
 * d'ouverture (mise en service), plafonné à ce qui reste à amortir.
 */
export function ecrituresClotureBoutique(
  pdv: PointDeVente,
  mois: MoisJeu,
): { readonly ecritures: EcritureComptable[]; readonly pointDeVente: PointDeVente } {
  const ecritures: EcritureComptable[] = [];
  if (mois < pdv.moisSignature) return { ecritures, pointDeVente: pdv };
  if (pdv.loyerMensuel > 0) {
    ecritures.push({
      id: `boutique_loyer_${mois}_${pdv.id}`,
      mois,
      libelle: "Loyer boutique",
      lignes: [
        { compte: "613", sens: "debit", montant: pdv.loyerMensuel },
        { compte: "512", sens: "credit", montant: pdv.loyerMensuel },
      ],
    });
  }
  if (pdv.chargesMensuelles > 0) {
    ecritures.push({
      id: `boutique_charges_${mois}_${pdv.id}`,
      mois,
      libelle: "Charges locatives boutique",
      lignes: [
        { compte: "614", sens: "debit", montant: pdv.chargesMensuelles },
        { compte: "512", sens: "credit", montant: pdv.chargesMensuelles },
      ],
    });
  }
  let apres = pdv;
  if (boutiqueOuverte(pdv, mois)) {
    const a = pdv.agencement;
    const restant = a.valeurBrute - a.amortissementsCumules;
    const montant = Math.min(restant, amortissementMensuelAgencement(a.valeurBrute, a.dureeAmortissementMois));
    if (montant > 0) {
      ecritures.push({
        id: `${PREFIXE_AMORTISSEMENT_AGENCEMENT}${mois}_${pdv.id}`,
        mois,
        libelle: "Amortissement des agencements de la boutique",
        lignes: [
          { compte: "681", sens: "debit", montant: centimes(montant) },
          { compte: "28135", sens: "credit", montant: centimes(montant) },
        ],
      });
      apres = { ...pdv, agencement: { ...a, amortissementsCumules: centimes(a.amortissementsCumules + montant) } };
    }
  }
  return { ecritures, pointDeVente: apres };
}

// ---------------------------------------------------------------------------
// Point mort de la boutique
// ---------------------------------------------------------------------------

export type PointMortBoutique = {
  readonly loyer: Centimes;
  readonly charges: Centimes;
  /** Coût employeur des vendeurs (salaire brut + cotisations patronales). */
  readonly vendeurs: Centimes;
  readonly nombreVendeurs: number;
  readonly amortissement: Centimes;
  readonly chargesFixes: Centimes;
  /** Marge par pièce vendue en boutique (prix HT − coût de revient) ; null si inconnue. */
  readonly margeParPiece: Centimes | null;
  /** Pièces à vendre par mois pour couvrir les charges fixes ; null si la marge n'est pas positive. */
  readonly piecesPointMort: number | null;
  /** Ce que les vendeurs peuvent vendre au plus par mois. */
  readonly capaciteVendeurs: number;
  /** Le point mort dépasse ce que les vendeurs peuvent vendre : la boutique perd de l'argent quoi qu'il arrive. */
  readonly horsDePortee: boolean;
};

/** Marge par pièce en boutique : prix HT − coût de revient (pas de retour en boutique). */
export function margeUnitaireBoutique(prixTtc: Centimes, coutRevient: Centimes, tauxTva: number): Centimes {
  return centimes(prixHtDepuisTtc(prixTtc, tauxTva) - coutRevient);
}

/**
 * Point mort = (loyer + charges + vendeurs + amortissement) ÷ marge par pièce, arrondi à la
 * pièce supérieure. Les vendeurs comptés sont ceux de l'entreprise (une boutique en V1).
 */
export function pointMortBoutique(args: {
  readonly pointDeVente: PointDeVente;
  readonly salaries: readonly Salarie[];
  readonly margeParPiece: Centimes | null;
  readonly params: Parametres;
}): PointMortBoutique {
  const p = parametresBoutiqueDepuis(args.params);
  const pdv = args.pointDeVente;
  const v = vendeurs(args.salaries);
  const coutVendeurs = v.reduce((s, x) => s + coutEmployeurVendeur(args.params, x.salaireBrutMensuel), 0);
  const a = pdv.agencement;
  const amort = Math.min(
    a.valeurBrute - a.amortissementsCumules,
    amortissementMensuelAgencement(a.valeurBrute, a.dureeAmortissementMois),
  );
  const fixes = pdv.loyerMensuel + pdv.chargesMensuelles + coutVendeurs + Math.max(0, amort);
  const marge = args.margeParPiece;
  const pieces = marge !== null && marge > 0 ? Math.ceil(fixes / marge) : null;
  const capacite = v.length * p.ventesMaxParVendeur;
  return {
    loyer: pdv.loyerMensuel,
    charges: pdv.chargesMensuelles,
    vendeurs: centimes(coutVendeurs),
    nombreVendeurs: v.length,
    amortissement: centimes(Math.max(0, amort)),
    chargesFixes: centimes(fixes),
    margeParPiece: marge,
    piecesPointMort: pieces,
    capaciteVendeurs: capacite,
    horsDePortee: pieces === null || pieces > capacite,
  };
}

/**
 * Marge moyenne par pièce des produits en stock dans la boutique (pondérée par les pièces),
 * au coût moyen du stock de la boutique. Sans stock : moyenne simple des produits du catalogue
 * dont le coût est connu par le stock de l'atelier. Null si aucun coût n'est connu.
 */
export function margeMoyenneBoutique(e: Entreprise, pdv: PointDeVente, tauxTva: number): Centimes | null {
  let marge = 0;
  let pieces = 0;
  for (const s of pdv.stock) {
    const produit = e.catalogue.find((c) => c.produit === s.produit);
    if (!produit || s.quantite <= 0) continue;
    const cout = s.valeurTotale / s.quantite;
    marge += (prixHtDepuisTtc(prixBoutique(produit), tauxTva) - cout) * s.quantite;
    pieces += s.quantite;
  }
  if (pieces === 0) {
    for (const s of e.stocksFinis) {
      const produit = e.catalogue.find((c) => c.produit === s.produit);
      if (!produit || s.quantite <= 0) continue;
      marge += prixHtDepuisTtc(prixBoutique(produit), tauxTva) - s.valeurTotale / s.quantite;
      pieces += 1;
    }
  }
  if (pieces === 0) return null;
  return centimes(Math.floor(marge / pieces));
}

/** Point mort d'une boutique de l'entreprise, à la marge moyenne de son stock. */
export function pointMortBoutiqueEntreprise(e: Entreprise, idPointDeVente: string, params: Parametres): PointMortBoutique {
  const pdv = (e.pointsDeVente ?? []).find((p) => p.id === idPointDeVente);
  if (!pdv) throw new ErreurBoutique(`Boutique introuvable : ${idPointDeVente}`);
  return pointMortBoutique({
    pointDeVente: pdv,
    salaries: e.salaries,
    margeParPiece: margeMoyenneBoutique(e, pdv, lire(params, "tva_standard")),
    params,
  });
}
