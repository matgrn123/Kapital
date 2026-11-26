import type { Parametres } from "@kapital/content";
import {
  resultat,
  soldeCompte,
  type GrandLivre,
} from "../comptabilite/index.js";
import type { CumulMois } from "../moteur/donneesMois.js";
import { genererEcheancier, type EcheancePret } from "../prets/calculs.js";
import {
  coefficientsSalairesDepuisParametres,
  coutEmployeur,
  type CoefficientsSalaires,
} from "../salaires/calculs.js";
import type { Canal, Entreprise, Pret } from "../types/entreprise.js";
import { centimes, type Centimes, type MoisJeu } from "../types/primitifs.js";
import { prixDuCanal } from "../marche/ventesMois.js";
import {
  margeRevendeur,
  margeVenteDirecte,
  prixHtDepuisTtc,
} from "../ventes/ventes.js";

// AE-3 : indicateurs de gestion. Tout est calculé à partir de l'état de
// l'entreprise et du grand livre ; rien n'est écrit, rien n'est inventé :
// les taux et les durées viennent des paramètres sourcés.

export class ErreurIndicateurs extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurIndicateurs";
  }
}

// ---------------------------------------------------------------------------
// Paramètres
// ---------------------------------------------------------------------------

export type ParametresIndicateurs = {
  readonly tauxTva: number;
  readonly tauxRetour: number;
  readonly coutTraitementRetour: Centimes;
  readonly horizonMois: number;
  readonly delaiEncaissementRevendeurMois: number;
  readonly salaires: CoefficientsSalaires;
};

function lire(params: Parametres, cle: string): number {
  const p = params[cle];
  if (!p) throw new ErreurIndicateurs(`Paramètre manquant : ${cle}.`);
  if (!Number.isFinite(p.valeur)) {
    throw new ErreurIndicateurs(`Paramètre ${cle} : valeur invalide (${p.valeur}).`);
  }
  return p.valeur;
}

function entierPositif(params: Parametres, cle: string): number {
  const v = lire(params, cle);
  if (!Number.isInteger(v) || v <= 0) {
    throw new ErreurIndicateurs(`${cle} doit être un entier positif, reçu ${v}.`);
  }
  return v;
}

export function parametresIndicateursDepuis(params: Parametres): ParametresIndicateurs {
  return {
    tauxTva: lire(params, "tva_standard"),
    tauxRetour: lire(params, "taux_retour_vente_en_ligne"),
    coutTraitementRetour: centimes(Math.round(lire(params, "cout_traitement_retour"))),
    horizonMois: entierPositif(params, "indicateurs_horizon_previsionnel_mois"),
    delaiEncaissementRevendeurMois: entierPositif(
      params,
      "indicateurs_delai_encaissement_revendeur_mois",
    ),
    salaires: coefficientsSalairesDepuisParametres(params),
  };
}

// ---------------------------------------------------------------------------
// Données de référence : coûts de revient et ventes d'un mois
// ---------------------------------------------------------------------------

/** Pièces par « produit|canal » sur un mois complet (même clé que CumulMois.serviParLigne). */
export type VentesMensuelles = Readonly<Record<string, number>>;

/** Coût de revient moyen d'une pièce en stock, par produit. Un produit sans stock n'a pas de coût connu. */
export function coutRevientDepuisStocks(e: Entreprise): Readonly<Record<string, Centimes>> {
  const couts: Record<string, Centimes> = {};
  for (const s of e.stocksFinis) {
    if (s.quantite > 0) couts[s.produit as string] = centimes(Math.round(s.valeurTotale / s.quantite));
  }
  // AE-10 : un produit présent seulement en boutique prend le coût moyen du stock de la boutique.
  for (const pdv of e.pointsDeVente ?? []) {
    for (const s of pdv.stock) {
      if (s.quantite > 0 && couts[s.produit as string] === undefined) {
        couts[s.produit as string] = centimes(Math.round(s.valeurTotale / s.quantite));
      }
    }
  }
  return couts;
}

