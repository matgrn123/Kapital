import { eurosTexte } from "../types/euros.js";
import type { Parametres } from "@kapital/content";
import type { EcritureComptable } from "../comptabilite/types.js";
import {
  capaciteEmprunt,
  evaluerDemandePret,
  reglesPretDepuis,
  tauxPret,
} from "../prets/capacite.js";
import { genererEcheancier, type EcheancePret } from "../prets/calculs.js";
import type { AchatLocal } from "../types/entreprise.js";
import { centimes, type Centimes, type MoisJeu } from "../types/primitifs.js";

// AE-6 : achat d'un local à crédit. Fonctions pures. Le prix et l'entretien viennent du
// catalogue des bâtiments ; l'apport minimal, la durée d'amortissement et la durée du prêt
// des paramètres sourcés (achat_*) ; le prêt suit les règles de l'objet « immobilier » (AE-4).

export class ErreurAchat extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurAchat";
  }
}

export type ParametresAchat = {
  /** Part minimale du prix payée comptant (ratio, 0,2 = 20 %). */
  readonly apportMinimalRatio: number;
  readonly dureeAmortissementMois: number;
  /** Durée du prêt immobilier proposée par défaut. */
  readonly dureePretMois: number;
};

function lire(params: Parametres, cle: string): number {
  const p = params[cle];
  if (!p) throw new ErreurAchat(`Paramètre manquant : ${cle}`);
  return p.valeur;
}

export function parametresAchatDepuis(params: Parametres): ParametresAchat {
  const apportMinimalRatio = lire(params, "achat_apport_minimal_ratio");
  if (!(apportMinimalRatio > 0 && apportMinimalRatio <= 1)) {
    throw new ErreurAchat(`achat_apport_minimal_ratio doit être dans ]0 ; 1], reçu ${apportMinimalRatio}.`);
  }
  const dureeAmortissementMois = lire(params, "achat_duree_amortissement_construction_mois");
  const dureePretMois = lire(params, "achat_duree_pret_immobilier_mois");
  for (const [cle, v] of [
    ["achat_duree_amortissement_construction_mois", dureeAmortissementMois],
    ["achat_duree_pret_immobilier_mois", dureePretMois],
  ] as const) {
    if (!Number.isInteger(v) || v <= 0) throw new ErreurAchat(`${cle} doit être un entier positif, reçu ${v}.`);
  }
  return { apportMinimalRatio, dureeAmortissementMois, dureePretMois };
}

export function apportMinimal(prix: Centimes, p: ParametresAchat): Centimes {
  return centimes(Math.round(prix * p.apportMinimalRatio));
}

export type BatimentAchetable = {
  readonly id: string;
  readonly surfaceM2: number;
  readonly prixAchat: Centimes;
  /** Charges d'entretien mensuelles du catalogue (compte 614). */
  readonly chargesMensuelles: Centimes;
};

export type DemandeAchat = {
  readonly idEntreprise: string;
  readonly mois: MoisJeu;
  readonly batiment: BatimentAchetable;
  /** Apport choisi ; absent = l'apport minimal. */
  readonly apport?: Centimes | undefined;
  /** Durée du prêt choisie ; absente = la durée par défaut des paramètres. */
  readonly dureePretMois?: number | undefined;
  /** €STR annuel du mois (le taux du prêt en ajoute la marge de l'immobilier). */
  readonly tauxEstrAnnuel: number;
  readonly tresorerie: Centimes;
  readonly detteEnCours: Centimes;
  /** Mois de découvert consécutifs (prime de risque du taux) ; absent = 0. */
  readonly moisDecouvertConsecutifs?: number | undefined;
  /** Une entreprise ne détient qu'un local à la fois (loué ou acheté). */
  readonly aDejaUnLocal: boolean;
  readonly params: Parametres;
};

export type CodeRefusAchat =
  | "local_deja_detenu"
  | "apport_insuffisant"
  | "tresorerie_insuffisante"
  | "montant_invalide"
  | "duree_hors_bornes"
  | "endettement_excessif"
  | "plafond_pret_depasse";

export type RefusAchat = {
  readonly ok: false;
  readonly code: CodeRefusAchat;
  readonly message: string;
  /** Ce qu'il manque, en centimes, quand le refus se chiffre. */
  readonly manque?: number;
};

export type AchatAccepte = {
  readonly ok: true;
  readonly achat: AchatLocal;
  readonly apport: Centimes;
  readonly montantPret: Centimes;
  readonly dureePretMois: number;
  readonly tauxAnnuel: number;
  readonly echeancier: readonly EcheancePret[];
  /** Plafond d'endettement à passer à la fonction SQL, qui le revérifie sous verrou. */
  readonly plafondEndettement: Centimes;
  /** Mise à disposition du prêt (512 / 164), puis achat (213 / 512). */
  readonly ecritures: readonly EcritureComptable[];
};

const euros = eurosTexte;

