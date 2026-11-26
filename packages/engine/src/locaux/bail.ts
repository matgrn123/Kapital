import type { Parametres } from "@kapital/content";
import type { EcritureComptable } from "../comptabilite/types.js";
import type { Bail } from "../types/entreprise.js";
import { centimes, type Centimes, type MoisJeu } from "../types/primitifs.js";
import { suffixeLocal } from "./achat.js";
import { auProrata, moisEntier, type PartDuMois } from "../moteur/prorata.js";

// AE-5 : bail d'un local. Fonctions pures ; les montants du local (loyer, charges) viennent
// du catalogue des bâtiments, le dépôt et le préavis des paramètres sourcés (bail_*).

export class ErreurBail extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurBail";
  }
}

/** Préfixe de l'écriture de restitution : le serveur s'en sert pour libérer le local en base. */
export const PREFIXE_RESTITUTION_DEPOT = "bail_restitution_";

export type ParametresBail = {
  /** Dépôt de garantie, en mois de loyer. */
  readonly depotMoisDeLoyer: number;
  readonly preavisMois: number;
  readonly machinesALaSignature: number;
};

function lire(params: Parametres, cle: string): number {
  const p = params[cle];
  if (!p) throw new ErreurBail(`Paramètre manquant : ${cle}`);
  return p.valeur;
}

export function parametresBailDepuis(params: Parametres): ParametresBail {
  return {
    depotMoisDeLoyer: lire(params, "bail_depot_garantie_mois_de_loyer"),
    preavisMois: lire(params, "bail_preavis_mois"),
    machinesALaSignature: lire(params, "bail_machines_a_la_signature"),
  };
}

export function depotDeGarantie(loyerMensuel: Centimes, p: ParametresBail): Centimes {
  return centimes(Math.round(loyerMensuel * p.depotMoisDeLoyer));
}

export function nouveauBail(args: {
  readonly loyerMensuel: Centimes;
  readonly chargesMensuelles: Centimes;
  readonly moisSignature: MoisJeu;
  readonly params: Parametres;
}): Bail {
  return {
    depotGarantie: depotDeGarantie(args.loyerMensuel, parametresBailDepuis(args.params)),
    chargesMensuelles: args.chargesMensuelles,
    moisSignature: args.moisSignature,
    moisFin: null,
  };
}

/** Signature : le dépôt sort de la banque et devient une créance sur le bailleur (275). */
export function ecritureSignatureBail(
  idEntreprise: string,
  mois: MoisJeu,
  bail: Bail,
  /** 3D-7 : identifiant du local signé (absent = un seul local). */
  idLocal?: string,
): EcritureComptable {
  return {
    id: `bail_signature_${mois}_${idEntreprise}${suffixeLocal(idLocal)}`,
    mois,
    libelle: "Dépôt de garantie versé (signature du bail)",
    lignes: [
      { compte: "275", sens: "debit", montant: bail.depotGarantie },
      { compte: "512", sens: "credit", montant: bail.depotGarantie },
    ],
  };
}

/**
 * Loyer (613) puis charges (614), payés par la banque ; un montant nul ne donne pas d'écriture.
 * Lot T4 : `part` ramène le mois de la signature aux jours restants (moteur/prorata) ; absente,
 * le mois entier.
 */
export function ecrituresMensuellesBail(
  idEntreprise: string,
  mois: MoisJeu,
  loyerMensuel: Centimes,
  chargesMensuelles: Centimes,
  /** 3D-7 : identifiant du local, ajouté à l'identifiant des écritures (absent = un seul local). */
  idLocal?: string,
  part?: PartDuMois,
): EcritureComptable[] {
  const ecritures: EcritureComptable[] = [];
  const prorata = part !== undefined && !moisEntier(part);
  const loyer = part === undefined ? loyerMensuel : auProrata(loyerMensuel, part);
  const charges = part === undefined ? chargesMensuelles : auProrata(chargesMensuelles, part);
  const precision = prorata ? ` (${part.jours} jours sur ${part.joursDuMois})` : "";
  if (loyer > 0) {
    ecritures.push({
      id: `loyer_${mois}_${idEntreprise}${suffixeLocal(idLocal)}`,
      mois,
      libelle: `Loyer atelier${precision}`,
      lignes: [
        { compte: "613", sens: "debit", montant: loyer },
        { compte: "512", sens: "credit", montant: loyer },
      ],
    });
  }
  if (charges > 0) {
    ecritures.push({
      id: `charges_locatives_${mois}_${idEntreprise}${suffixeLocal(idLocal)}`,
      mois,
      libelle: `Charges locatives atelier${precision}`,
      lignes: [
        { compte: "614", sens: "debit", montant: charges },
        { compte: "512", sens: "credit", montant: charges },
      ],
    });
  }
  return ecritures;
}

/**
 * Le congé fixe le dernier mois du bail : mois du congé + préavis (bail_preavis_mois). Avec
 * un mois de préavis (horloge réelle, lot T3), un congé donné en novembre rend le local à la
 * fin de décembre : le loyer reste payé en fin de mois, jusqu'à ce dernier mois compris.
 */
export function donnerConge(bail: Bail, moisConge: MoisJeu, preavisMois: number): Bail {
  if (bail.moisFin !== null) {
    throw new ErreurBail(`Un congé est déjà donné : le bail prend fin au mois ${bail.moisFin}.`);
  }
  return { ...bail, moisFin: (moisConge + preavisMois) as MoisJeu };
}

export function bailTermineAu(bail: Bail, mois: MoisJeu): boolean {
  return bail.moisFin !== null && mois >= bail.moisFin;
}

/** Fin de bail : le dépôt revient en banque. Null s'il n'y a aucun dépôt. */
export function ecritureRestitutionDepot(
  idEntreprise: string,
  mois: MoisJeu,
  bail: Bail,
  /** 3D-7 : identifiant du local ; le serveur libère en base le local dont l'id termine l'écriture. */
  idLocal?: string,
): EcritureComptable | null {
  if (bail.depotGarantie <= 0) return null;
  return {
    id: `${PREFIXE_RESTITUTION_DEPOT}${mois}_${idEntreprise}${suffixeLocal(idLocal)}`,
    mois,
    libelle: "Restitution du dépôt de garantie (fin de bail)",
    lignes: [
      { compte: "512", sens: "debit", montant: bail.depotGarantie },
      { compte: "275", sens: "credit", montant: bail.depotGarantie },
    ],
  };
}
