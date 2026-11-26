// Mise en forme du grand livre pour le tableau de bord. Ce n'est pas un
// moteur : on additionne des écritures déjà passées par le serveur, comme le
// fait l'écran Finances. Montants en centimes.

import { compteParNumero, type TypeCompte } from "./comptes";

export type LigneGrandLivre = {
  readonly ecriture_id: string;
  readonly mois_jeu: number;
  readonly libelle: string;
  readonly compte: string;
  readonly sens: "debit" | "credit";
  readonly montant_centimes: number;
  readonly cree_le: string;
};

/** Type d'un compte : plan simplifié de l'interface, sinon sa classe du plan comptable. */
function typeCompte(numero: string): TypeCompte {
  const connu = compteParNumero(numero);
  if (connu) return connu.type;
  const classe = numero.charAt(0);
  if (classe === "6") return "charges";
  if (classe === "7") return "produits";
  if (classe === "1") return "passif";
  return "actif";
}

function soldes(lignes: readonly LigneGrandLivre[]): Map<string, number> {
  const s = new Map<string, number>();
  for (const l of lignes) {
    const t = typeCompte(l.compte);
    const naturelDebit = t === "actif" || t === "charges";
    const signe = (l.sens === "debit") === naturelDebit ? 1 : -1;
    s.set(l.compte, (s.get(l.compte) ?? 0) + signe * l.montant_centimes);
  }
  return s;
}

export type PosteBilan = { readonly libelle: string; readonly montant: number };

export type Bilan = {
  readonly actif: readonly PosteBilan[];
  readonly passif: readonly PosteBilan[];
  readonly resultat: number;
  readonly totalActif: number;
  readonly totalPassif: number;
  readonly equilibre: boolean;
};

const somme = (s: Map<string, number>, comptes: readonly string[]) =>
  comptes.reduce((t, c) => t + (s.get(c) ?? 0), 0);

/** Bilan en quelques grands postes, lisible par un débutant. */
export function bilanSimplifie(lignes: readonly LigneGrandLivre[]): Bilan {
  const s = soldes(lignes);
  const parType = (t: TypeCompte) =>
    [...s].filter(([c]) => typeCompte(c) === t).reduce((x, [, v]) => x + v, 0);

  const resultat = parType("produits") - parType("charges");
  const amortissements = [...s].filter(([c]) => c.startsWith("28")).reduce((x, [, v]) => x + v, 0);
  const immobilisations = [...s].filter(([c]) => c.startsWith("2") && !c.startsWith("27") && !c.startsWith("28")).reduce((x, [, v]) => x + v, 0);

  const actif: PosteBilan[] = [
    { libelle: "Immobilisations nettes", montant: immobilisations - amortissements },
    { libelle: "Dépôts de garantie", montant: [...s].filter(([c]) => c.startsWith("27")).reduce((x, [, v]) => x + v, 0) },
    { libelle: "Stocks", montant: [...s].filter(([c]) => c.startsWith("3")).reduce((x, [, v]) => x + v, 0) },
    { libelle: "Créances clients", montant: somme(s, ["411"]) },
    { libelle: "TVA à récupérer", montant: somme(s, ["44566"]) },
    { libelle: "Trésorerie", montant: somme(s, ["512"]) },
  ];
  const classes = new Set(["101", "164", "401", "44571", "44566", "411", "512"]);
  const autresActifs = [...s]
    .filter(([c]) => typeCompte(c) === "actif" && !classes.has(c) && !/^[23]/.test(c))
    .reduce((x, [, v]) => x + v, 0);
  if (autresActifs !== 0) actif.push({ libelle: "Autres créances", montant: autresActifs });

  const passif: PosteBilan[] = [
    { libelle: "Capital", montant: somme(s, ["101"]) },
    { libelle: "Résultat", montant: resultat },
    { libelle: "Emprunts", montant: [...s].filter(([c]) => c.startsWith("16")).reduce((x, [, v]) => x + v, 0) },
    { libelle: "Fournisseurs", montant: somme(s, ["401"]) },
  ];
  const autresDettes = [...s]
    .filter(([c]) => typeCompte(c) === "passif" && c !== "101" && c !== "401" && !c.startsWith("16") && !c.startsWith("28"))
    .reduce((x, [, v]) => x + v, 0);
  if (autresDettes !== 0) passif.push({ libelle: "Dettes sociales et fiscales", montant: autresDettes });

  const actifVisible = actif.filter((p) => p.montant !== 0);
  const passifVisible = passif.filter((p) => p.montant !== 0 || p.libelle === "Résultat");
  const totalActif = actifVisible.reduce((x, p) => x + p.montant, 0);
  const totalPassif = passifVisible.reduce((x, p) => x + p.montant, 0);
  return {
    actif: actifVisible,
    passif: passifVisible,
    resultat,
    totalActif,
    totalPassif,
    equilibre: totalActif === totalPassif,
  };
}