/**
 * Ventes servies depuis le début du mois, ramenées à un mois complet.
 * `pasParMois` vient de la configuration du temps ; l'arrondi est à l'entier le plus proche.
 */
export function ventesMensuellesDepuisCumul(
  cumul: CumulMois | null,
  pasParMois: number,
): VentesMensuelles {
  if (cumul === null) return {};
  const pasVecus = cumul.pasTraites - cumul.pasDemarrage;
  if (pasVecus <= 0) return {};
  const r: Record<string, number> = {};
  for (const [cle, quantite] of Object.entries(cumul.serviParLigne)) {
    r[cle] = Math.round((quantite * pasParMois) / pasVecus);
  }
  return r;
}

function separerCle(cle: string): { produit: string; canal: Canal } | null {
  const i = cle.lastIndexOf("|");
  if (i < 0) return null;
  const canal = cle.slice(i + 1);
  if (canal !== "vente_directe" && canal !== "revendeur" && canal !== "boutique") return null;
  return { produit: cle.slice(0, i), canal };
}

// ---------------------------------------------------------------------------
// Marge par canal
// ---------------------------------------------------------------------------

export type MargeCanal = {
  readonly pieces: number;
  readonly chiffreAffairesHt: Centimes;
  readonly margeBrute: Centimes;
};

export type MargesParCanal = {
  readonly parCanal: Readonly<Record<Canal, MargeCanal>>;
  readonly total: MargeCanal;
  /** Produits vendus dont le coût de revient ou le prix est inconnu : exclus du calcul, jamais devinés. */
  readonly produitsIgnores: readonly string[];
};

/**
 * Marge brute par canal sur les ventes de référence. Même formules que le moteur :
 * vente directe = prix HT - coût de revient - perte moyenne sur retours ;
 * revendeur = prix de gros HT (le prix saisi) - coût de revient. Le compte 707 reste unique.
 */
export function margeParCanal(
  e: Entreprise,
  ventes: VentesMensuelles,
  couts: Readonly<Record<string, Centimes>>,
  p: ParametresIndicateurs,
): MargesParCanal {
  const cumul: Record<Canal, { pieces: number; ca: number; marge: number }> = {
    vente_directe: { pieces: 0, ca: 0, marge: 0 },
    revendeur: { pieces: 0, ca: 0, marge: 0 },
    boutique: { pieces: 0, ca: 0, marge: 0 },
  };
  const ignores = new Set<string>();

  for (const [cle, quantite] of Object.entries(ventes)) {
    const k = separerCle(cle);
    if (k === null || quantite <= 0) continue;
    const cout = couts[k.produit];
    const ligne = e.catalogue.find((c) => (c.produit as string) === k.produit);
    if (cout === undefined || ligne === undefined) {
      ignores.add(k.produit);
      continue;
    }
    // Le prix revendeur est saisi hors taxes ; la vente directe et la boutique, TTC.
    const prixHt =
      k.canal === "revendeur"
        ? prixDuCanal(ligne, k.canal)
        : prixHtDepuisTtc(prixDuCanal(ligne, k.canal), p.tauxTva);
    // Boutique (AE-10) : prix HT − coût de revient, sans retour (comme le revendeur, mais au prix boutique TTC).
    const margeUnitaire =
      k.canal === "vente_directe"
        ? margeVenteDirecte({
            prixTtcUnitaire: ligne.prix.vente_directe,
            coutRevientUnitaire: cout,
            tauxTva: p.tauxTva,
            tauxRetour: p.tauxRetour,
            coutTraitementRetourUnitaire: p.coutTraitementRetour,
          })
        : margeRevendeur({ prixGrosHtUnitaire: prixHt, coutRevientUnitaire: cout });
    const c = cumul[k.canal];
    c.pieces += quantite;
    c.ca += prixHt * quantite;
    c.marge += margeUnitaire * quantite;
  }

  const vers = (c: { pieces: number; ca: number; marge: number }): MargeCanal => ({
    pieces: c.pieces,
    chiffreAffairesHt: centimes(c.ca),
    margeBrute: centimes(c.marge),
  });
  const d = cumul.vente_directe;
  const r = cumul.revendeur;
  const b = cumul.boutique;
  return {
    parCanal: { vente_directe: vers(d), revendeur: vers(r), boutique: vers(b) },
    total: vers({
      pieces: d.pieces + r.pieces + b.pieces,
      ca: d.ca + r.ca + b.ca,
      marge: d.marge + r.marge + b.marge,
    }),
    produitsIgnores: [...ignores].sort(),
  };
}

