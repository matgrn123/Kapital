import { describe, it, expect } from "vitest";
import {
  alertes,
  bilanSimplifie,
  caParMois,
  dernieresEcritures,
  premierMoisDuLivre,
  tresorerieFinDeMois,
  type LigneGrandLivre,
} from "./tableau";

let n = 0;
function l(
  ecriture: string,
  mois: number,
  compte: string,
  sens: "debit" | "credit",
  montant: number,
  libelle = "x",
): LigneGrandLivre {
  n += 1;
  return {
    ecriture_id: ecriture,
    mois_jeu: mois,
    libelle,
    compte,
    sens,
    montant_centimes: montant,
    cree_le: `2026-11-25T08:${String(n).padStart(2, "0")}:00Z`,
  };
}

// Un petit monde : apport, prêt, vente, achat à crédit d'un local amorti.
const GL: LigneGrandLivre[] = [
  l("apport", 0, "512", "debit", 20_000_00, "Apport de capital initial"),
  l("apport", 0, "101", "credit", 20_000_00, "Apport de capital initial"),
  l("pret", 1, "512", "debit", 10_000_00, "Prêt"),
  l("pret", 1, "164", "credit", 10_000_00, "Prêt"),
  l("vente", 2, "512", "debit", 1_200_00, "Vente directe"),
  l("vente", 2, "707", "credit", 1_000_00, "Vente directe"),
  l("vente", 2, "44571", "credit", 200_00, "Vente directe"),
  l("local", 2, "213", "debit", 5_000_00, "Achat du local"),
  l("local", 2, "512", "credit", 5_000_00, "Achat du local"),
  l("amort", 2, "681", "debit", 100_00, "Amortissement"),
  l("amort", 2, "2813", "credit", 100_00, "Amortissement"),
];

describe("bilanSimplifie", () => {
  const b = bilanSimplifie(GL);

  it("équilibre actif et passif, résultat compris", () => {
    expect(b.totalActif).toBe(b.totalPassif);
    expect(b.equilibre).toBe(true);
  });

  it("présente les immobilisations nettes de leur amortissement", () => {
    expect(b.actif.find((x) => x.libelle === "Immobilisations nettes")?.montant).toBe(4_900_00);
  });

  it("calcule le résultat (produits moins charges)", () => {
    // 1 000 € de ventes, 100 € d'amortissement (compte 681 hors plan simplifié : classé en charge par sa classe)
    expect(b.resultat).toBe(900_00);
  });

  it("donne la trésorerie et les emprunts", () => {
    expect(b.actif.find((x) => x.libelle === "Trésorerie")?.montant).toBe(26_200_00);
    expect(b.passif.find((x) => x.libelle === "Emprunts")?.montant).toBe(10_000_00);
  });

  it("n'affiche pas les postes à zéro", () => {
    expect(b.actif.some((x) => x.montant === 0)).toBe(false);
    expect(b.passif.some((x) => x.montant === 0 && x.libelle !== "Résultat")).toBe(false);
  });
});

describe("caParMois", () => {
  it("donne le chiffre d'affaires HT des derniers mois, mois sans vente compris", () => {
    const r = caParMois(GL, 3, 4);
    expect(r).toEqual([
      { mois: 0, valeur: 0 },
      { mois: 1, valeur: 0 },
      { mois: 2, valeur: 1_000_00 },
      { mois: 3, valeur: 0 },
    ]);
  });

  it("déduit les retours (débit du 707)", () => {
    const avecRetour = [...GL, l("retour", 3, "707", "debit", 300_00)];
    expect(caParMois(avecRetour, 3, 1)).toEqual([{ mois: 3, valeur: -300_00 }]);
  });

  it("ne remonte pas avant le mois 0", () => {
    expect(caParMois(GL, 1, 6).map((x) => x.mois)).toEqual([0, 1]);
  });

  it("ne montre pas les mois d'avant la création de la société", () => {
    // Société créée en novembre 2026 (24322) : ni juin ni octobre.
    expect(caParMois([], 24322, 6, 24322)).toEqual([{ mois: 24322, valeur: 0 }]);
    expect(caParMois([], 24323, 6, 24322).map((x) => x.mois)).toEqual([24322, 24323]);
    // Créée il y a plus de six mois : les six derniers mois.
    expect(caParMois([], 24330, 6, 24322).map((x) => x.mois)).toEqual([24325, 24326, 24327, 24328, 24329, 24330]);
  });

  it("garde au moins le mois en cours, même avec une date de création incohérente", () => {
    expect(caParMois([], 24322, 6, 24400)).toEqual([{ mois: 24322, valeur: 0 }]);
  });
});

