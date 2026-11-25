import { describe, it, expect } from "vitest";
import { chargerParametresV1 } from "@kapital/content";
import {
  apportMinimal,
  centimes,
  coefficientsSalairesDepuisParametres,
  depotDeGarantie,
  parametresAchatDepuis,
  parametresBailDepuis,
  reglesPretDepuis,
  tauxPret,
} from "@kapital/engine";
import {
  apercuAchat,
  apercuBail,
  apercuEmbauche,
  apercuLicenciement,
  apercuPret,
  bornesSalaire,
  curseurMontant,
  dureesProposees,
  extraitEcheancier,
  lignesAffichees,
  lireEuros,
} from "./apercu-lot4";

const params = chargerParametresV1();
const regles = reglesPretDepuis(params);
const somme = (l: ReadonlyArray<{ debit?: number; credit?: number }>, k: "debit" | "credit") =>
  l.reduce((s, x) => s + (x[k] ?? 0), 0);

describe("lireEuros", () => {
  it("lit un montant saisi en euros, virgule ou point, en centimes entiers", () => {
    expect(lireEuros("10000")).toBe(1_000_000);
    expect(lireEuros("12,34")).toBe(1234);
    expect(lireEuros(" 1 500.5 ")).toBe(150_050);
  });
  it("refuse une saisie vide, négative ou illisible", () => {
    expect(lireEuros("")).toBeNull();
    expect(lireEuros("-3")).toBeNull();
    expect(lireEuros("abc")).toBeNull();
    expect(lireEuros("0")).toBeNull();
  });
});

describe("lignesAffichees", () => {
  it("transforme les lignes du moteur (sens, montant) en débit / crédit", () => {
    expect(
      lignesAffichees({
        id: "x",
        mois: 0 as never,
        libelle: "x",
        lignes: [
          { compte: "512", sens: "debit", montant: centimes(5) },
          { compte: "164", sens: "credit", montant: centimes(5) },
        ],
      }),
    ).toEqual([
      { compte: "512", debit: 5 },
      { compte: "164", credit: 5 },
    ]);
  });
});

describe("apercuPret", () => {
  const situation = { tresorerie: 2_000_000, detteEnCours: 0 };
  it("donne la mensualité, le coût du crédit et l'écriture 512 / 164 du moteur", () => {
    const r = apercuPret({ situation, objet: "tresorerie", capital: 1_000_000, dureeMois: 12, estrAnnuel: 0.02, mois: 3, regles });
    expect(r.evaluation.ok).toBe(true);
    expect(r.simulation).not.toBeNull();
    const s = r.simulation!;
    expect(s.taux).toBe(tauxPret("tresorerie", 0.02, regles));
    expect(s.echeancier).toHaveLength(12);
    expect(s.coutTotal).toBe(s.echeancier.reduce((t, e) => t + e.montant, 0) - 1_000_000);
    expect(s.ecriture.lignes).toEqual([
      { compte: "512", debit: 1_000_000 },
      { compte: "164", credit: 1_000_000 },
    ]);
    expect(s.tresorerieApres).toBe(3_000_000);
  });
  it("signale le refus du moteur quand le plafond par prêt est dépassé", () => {
    const plafond = regles.parObjet.tresorerie.plafondMontant;
    const r = apercuPret({
      situation: { tresorerie: plafond * 10, detteEnCours: 0 },
      objet: "tresorerie",
      capital: plafond + 100,
      dureeMois: regles.parObjet.tresorerie.dureeMinMois,
      estrAnnuel: 0.02,
      mois: 0,
      regles,
    });
    expect(r.evaluation.ok).toBe(false);
  });
  it("ne simule rien sur une durée hors bornes", () => {
    const r = apercuPret({ situation, objet: "tresorerie", capital: 100_000, dureeMois: 9999, estrAnnuel: 0.02, mois: 0, regles });
    expect(r.simulation).toBeNull();
    expect(r.evaluation.ok).toBe(false);
  });
});

describe("extraitEcheancier", () => {
  it("garde les trois premières échéances et la dernière", () => {
    const e = Array.from({ length: 10 }, (_, i) => ({ numero: i + 1 }));
    expect(extraitEcheancier(e).map((x) => (x === null ? null : x.numero))).toEqual([1, 2, 3, null, 10]);
    expect(extraitEcheancier(e.slice(0, 4)).map((x) => x?.numero)).toEqual([1, 2, 3, 4]);
  });
});

describe("apercuBail", () => {
  it("donne l'écriture du dépôt (275 / 512) et les écritures du mois (613, 614)", () => {
    const r = apercuBail({ loyer: 250_000, charges: 105_000, mois: 2, params, tresorerie: 1_000_000 });
    const depot = depotDeGarantie(centimes(250_000), parametresBailDepuis(params));
    expect(r.depot).toBe(depot);
    expect(r.signature.lignes).toEqual([
      { compte: "275", debit: depot },
      { compte: "512", credit: depot },
    ]);
    expect(r.mensuelles.map((e) => e.lignes[0]!.compte)).toEqual(["613", "614"]);
    expect(r.tresorerieApres).toBe(1_000_000 - depot);
    expect(r.manque).toBe(0);
  });
  it("chiffre ce qui manque si la trésorerie ne couvre pas le dépôt", () => {
    const r = apercuBail({ loyer: 250_000, charges: 0, mois: 0, params, tresorerie: 0 });
    expect(r.manque).toBe(r.depot);
    expect(r.mensuelles).toHaveLength(1);
  });
});

