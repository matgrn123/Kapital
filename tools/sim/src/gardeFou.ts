import {
  enEquilibre,
  enregistrer,
  planComptableV1,
  resultat,
  soldeCompte,
  totalActif,
  totalPassif,
  type EcritureComptable,
  type Entreprise,
  type GrandLivre,
} from "@kapital/engine";

// 3D-9 : garde-fou monétaire. Après chaque clôture, aucune richesse n'apparaît sans
// contrepartie. Fonction pure, réutilisable par tout banc d'essai (24 mois, 36 mois…).
//
// Deux familles de contrôles :
//  1. le grand livre lui-même : chaque écriture équilibrée, bilan équilibré, chaque
//     mouvement de banque a une contrepartie, et la variation des capitaux propres
//     égale le résultat de la période plus les apports en capital ;
//  2. le lien entre l'état du moteur (l'Entreprise) et le grand livre : la trésorerie,
//     les stocks, les prêts et le dépôt de garantie que le moteur garde en mémoire
//     doivent être exactement les soldes des comptes. Un écart, c'est de l'argent (ou
//     un stock) que le moteur a fait apparaître ou disparaître sans écriture.

export type CodeAnomalie =
  | "ecriture_invalide"
  | "bilan_desequilibre"
  | "banque_sans_contrepartie"
  | "tresorerie_differente_de_la_banque"
  | "variation_tresorerie_sans_mouvement"
  | "capitaux_propres_sans_resultat"
  | "stock_matiere_sans_ecriture"
  | "stock_fini_sans_ecriture"
  | "pret_sans_ecriture"
  | "depot_garantie_sans_ecriture"
  | "stock_negatif";

export type Anomalie = {
  readonly code: CodeAnomalie;
  readonly message: string;
  /** Ce que le grand livre (ou la règle) attend, en centimes ou en unités. */
  readonly attendu?: number;
  /** Ce que l'on obtient. */
  readonly obtenu?: number;
};

export type EntreesGardeFou = {
  /** Toutes les écritures passées avant la période contrôlée (depuis la création). */
  readonly ecrituresAvant: readonly EcritureComptable[];
  /** Les écritures de la période (décisions du mois puis clôture). */
  readonly ecrituresPeriode: readonly EcritureComptable[];
  /** État du moteur au début de la période (null : la société n'existait pas encore). */
  readonly entrepriseAvant: Entreprise | null;
  /** État du moteur à la fin de la période. */
  readonly entrepriseApres: Entreprise;
};

/**
 * Rejoue des écritures dans un grand livre vierge (plan comptable V1). Lève une erreur si
 * une écriture est déséquilibrée, a une ligne à zéro ou un compte inconnu.
 */
export function grandLivreDepuis(ecritures: readonly EcritureComptable[]): GrandLivre {
  let gl = planComptableV1();
  for (const e of ecritures) gl = enregistrer(gl, e);
  return gl;
}

/** Capitaux propres : tout ce qui est à l'actif, moins ce qui est dû à des tiers. */
export function capitauxPropres(gl: GrandLivre): number {
  // Au passif, seul le capital (101) appartient aux associés ; le reste (dettes,
  // amortissements) vient en déduction de l'actif.
  return totalActif(gl) - (totalPassif(gl) - soldeCompte(gl, "101"));
}

function net512(ecritures: readonly EcritureComptable[]): number {
  let net = 0;
  for (const e of ecritures) {
    for (const l of e.lignes) if (l.compte === "512") net += l.sens === "debit" ? l.montant : -l.montant;
  }
  return net;
}

function somme(valeurs: readonly number[]): number {
  return valeurs.reduce((a, b) => a + b, 0);
}

/**
 * Contrôle une période (en pratique : un mois, de clôture à clôture). Rend la liste des
 * anomalies, vide quand tout est en ordre. Ne lève jamais d'erreur : une écriture
 * invalide devient une anomalie.
 */