describe("premierMoisDuLivre", () => {
  it("donne le mois de la première écriture (celle d'ouverture), ou null sans écriture", () => {
    expect(premierMoisDuLivre(GL)).toBe(0);
    expect(premierMoisDuLivre([l("x", 24323, "512", "debit", 1), l("y", 24322, "101", "credit", 1)])).toBe(24322);
    expect(premierMoisDuLivre([])).toBeNull();
  });
});

describe("dernieresEcritures", () => {
  it("regroupe les lignes par écriture, les plus récentes d'abord", () => {
    const r = dernieresEcritures(GL, 2);
    expect(r.map((e) => e.id)).toEqual(["amort", "local"]);
    expect(r[0]!.lignes).toEqual([
      { compte: "681", debit: 100_00 },
      { compte: "2813", credit: 100_00 },
    ]);
  });

  it("met les débits avant les crédits", () => {
    const vente = dernieresEcritures(GL, 10).find((e) => e.id === "vente")!;
    expect(vente.lignes.map((x) => x.compte)).toEqual(["512", "707", "44571"]);
  });
});

describe("alertes", () => {
  const base = { tresorerie: 5_000_00, caMois: 100_00, stockPieces: 10, moisDecouvert: 0, aUnProduit: true };

  it("signale un découvert en premier", () => {
    const r = alertes({ ...base, tresorerie: -10_00, moisDecouvert: 2 });
    expect(r[0]).toMatchObject({ ton: "critique" });
    expect(r[0]!.texte).toContain("2 mois");
  });

  it("signale l'absence de stock et de vente", () => {
    const r = alertes({ ...base, stockPieces: 0, caMois: 0 });
    expect(r.map((a) => a.ton)).toEqual(["alerte", "alerte"]);
  });

  it("invite à créer un produit quand le catalogue est vide", () => {
    const r = alertes({ ...base, aUnProduit: false, caMois: 0, stockPieces: 0 });
    expect(r).toHaveLength(1);
    expect(r[0]!.lien).toBe("/produits");
  });

  it("dit que tout va bien quand rien n'est à signaler", () => {
    expect(alertes(base)).toEqual([{ ton: "bon", texte: "Rien à signaler : trésorerie positive, stock et ventes en cours." }]);
    expect(alertes({ ...base, stocksBas: [] })).toHaveLength(1);
  });

  it("signale un stock bas avec ses jours restants, vers l'écran Stock", () => {
    const r = alertes({ ...base, stocksBas: [{ nom: "T-shirt", jours: 6.7 }] });
    expect(r).toEqual([
      { ton: "alerte", texte: "Stock bas : T-shirt (6 jours). Réapprovisionne avant la rupture.", lien: "/stock" },
    ]);
  });

  it("regroupe plusieurs produits et nomme la rupture d'un seul produit", () => {
    const r = alertes({
      ...base,
      stocksBas: [
        { nom: "Chemise", jours: 0 },
        { nom: "T-shirt", jours: 0.2 },
      ],
    });
    expect(r[0]!.texte).toBe("Stock bas : Chemise (rupture), T-shirt (moins d'un jour). Réapprovisionne avant la rupture.");
  });

  it("ne double pas l'alerte « plus de stock » quand tout le stock est à 0", () => {
    const r = alertes({ ...base, stockPieces: 0, stocksBas: [{ nom: "T-shirt", jours: 0 }] });
    expect(r.filter((a) => a.lien === "/stock")).toHaveLength(0);
    expect(r[0]!.texte).toContain("Plus de stock");
  });
});

describe("tresorerieFinDeMois", () => {
  it("donne le solde du compte 512 à la fin de chaque mois, mois sans mouvement compris", () => {
    expect(tresorerieFinDeMois(GL, 3, 4)).toEqual([20_000_00, 30_000_00, 26_200_00, 26_200_00]);
  });
});
