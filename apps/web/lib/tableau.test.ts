import { describe, it, expect } from "vitest";
import { alertes, bilanSimplifie, caParMois, dernieresEcritures, type LigneGrandLivre } from "./tableau";

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
  });
});
