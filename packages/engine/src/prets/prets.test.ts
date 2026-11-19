import { describe, expect, it } from "vitest";
import {
  enEquilibre,
  planComptableV1,
  soldeCompte,
} from "../comptabilite/index.js";
import { centimes, moisJeu } from "../types/primitifs.js";
import {
  enregistrerDeblocagePret,
  enregistrerEcheance,
  genererEcheancier,
  mensualite,
} from "./calculs.js";

describe("mensualite", () => {
  it("prêt 10 000 € sur 12 mois à 12 % → mensualité ≈ 888,49 €", () => {
    const m = mensualite(centimes(1_000_000), 0.12, 12);
    expect(m).toBeGreaterThan(88_800);
    expect(m).toBeLessThan(88_900);
  });

  it("prêt 10 000 € sur 60 mois à 5 % → mensualité ≈ 188,71 €", () => {
    const m = mensualite(centimes(1_000_000), 0.05, 60);
    expect(m).toBeGreaterThan(18_800);
    expect(m).toBeLessThan(18_900);
  });

  it("taux 0 : mensualité = capital / durée", () => {
    const m = mensualite(centimes(1_200_000), 0, 12);
    expect(m).toBe(100_000);
  });

  it("refuse capital nul ou durée nulle", () => {
    expect(() => mensualite(centimes(0), 0.05, 12)).toThrow();
    expect(() => mensualite(centimes(1000), 0.05, 0)).toThrow();
  });
});

describe("genererEcheancier — critère T12 : échéancier exact", () => {
  it("somme des amortissements = capital initial", () => {
    const capital = 1_000_000;
    const ech = genererEcheancier(centimes(capital), 0.05, 60);
    const totalAmort = ech.reduce((s, e) => s + e.amortissement, 0);
    expect(totalAmort).toBe(capital);
  });

  it("capital restant final = 0", () => {
    const ech = genererEcheancier(centimes(1_000_000), 0.05, 60);
    expect(ech[ech.length - 1]!.capitalRestantApres).toBe(0);
  });

  it("intérêts décroissent, amortissements croissent", () => {
    const ech = genererEcheancier(centimes(1_000_000), 0.08, 36);
    for (let i = 1; i < ech.length - 1; i++) {
      expect(ech[i]!.interets).toBeLessThanOrEqual(ech[i - 1]!.interets);
      expect(ech[i]!.amortissement).toBeGreaterThanOrEqual(
        ech[i - 1]!.amortissement,
      );
    }
  });

  it("le nombre d'échéances = durée en mois", () => {
    const ech = genererEcheancier(centimes(500_000), 0.03, 24);
    expect(ech).toHaveLength(24);
  });

  it("taux 0 : chaque mensualité = capital / durée, pas d'intérêts", () => {
    const ech = genererEcheancier(centimes(1_200_000), 0, 12);
    for (const e of ech) {
      expect(e.interets).toBe(0);
      expect(e.amortissement).toBe(100_000);
      expect(e.montant).toBe(100_000);
    }
  });
});

describe("enregistrement comptable du prêt", () => {
  it("déblocage : 512 débit / 164 crédit, équilibre", () => {
    const gl = enregistrerDeblocagePret(planComptableV1(), {
      idEcriture: "pret_debut",
      mois: moisJeu(0),
      capital: centimes(1_000_000),
    });
    expect(soldeCompte(gl, "512")).toBe(1_000_000);
    expect(soldeCompte(gl, "164")).toBe(1_000_000);
    expect(enEquilibre(gl)).toBe(true);
  });

  it("échéance : 164+661 débit / 512 crédit, équilibre", () => {
    let gl = enregistrerDeblocagePret(planComptableV1(), {
      idEcriture: "p",
      mois: moisJeu(0),
      capital: centimes(1_000_000),
    });
    const ech = genererEcheancier(centimes(1_000_000), 0.05, 60);
    gl = enregistrerEcheance(gl, {
      idEcriture: "p_ech1",
      mois: moisJeu(1),
      echeance: ech[0]!,
    });
    expect(enEquilibre(gl)).toBe(true);
  });

  it("scénario complet : après toutes les échéances, 164 = 0, 661 = somme intérêts", () => {
    let gl = enregistrerDeblocagePret(planComptableV1(), {
      idEcriture: "p",
      mois: moisJeu(0),
      capital: centimes(1_000_000),
    });
    const ech = genererEcheancier(centimes(1_000_000), 0.06, 24);
    const totalInterets = ech.reduce((s, e) => s + e.interets, 0);
    for (let i = 0; i < ech.length; i++) {
      gl = enregistrerEcheance(gl, {
        idEcriture: `p_e${i + 1}`,
        mois: moisJeu(i + 1),
        echeance: ech[i]!,
      });
    }
    expect(soldeCompte(gl, "164")).toBe(0);
    expect(soldeCompte(gl, "661")).toBe(totalInterets);
    expect(enEquilibre(gl)).toBe(true);
  });
});