// ---------------------------------------------------------------------------
// Prêts : échéance d'un mois donné (même règle que la clôture)
// ---------------------------------------------------------------------------

function echeanceDuMois(pret: Pret, mois: MoisJeu): EcheancePret | null {
  if (pret.capitalRestant <= 0) return null;
  const numero = mois - pret.moisDebut;
  if (numero < 1 || numero > pret.dureeTotaleMois) return null;
  return genererEcheancier(pret.capitalInitial, pret.tauxAnnuel, pret.dureeTotaleMois)[numero - 1] ?? null;
}

// ---------------------------------------------------------------------------
// Point mort
// ---------------------------------------------------------------------------

export type ChargesFixesMensuelles = {
  /** Salaires bruts et cotisations patronales. */
  readonly salaires: Centimes;
  /** Loyers des ateliers (3D-7 : tous les locaux), plus loyer et charges des boutiques (AE-10). */
  readonly loyer: Centimes;
  /** Intérêts de l'échéance du mois (le capital remboursé n'est pas une charge). */
  readonly interetsPrets: Centimes;
  readonly total: Centimes;
};

export type PointMort = {
  readonly chargesFixes: ChargesFixesMensuelles;
  /** Pièces à vendre par mois, au mix de ventes de référence ; null si la marge n'est pas positive. */
  readonly piecesPointMort: number | null;
  /** Chiffre d'affaires hors taxes mensuel correspondant ; null si la marge n'est pas positive. */
  readonly chiffreAffairesPointMortHt: Centimes | null;
};

export function chargesFixesMensuelles(
  e: Entreprise,
  mois: MoisJeu,
  p: ParametresIndicateurs,
): ChargesFixesMensuelles {
  let salaires = 0;
  for (const s of e.salaries) {
    salaires += coutEmployeur({
      salaireBrutMensuel: s.salaireBrutMensuel,
      smicMensuelBrut: p.salaires.smicMensuelBrut,
      tauxCotisationsSmic: p.salaires.tauxCotisationsSmic,
      tauxCotisationsPleines: p.salaires.tauxCotisationsPleines,
      seuilCotisationsPleinesEnSmic: p.salaires.seuilCotisationsPleinesEnSmic,
    });
  }
  // AE-10 : le loyer compte aussi le loyer et les charges des boutiques (payés dès la signature).
  // 3D-7 : loyers de tous les locaux de la société.
  let loyer: number = e.ateliers.reduce((s, a) => s + a.loyerMensuel, 0);
  for (const pdv of e.pointsDeVente ?? []) {
    if (mois >= pdv.moisSignature) loyer += pdv.loyerMensuel + pdv.chargesMensuelles;
  }
  let interets = 0;
  for (const pret of e.prets) interets += echeanceDuMois(pret, mois)?.interets ?? 0;
  return {
    salaires: centimes(salaires),
    loyer: centimes(loyer),
    interetsPrets: centimes(interets),
    total: centimes(salaires + loyer + interets),
  };
}

/**
 * Point mort = charges fixes / marge moyenne par pièce, au mix de ventes de référence.
 * Pièces : arrondi à l'entier supérieur. Chiffre d'affaires : arrondi au centime supérieur.
 */
export function pointMort(
  e: Entreprise,
  total: MargeCanal,
  mois: MoisJeu,
  p: ParametresIndicateurs,
): PointMort {
  const chargesFixes = chargesFixesMensuelles(e, mois, p);
  if (total.pieces <= 0 || total.margeBrute <= 0) {
    return { chargesFixes, piecesPointMort: null, chiffreAffairesPointMortHt: null };
  }
  return {
    chargesFixes,
    piecesPointMort: Math.ceil((chargesFixes.total * total.pieces) / total.margeBrute),
    chiffreAffairesPointMortHt: centimes(
      Math.ceil((chargesFixes.total * total.chiffreAffairesHt) / total.margeBrute),
    ),
  };
}