export function verifierGardeFouMonetaire(e: EntreesGardeFou): readonly Anomalie[] {
  const anomalies: Anomalie[] = [];
  const ajouter = (a: Anomalie): void => {
    anomalies.push(a);
  };

  let glAvant: GrandLivre;
  let glApres: GrandLivre;
  try {
    glAvant = grandLivreDepuis(e.ecrituresAvant);
    glApres = grandLivreDepuis([...e.ecrituresAvant, ...e.ecrituresPeriode]);
  } catch (err) {
    ajouter({ code: "ecriture_invalide", message: (err as Error).message });
    return anomalies;
  }

  // 1. Grand livre
  if (!enEquilibre(glApres)) {
    ajouter({
      code: "bilan_desequilibre",
      message: "Actif ≠ passif + résultat après la clôture.",
      attendu: totalPassif(glApres) + resultat(glApres),
      obtenu: totalActif(glApres),
    });
  }

  for (const ec of e.ecrituresPeriode) {
    const touche512 = ec.lignes.some((l) => l.compte === "512");
    if (touche512 && ec.lignes.every((l) => l.compte === "512")) {
      ajouter({
        code: "banque_sans_contrepartie",
        message: `L'écriture « ${ec.id} » ne mouvemente que la banque : pas de contrepartie.`,
      });
    }
  }

  const apports = soldeCompte(glApres, "101") - soldeCompte(glAvant, "101");
  const resultatPeriode = resultat(glApres) - resultat(glAvant);
  const variationCp = capitauxPropres(glApres) - capitauxPropres(glAvant);
  if (variationCp !== resultatPeriode + apports) {
    ajouter({
      code: "capitaux_propres_sans_resultat",
      message: "La variation des capitaux propres n'est pas égale au résultat de la période plus les apports.",
      attendu: resultatPeriode + apports,
      obtenu: variationCp,
    });
  }

  // 2. État du moteur = soldes du grand livre
  const ent = e.entrepriseApres;
  const banque = soldeCompte(glApres, "512");
  if (ent.tresorerie !== banque) {
    ajouter({
      code: "tresorerie_differente_de_la_banque",
      message: "La trésorerie du moteur n'est pas le solde du compte 512.",
      attendu: banque,
      obtenu: ent.tresorerie,
    });
  }
  const tresorerieAvant = e.entrepriseAvant?.tresorerie ?? 0;
  const mouvements = net512(e.ecrituresPeriode);
  if (ent.tresorerie - tresorerieAvant !== mouvements) {
    ajouter({
      code: "variation_tresorerie_sans_mouvement",
      message: "La trésorerie a varié d'un montant différent des mouvements du compte 512 de la période.",
      attendu: mouvements,
      obtenu: ent.tresorerie - tresorerieAvant,
    });
  }

  const stockMatiere = somme(ent.stocksMatiere.map((s) => s.valeurTotale));
  if (stockMatiere !== soldeCompte(glApres, "31")) {
    ajouter({
      code: "stock_matiere_sans_ecriture",
      message: "La valeur du stock de matière du moteur n'est pas le solde du compte 31.",
      attendu: soldeCompte(glApres, "31"),
      obtenu: stockMatiere,
    });
  }
  const stockFini = somme(ent.stocksFinis.map((s) => s.valeurTotale));
  if (stockFini !== soldeCompte(glApres, "35")) {
    ajouter({
      code: "stock_fini_sans_ecriture",
      message: "La valeur du stock de produits finis du moteur n'est pas le solde du compte 35.",
      attendu: soldeCompte(glApres, "35"),
      obtenu: stockFini,
    });
  }
  for (const s of [...ent.stocksMatiere, ...ent.stocksFinis]) {
    if (s.quantite < 0 || s.valeurTotale < 0) {
      ajouter({
        code: "stock_negatif",
        message: `Stock négatif : ${"matiere" in s ? s.matiere : s.produit}.`,
        obtenu: s.quantite,
      });
    }
  }

  const prets = somme(ent.prets.map((p) => p.capitalRestant));
  if (prets !== soldeCompte(glApres, "164")) {
    ajouter({
      code: "pret_sans_ecriture",
      message: "Le capital restant dû des prêts n'est pas le solde du compte 164.",
      attendu: soldeCompte(glApres, "164"),
      obtenu: prets,
    });
  }

  const depot = ent.atelier?.bail?.depotGarantie ?? 0;
  if (depot !== soldeCompte(glApres, "275")) {
    ajouter({
      code: "depot_garantie_sans_ecriture",
      message: "Le dépôt de garantie du bail n'est pas le solde du compte 275.",
      attendu: soldeCompte(glApres, "275"),
      obtenu: depot,
    });
  }

  return anomalies;
}
