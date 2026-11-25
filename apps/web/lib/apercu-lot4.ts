// Aperçus des écrans Banque, Locaux et Salariés (design V2, lot 4).
// Aucun calcul métier ici : chaque chiffre et chaque écriture viennent des fonctions
// pures de @kapital/engine, celles que les routes serveur appellent elles aussi.
// Ce fichier ne fait que les assembler pour l'affichage. Montants en centimes.

import type { Parametres } from "@kapital/content";
import {
  acheterLocal,
  centimes,
  cotisationsPatronales,
  ecritureLicenciement,
  ecritureSignatureBail,
  ecrituresMensuellesBail,
  enregistrerDeblocagePret,
  enregistrerPaieMensuelle,
  evaluerDemandePret,
  genererEcheancier,
  idSalarie as versIdSalarie,
  moisJeu,
  nouveauBail,
  planComptableV1,
  tauxPret,
  type CoefficientsSalaires,
  type EcheancePret,
  type EcritureComptable as EcritureMoteur,
  type EvaluationDemandePret,
  type ObjetPret,
  type ReglesPret,
} from "@kapital/engine";
import type { LigneEcriture } from "../components/ui/calculs";

export type EcritureAffichee = {
  readonly libelle: string;
  readonly lignes: readonly LigneEcriture[];
};

/** Montant saisi en euros (virgule ou point, espaces permis) → centimes entiers > 0, ou null. */
export function lireEuros(saisie: string): number | null {
  const propre = saisie.replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(propre)) return null;
  const c = Math.round(Number(propre) * 100);
  return Number.isInteger(c) && c > 0 ? c : null;
}

/** Lignes du moteur (sens + montant) → lignes du composant EcritureComptable. */
export function lignesAffichees(e: EcritureMoteur): LigneEcriture[] {
  return e.lignes.map((l) =>
    l.sens === "debit" ? { compte: l.compte, debit: l.montant } : { compte: l.compte, credit: l.montant },
  );
}

function affichee(e: EcritureMoteur): EcritureAffichee {
  return { libelle: e.libelle, lignes: lignesAffichees(e) };
}

/** Trois premières échéances, un trou (null), puis la dernière. */
export function extraitEcheancier<T>(echeances: readonly T[]): Array<T | null> {
  if (echeances.length <= 4) return [...echeances];
  return [...echeances.slice(0, 3), null, echeances[echeances.length - 1]!];
}

/* ----------------------------------------------------------------- Prêt */

export type ApercuPret = {
  readonly evaluation: EvaluationDemandePret;
  readonly simulation: {
    readonly taux: number;
    readonly mensualite: number;
    readonly coutTotal: number;
    readonly echeancier: readonly EcheancePret[];
    readonly ecriture: EcritureAffichee;
    readonly tresorerieApres: number;
    readonly detteApres: number;
  } | null;
};

export function apercuPret(a: {
  situation: { tresorerie: number; detteEnCours: number };
  objet: ObjetPret;
  capital: number;
  dureeMois: number;
  estrAnnuel: number;
  mois: number;
  regles: ReglesPret;
}): ApercuPret {
  const situation = { tresorerie: centimes(a.situation.tresorerie), detteEnCours: centimes(a.situation.detteEnCours) };
  const evaluation = evaluerDemandePret(
    situation,
    { objet: a.objet, montant: centimes(Math.max(0, Math.round(a.capital))), dureeMois: a.dureeMois },
    a.regles,
  );
  const regle = a.regles.parObjet[a.objet];
  const simulable =
    Number.isInteger(a.capital) && a.capital > 0 &&
    Number.isInteger(a.dureeMois) && a.dureeMois >= regle.dureeMinMois && a.dureeMois <= regle.dureeMaxMois;
  if (!simulable) return { evaluation, simulation: null };

  const taux = tauxPret(a.objet, a.estrAnnuel, a.regles);
  const echeancier = genererEcheancier(centimes(a.capital), taux, a.dureeMois);
  const total = echeancier.reduce((s, e) => s + e.montant, 0);
  // Même écriture que la fonction SQL creer_pret : 512 au débit, 164 au crédit.
  const gl = enregistrerDeblocagePret(planComptableV1(), {
    idEcriture: "apercu_pret",
    mois: moisJeu(a.mois),
    capital: centimes(a.capital),
  });
  return {
    evaluation,
    simulation: {
      taux,
      mensualite: echeancier[0]!.montant,
      coutTotal: total - a.capital,
      echeancier,
      ecriture: affichee(gl.ecritures[gl.ecritures.length - 1]!),
      tresorerieApres: a.situation.tresorerie + a.capital,
      detteApres: a.situation.detteEnCours + a.capital,
    },
  };
}