// ---------------------------------------------------------------------------
// Besoin en fonds de roulement
// ---------------------------------------------------------------------------

export type BesoinEnFondsDeRoulement = {
  /** Stocks de matières (31) et de produits finis (35). */
  readonly stocks: Centimes;
  /** Créances clients (411), surtout les revendeurs. */
  readonly creances: Centimes;
  /** Dettes fournisseurs (401). */
  readonly dettesFournisseurs: Centimes;
  /** stocks + créances - dettes : l'argent immobilisé dans le cycle d'exploitation. */
  readonly besoin: Centimes;
};

export function besoinEnFondsDeRoulement(gl: GrandLivre): BesoinEnFondsDeRoulement {
  const stocks = soldeCompte(gl, "31") + soldeCompte(gl, "35");
  const creances = soldeCompte(gl, "411");
  const dettes = soldeCompte(gl, "401");
  return {
    stocks: centimes(stocks),
    creances: centimes(creances),
    dettesFournisseurs: centimes(dettes),
    besoin: centimes(stocks + creances - dettes),
  };
}

// ---------------------------------------------------------------------------
// Endettement
// ---------------------------------------------------------------------------

export type Endettement = {
  /** Emprunts restant dus (164). */
  readonly dettesFinancieres: Centimes;
  /** Total des échéances du mois (capital + intérêts). */
  readonly mensualitesDuMois: Centimes;
  readonly interetsDuMois: Centimes;
  /** Capital social (101) + résultat cumulé. */
  readonly capitauxPropres: Centimes;
  /** Dettes financières / capitaux propres ; null si les capitaux propres ne sont pas positifs. */
  readonly ratioDettesCapitauxPropres: number | null;
};

export function endettement(
  gl: GrandLivre,
  e: Entreprise,
  mois: MoisJeu,
  _p: ParametresIndicateurs,
): Endettement {
  const dettes = soldeCompte(gl, "164");
  let mensualites = 0;
  let interets = 0;
  for (const pret of e.prets) {
    const ech = echeanceDuMois(pret, mois);
    if (ech) {
      mensualites += ech.montant;
      interets += ech.interets;
    }
  }
  const propres = soldeCompte(gl, "101") + resultat(gl);
  return {
    dettesFinancieres: centimes(dettes),
    mensualitesDuMois: centimes(mensualites),
    interetsDuMois: centimes(interets),
    capitauxPropres: centimes(propres),
    ratioDettesCapitauxPropres: propres > 0 ? dettes / propres : null,
  };
}

// ---------------------------------------------------------------------------
// Prévisionnel de trésorerie
// ---------------------------------------------------------------------------

export type MoisPrevisionnel = {
  readonly mois: number;
  readonly encaissementsDirects: Centimes;
  readonly encaissementsRevendeurs: Centimes;
  readonly salaires: Centimes;
  readonly loyer: Centimes;
  readonly echeancesPrets: Centimes;
  readonly dettesFournisseurs: Centimes;
  readonly fluxNet: Centimes;
  readonly tresorerieFin: Centimes;
};

export type PrevisionnelTresorerie = {
  readonly tresorerieDepart: Centimes;
  readonly mois: readonly MoisPrevisionnel[];
  /** Premier mois où la trésorerie prévue passe sous zéro, sinon null. */
  readonly premierMoisDecouvert: number | null;
};

/**
 * Trésorerie prévue sur l'horizon (3 mois), si les ventes restent au rythme de référence.
 * On ne compte que ce qui est connu ou en cours : encaissements des ventes au rythme de
 * référence (hors TVA), créances en cours, salaires, loyer, échéances de prêt et dettes
 * fournisseurs. Les achats futurs de matière et la TVA ne sont pas projetés.
 * Hypothèses simples : les créances en cours sont réparties à parts égales sur les mois du
 * délai d'encaissement ; les dettes fournisseurs sont payées le premier mois.
 * Le premier mois est le mois en cours, avec ses charges de fin de mois.
 */