describe("apercuAchat", () => {
  const batiment = { id: "petit_atelier", surfaceM2: 150, prixAchat: 42_857_000, chargesMensuelles: 105_000 };
  const minimum = apportMinimal(centimes(batiment.prixAchat), parametresAchatDepuis(params));
  it("reprend les écritures du moteur : prêt 512 / 164 puis achat 213 / 512", () => {
    const r = apercuAchat({
      batiment,
      apport: minimum,
      dureePretMois: parametresAchatDepuis(params).dureePretMois,
      estrAnnuel: 0.02,
      tresorerie: 100_000_000,
      detteEnCours: 0,
      mois: 1,
      params,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ecritures).toHaveLength(2);
    expect(r.ecritures[0]!.lignes).toEqual([
      { compte: "512", debit: batiment.prixAchat - minimum },
      { compte: "164", credit: batiment.prixAchat - minimum },
    ]);
    expect(r.ecritures[1]!.lignes).toEqual([
      { compte: "213", debit: batiment.prixAchat },
      { compte: "512", credit: batiment.prixAchat },
    ]);
    expect(r.tresorerieApres).toBe(100_000_000 - minimum);
    expect(r.mensualite).toBe(r.echeancier[0]!.montant);
  });
  it("relaie le refus du moteur (apport trop faible)", () => {
    const r = apercuAchat({
      batiment,
      apport: minimum - 1,
      dureePretMois: parametresAchatDepuis(params).dureePretMois,
      estrAnnuel: 0.02,
      tresorerie: 100_000_000,
      detteEnCours: 0,
      mois: 1,
      params,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/apport/i);
  });
});

describe("apercuEmbauche", () => {
  const coef = coefficientsSalairesDepuisParametres(params);
  it("donne le coût employeur et l'écriture de paie de fin de mois du moteur", () => {
    const r = apercuEmbauche({ salaireBrut: coef.smicMensuelBrut, coefficients: coef, mois: 4 });
    expect(r.coutEmployeur).toBe(coef.smicMensuelBrut + r.cotisations);
    expect(r.paie.lignes.map((l) => l.compte)).toEqual(["641", "645", "421", "431"]);
    expect(somme(r.paie.lignes, "debit")).toBe(somme(r.paie.lignes, "credit"));
    expect(r.paie.lignes[0]!.debit).toBe(coef.smicMensuelBrut);
  });
});

describe("apercuLicenciement", () => {
  it("donne l'écriture 641 / 512 quand une indemnité est due, rien sinon", () => {
    expect(apercuLicenciement({ indemnite: 0, mois: 1, idSalarie: "s" })).toBeNull();
    expect(apercuLicenciement({ indemnite: 5000, mois: 1, idSalarie: "s" })!.lignes).toEqual([
      { compte: "641", debit: 5000 },
      { compte: "512", credit: 5000 },
    ]);
  });
});

describe("curseurMontant", () => {
  it("va d'un pas au plus gros prêt possible, pas arrondi pour environ 100 crans", () => {
    const c = curseurMontant(2_345_678);
    expect(c.pas).toBe(10_000);
    expect(c.min).toBe(10_000);
    expect(c.max).toBe(2_340_000);
  });
  it("rien à emprunter : curseur vide", () => {
    expect(curseurMontant(0)).toEqual({ min: 0, max: 0, pas: 100 });
  });
  it("petite capacité : le pas ne descend pas sous 1 €", () => {
    const c = curseurMontant(5_000);
    expect(c.pas).toBe(100);
    expect(c.max).toBe(5_000);
  });
});

describe("dureesProposees", () => {
  it("donne la borne basse, chaque année pleine, puis la borne haute", () => {
    expect(dureesProposees(6, 30)).toEqual([6, 12, 24, 30]);
    expect(dureesProposees(12, 36)).toEqual([12, 24, 36]);
  });
  it("respecte les bornes de chaque objet du paramètre", () => {
    for (const r of Object.values(regles.parObjet)) {
      const d = dureesProposees(r.dureeMinMois, r.dureeMaxMois);
      expect(d[0]).toBe(r.dureeMinMois);
      expect(d[d.length - 1]).toBe(r.dureeMaxMois);
    }
  });
});

describe("bornesSalaire", () => {
  it("part du SMIC du paramètre et monte jusqu'au seuil des cotisations pleines", () => {
    const co = coefficientsSalairesDepuisParametres(params);
    const b = bornesSalaire(co);
    expect(b.min).toBe(co.smicMensuelBrut);
    expect(b.max).toBe(Math.round(co.smicMensuelBrut * co.seuilCotisationsPleinesEnSmic));
    expect(b.pas).toBeGreaterThan(0);
  });
});