/* ----------------------------------------------------------------- Bail */

export function apercuBail(a: {
  loyer: number;
  charges: number;
  mois: number;
  params: Parametres;
  tresorerie: number;
}): {
  depot: number;
  signature: EcritureAffichee;
  mensuelles: EcritureAffichee[];
  tresorerieApres: number;
  manque: number;
} {
  const mois = moisJeu(a.mois);
  const bail = nouveauBail({
    loyerMensuel: centimes(a.loyer),
    chargesMensuelles: centimes(a.charges),
    moisSignature: mois,
    params: a.params,
  });
  return {
    depot: bail.depotGarantie,
    signature: affichee(ecritureSignatureBail("apercu", mois, bail)),
    mensuelles: ecrituresMensuellesBail("apercu", mois, centimes(a.loyer), centimes(a.charges)).map(affichee),
    tresorerieApres: a.tresorerie - bail.depotGarantie,
    manque: Math.max(0, bail.depotGarantie - a.tresorerie),
  };
}

/* ---------------------------------------------------------------- Achat */

export type ApercuAchat =
  | {
      readonly ok: true;
      readonly apport: number;
      readonly montantPret: number;
      readonly tauxAnnuel: number;
      readonly mensualite: number;
      readonly coutCredit: number;
      readonly echeancier: readonly EcheancePret[];
      readonly ecritures: EcritureAffichee[];
      readonly tresorerieApres: number;
    }
  | { readonly ok: false; readonly message: string };

export function apercuAchat(a: {
  batiment: { id: string; surfaceM2: number; prixAchat: number; chargesMensuelles: number };
  apport: number;
  dureePretMois: number;
  estrAnnuel: number;
  tresorerie: number;
  detteEnCours: number;
  mois: number;
  params: Parametres;
}): ApercuAchat {
  if (!Number.isInteger(a.apport) || a.apport <= 0) {
    return { ok: false, message: "Indique un apport en euros, supérieur à zéro." };
  }
  const r = acheterLocal({
    idEntreprise: "apercu",
    mois: moisJeu(a.mois),
    batiment: {
      id: a.batiment.id,
      surfaceM2: a.batiment.surfaceM2,
      prixAchat: centimes(a.batiment.prixAchat),
      chargesMensuelles: centimes(a.batiment.chargesMensuelles),
    },
    apport: centimes(a.apport),
    dureePretMois: a.dureePretMois,
    tauxEstrAnnuel: a.estrAnnuel,
    tresorerie: centimes(a.tresorerie),
    detteEnCours: centimes(a.detteEnCours),
    aDejaUnLocal: false,
    params: a.params,
  });
  if (!r.ok) return { ok: false, message: r.message };
  const total = r.echeancier.reduce((s, e) => s + e.montant, 0);
  return {
    ok: true,
    apport: r.apport,
    montantPret: r.montantPret,
    tauxAnnuel: r.tauxAnnuel,
    mensualite: r.echeancier[0]?.montant ?? 0,
    coutCredit: total - r.montantPret,
    echeancier: r.echeancier,
    ecritures: r.ecritures.map(affichee),
    tresorerieApres: a.tresorerie - r.apport,
  };
}

/* ----------------------------------------------------- Embauche, départ */

export function apercuEmbauche(a: {
  salaireBrut: number;
  coefficients: CoefficientsSalaires;
  mois: number;
}): { cotisations: number; coutEmployeur: number; paie: EcritureAffichee } {
  const brut = centimes(a.salaireBrut);
  const cotisations = cotisationsPatronales({ ...a.coefficients, salaireBrutMensuel: brut });
  // Écriture que la clôture du mois (cloturerMois) passe pour chaque salarié.
  const gl = enregistrerPaieMensuelle(planComptableV1(), {
    idEcriture: "apercu_paie",
    mois: moisJeu(a.mois),
    salaireBrutMensuel: brut,
    cotisationsPatronales: cotisations,
  });
  return {
    cotisations,
    coutEmployeur: brut + cotisations,
    paie: affichee(gl.ecritures[gl.ecritures.length - 1]!),
  };
}

export function apercuLicenciement(a: { indemnite: number; mois: number; idSalarie: string }): EcritureAffichee | null {
  const e = ecritureLicenciement("apercu", moisJeu(a.mois), versIdSalarie(a.idSalarie), centimes(a.indemnite));
  return e ? affichee(e) : null;
}