/** Chiffre d'affaires HT (compte 707) des `nombre` derniers mois jusqu'à `moisCourant`. */
export function caParMois(
  lignes: readonly LigneGrandLivre[],
  moisCourant: number,
  nombre: number,
): Array<{ mois: number; valeur: number }> {
  const debut = Math.max(0, moisCourant - nombre + 1);
  const r: Array<{ mois: number; valeur: number }> = [];
  for (let m = debut; m <= moisCourant; m++) r.push({ mois: m, valeur: 0 });
  for (const l of lignes) {
    if (l.compte !== "707") continue;
    const p = r.find((x) => x.mois === l.mois_jeu);
    if (p) p.valeur += l.sens === "credit" ? l.montant_centimes : -l.montant_centimes;
  }
  return r;
}

export type EcritureAffichee = {
  readonly id: string;
  readonly libelle: string;
  readonly cree_le: string;
  readonly lignes: Array<{ compte: string; debit?: number; credit?: number }>;
};

/** Les `nombre` dernières écritures, chacune avec ses lignes (débits d'abord). */
export function dernieresEcritures(lignes: readonly LigneGrandLivre[], nombre: number): EcritureAffichee[] {
  const parId = new Map<string, LigneGrandLivre[]>();
  for (const l of lignes) {
    const g = parId.get(l.ecriture_id);
    if (g) g.push(l);
    else parId.set(l.ecriture_id, [l]);
  }
  return [...parId.entries()]
    .map(([id, g]) => ({ id, g, date: g.reduce((d, l) => (l.cree_le > d ? l.cree_le : d), "") }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, nombre)
    .map(({ id, g, date }) => ({
      id,
      libelle: g[0]!.libelle,
      cree_le: date,
      lignes: [
        ...g.filter((l) => l.sens === "debit").map((l) => ({ compte: l.compte, debit: l.montant_centimes })),
        ...g.filter((l) => l.sens === "credit").map((l) => ({ compte: l.compte, credit: l.montant_centimes })),
      ],
    }));
}

export type Alerte = { readonly ton: "bon" | "alerte" | "critique"; readonly texte: string; readonly lien?: string };

function joursRestants(jours: number): string {
  if (!(jours > 0)) return "rupture";
  if (jours < 1) return "moins d'un jour";
  const n = Math.floor(jours);
  return `${n} jour${n > 1 ? "s" : ""}`;
}

/** Ce que le tableau de bord signale, du plus grave au moins grave. */
export function alertes(e: {
  tresorerie: number;
  caMois: number;
  stockPieces: number;
  moisDecouvert: number;
  aUnProduit: boolean;
  /** Produits en rupture ou sous le seuil « stock bas » (lib/stock.ts › produitsEnStockBas). */
  stocksBas?: ReadonlyArray<{ readonly nom: string; readonly jours: number }>;
}): Alerte[] {
  const r: Alerte[] = [];
  if (e.tresorerie < 0) {
    r.push({
      ton: "critique",
      texte:
        e.moisDecouvert > 0
          ? `Compte à découvert depuis ${e.moisDecouvert} mois : trouve de la trésorerie (prêt, ventes) avant qu'il ne soit trop tard.`
          : "Compte à découvert : trouve de la trésorerie (prêt, ventes).",
      lien: "/banque",
    });
  }
  if (!e.aUnProduit) {
    r.push({ ton: "alerte", texte: "Aucun produit à ton catalogue : ajoute-en un pour commencer à vendre.", lien: "/produits" });
    return r;
  }
  if (e.stockPieces === 0) r.push({ ton: "alerte", texte: "Plus de stock à vendre : commande une production.", lien: "/atelier" });
  else if (e.stocksBas && e.stocksBas.length > 0) {
    const produits = e.stocksBas.map((p) => `${p.nom} (${joursRestants(p.jours)})`).join(", ");
    r.push({ ton: "alerte", texte: `Stock bas : ${produits}. Réapprovisionne avant la rupture.`, lien: "/stock" });
  }
  if (e.caMois <= 0) r.push({ ton: "alerte", texte: "Pas encore de vente ce mois-ci.", lien: "/produits" });
  if (r.length === 0) r.push({ ton: "bon", texte: "Rien à signaler : trésorerie positive, stock et ventes en cours." });
  return r;
}

/** Solde du compte 512 (banque) à la fin de chacun des `nombre` derniers mois. */
export function tresorerieFinDeMois(lignes: readonly LigneGrandLivre[], moisCourant: number, nombre: number): number[] {
  const debut = Math.max(0, moisCourant - nombre + 1);
  const r: number[] = [];
  for (let m = debut; m <= moisCourant; m++) {
    r.push(
      lignes
        .filter((l) => l.compte === "512" && l.mois_jeu <= m)
        .reduce((s, l) => s + (l.sens === "debit" ? l.montant_centimes : -l.montant_centimes), 0),
    );
  }
  return r;
}