export function previsionnelTresorerie(
  gl: GrandLivre,
  e: Entreprise,
  marges: MargesParCanal,
  moisCourant: MoisJeu,
  p: ParametresIndicateurs,
): PrevisionnelTresorerie {
  const depart = soldeCompte(gl, "512");
  const fixes = chargesFixesMensuelles(e, moisCourant, p);
  // Ventes en boutique (AE-10) : encaissées au comptoir, sans retour, avec la vente directe.
  const directMensuel =
    Math.round(marges.parCanal.vente_directe.chiffreAffairesHt * (1 - p.tauxRetour)) +
    marges.parCanal.boutique.chiffreAffairesHt;
  const revendeurMensuel = marges.parCanal.revendeur.chiffreAffairesHt;
  const creancesEnCours = soldeCompte(gl, "411");
  const dettes = soldeCompte(gl, "401");
  const delai = p.delaiEncaissementRevendeurMois;

  const mois: MoisPrevisionnel[] = [];
  let tresorerie: number = depart;
  let premierDecouvert: number | null = null;

  for (let j = 0; j < p.horizonMois; j++) {
    const m = moisCourant + j;
    // Créances en cours : parts égales sur les `delai` premiers mois (le reste sur le premier).
    let anciennes = 0;
    if (j < delai) {
      const part = Math.floor(creancesEnCours / delai);
      anciennes = j === 0 ? creancesEnCours - part * (delai - 1) : part;
    }
    const nouvelles = j >= delai ? revendeurMensuel : 0;
    const encRevendeurs = anciennes + nouvelles;

    let echeances = 0;
    for (const pret of e.prets) echeances += echeanceDuMois(pret, m as MoisJeu)?.montant ?? 0;
    const dettesPayees = j === 0 ? dettes : 0;

    const sorties = fixes.salaires + fixes.loyer + echeances + dettesPayees;
    const fluxNet = directMensuel + encRevendeurs - sorties;
    tresorerie += fluxNet;
    if (premierDecouvert === null && tresorerie < 0) premierDecouvert = m;
    mois.push({
      mois: m,
      encaissementsDirects: centimes(directMensuel),
      encaissementsRevendeurs: centimes(encRevendeurs),
      salaires: fixes.salaires,
      loyer: fixes.loyer,
      echeancesPrets: centimes(echeances),
      dettesFournisseurs: centimes(dettesPayees),
      fluxNet: centimes(fluxNet),
      tresorerieFin: centimes(tresorerie),
    });
  }
  return { tresorerieDepart: centimes(depart), mois, premierMoisDecouvert: premierDecouvert };
}

// ---------------------------------------------------------------------------
// Ensemble
// ---------------------------------------------------------------------------

export type EntreesIndicateurs = {
  readonly entreprise: Entreprise;
  readonly grandLivre: GrandLivre;
  readonly ventesMensuelles: VentesMensuelles;
  readonly moisCourant: MoisJeu;
  readonly params: Parametres;
};

export type Indicateurs = {
  readonly marges: MargesParCanal;
  readonly pointMort: PointMort;
  readonly besoinEnFondsDeRoulement: BesoinEnFondsDeRoulement;
  readonly previsionnel: PrevisionnelTresorerie;
  readonly endettement: Endettement;
};

export function calculerIndicateurs(i: EntreesIndicateurs): Indicateurs {
  const p = parametresIndicateursDepuis(i.params);
  const marges = margeParCanal(i.entreprise, i.ventesMensuelles, coutRevientDepuisStocks(i.entreprise), p);
  return {
    marges,
    pointMort: pointMort(i.entreprise, marges.total, i.moisCourant, p),
    besoinEnFondsDeRoulement: besoinEnFondsDeRoulement(i.grandLivre),
    previsionnel: previsionnelTresorerie(i.grandLivre, i.entreprise, marges, i.moisCourant, p),
    endettement: endettement(i.grandLivre, i.entreprise, i.moisCourant, p),
  };
}