export function acheterLocal(d: DemandeAchat): AchatAccepte | RefusAchat {
  const pa = parametresAchatDepuis(d.params);
  const regles = reglesPretDepuis(d.params);
  const prix = d.batiment.prixAchat;

  if (d.aDejaUnLocal) {
    return { ok: false, code: "local_deja_detenu", message: "Vous détenez déjà un local : donnez congé avant d'en acheter un autre." };
  }

  const minimum = apportMinimal(prix, pa);
  const apport = d.apport ?? minimum;
  if (!Number.isInteger(apport) || apport <= 0 || apport > prix) {
    return { ok: false, code: "montant_invalide", message: `L'apport doit être un entier de centimes entre 1 et le prix du local (reçu ${apport}).` };
  }
  if (apport < minimum) {
    const manque = minimum - apport;
    return {
      ok: false,
      code: "apport_insuffisant",
      message: `L'apport minimal est de ${euros(minimum)} (${Math.round(pa.apportMinimalRatio * 100)} % de ${euros(prix)}) : votre apport de ${euros(apport)} est trop faible de ${euros(manque)}.`,
      manque,
    };
  }
  if (apport > d.tresorerie) {
    const manque = apport - d.tresorerie;
    return {
      ok: false,
      code: "tresorerie_insuffisante",
      message: `Trésorerie insuffisante pour l'apport de ${euros(apport)} : il manque ${euros(manque)}.`,
      manque,
    };
  }

  const montantPret = centimes(prix - apport);
  const dureePretMois = d.dureePretMois ?? pa.dureePretMois;
  // Un apport égal au prix ne demande aucun prêt : on saute l'évaluation du prêt.
  const situation = { tresorerie: d.tresorerie, detteEnCours: d.detteEnCours };
  if (montantPret > 0) {
    const eval_ = evaluerDemandePret(situation, { objet: "immobilier", montant: montantPret, dureeMois: dureePretMois }, regles);
    if (!eval_.ok) {
      return {
        ok: false,
        code: eval_.code,
        message: eval_.message,
        ...(eval_.depassement ? { manque: eval_.depassement.manque } : {}),
      };
    }
  }

  const tauxAnnuel = tauxPret("immobilier", d.tauxEstrAnnuel, regles, {
    tresorerie: d.tresorerie,
    detteApresPret: centimes(d.detteEnCours + montantPret),
    moisDecouvertConsecutifs: d.moisDecouvertConsecutifs ?? 0,
  });
  const echeancier = montantPret > 0 ? genererEcheancier(montantPret, tauxAnnuel, dureePretMois) : [];
  const ecritures: EcritureComptable[] = [];
  if (montantPret > 0) {
    ecritures.push({
      id: `pret_achat_${d.mois}_${d.idEntreprise}`,
      mois: d.mois,
      libelle: "Mise à disposition du prêt immobilier",
      lignes: [
        { compte: "512", sens: "debit", montant: montantPret },
        { compte: "164", sens: "credit", montant: montantPret },
      ],
    });
  }
  ecritures.push({
    id: `achat_local_${d.mois}_${d.idEntreprise}`,
    mois: d.mois,
    libelle: `Achat du local (${d.batiment.id})`,
    lignes: [
      { compte: "213", sens: "debit", montant: prix },
      { compte: "512", sens: "credit", montant: prix },
    ],
  });

  return {
    ok: true,
    achat: {
      prixAchat: prix,
      apport,
      chargesMensuelles: d.batiment.chargesMensuelles,
      moisAchat: d.mois,
      dureeAmortissementMois: pa.dureeAmortissementMois,
    },
    apport,
    montantPret,
    dureePretMois,
    tauxAnnuel,
    echeancier,
    plafondEndettement: capaciteEmprunt(situation, "immobilier", regles).plafondEndettement,
    ecritures,
  };
}

/**
 * Amortissement linéaire de la construction, de la clôture suivant l'achat jusqu'à la fin de la
 * durée. Le montant du mois est la différence des cumuls arrondis : la somme fait exactement le prix.
 */
export function ecritureAmortissementConstruction(
  idEntreprise: string,
  mois: MoisJeu,
  achat: AchatLocal,
): EcritureComptable | null {
  const numero = mois - achat.moisAchat;
  if (numero < 1 || numero > achat.dureeAmortissementMois) return null;
  const duree = achat.dureeAmortissementMois;
  const montant =
    Math.round((achat.prixAchat * numero) / duree) - Math.round((achat.prixAchat * (numero - 1)) / duree);
  if (montant <= 0) return null;
  return {
    id: `amort_construction_${mois}_${idEntreprise}`,
    mois,
    libelle: "Amortissement de la construction",
    lignes: [
      { compte: "681", sens: "debit", montant: centimes(montant) },
      { compte: "2813", sens: "credit", montant: centimes(montant) },
    ],
  };
}

/** Propriétaire : plus de loyer, mais les charges d'entretien du catalogue (614). */
export function ecritureEntretienLocal(
  idEntreprise: string,
  mois: MoisJeu,
  achat: AchatLocal,
): EcritureComptable | null {
  if (achat.chargesMensuelles <= 0) return null;
  return {
    id: `entretien_local_${mois}_${idEntreprise}`,
    mois,
    libelle: "Charges d'entretien du local",
    lignes: [
      { compte: "614", sens: "debit", montant: achat.chargesMensuelles },
      { compte: "512", sens: "credit", montant: achat.chargesMensuelles },
    ],
  };
}
