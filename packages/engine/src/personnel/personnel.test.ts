import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { enEquilibre, enregistrer, planComptableV1 } from "../comptabilite/index.js";
import type { Salarie } from "../types/entreprise.js";
import { centimes, idSalarie, moisJeu } from "../types/primitifs.js";
import {
  artisansAuPoste,
  ecritureLicenciement,
  evaluerLicenciement,
  indemniteLicenciement,
  parametresLicenciementDepuis,
  postesLibres,
} from "./index.js";

const PARAMS = chargerParametresV1();
const P = parametresLicenciementDepuis(PARAMS);

function salarie(id: string, over: Partial<Salarie> = {}): Salarie {
  return {
    id: idSalarie(id),
    poste: "artisan",
    salaireBrutMensuel: centimes(200_000),
    ancienneteMois: 0,
    experienceMois: 0,
    ...over,
  };
}

describe("paramètres du licenciement", () => {
  it("viennent des paramètres sourcés (règle légale française)", () => {
    expect(P.ancienneteMinimaleMois).toBe(8);
    expect(P.moisDeSalaireParAn).toBe(0.25);
    expect(P.seuilAnnees).toBe(10);
    expect(P.moisDeSalaireParAnApresSeuil).toBeCloseTo(1 / 3, 6);
    for (const cle of [
      "licenciement_anciennete_minimale_mois",
      "licenciement_indemnite_mois_de_salaire_par_an",
      "licenciement_indemnite_mois_de_salaire_par_an_apres_seuil",
      "licenciement_indemnite_seuil_annees",
    ]) {
      const p = PARAMS[cle]!;
      expect(p.source.length).toBeGreaterThan(10);
      expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("indemnité de licenciement", () => {
  it("est nulle sous 8 mois d'ancienneté", () => {
    expect(indemniteLicenciement(salarie("a", { ancienneteMois: 7 }), P)).toBe(0);
  });

  it("vaut un quart de mois de salaire par année, au prorata des mois", () => {
    // 24 mois = 2 ans : 2 x 1/4 x 2 000 € = 1 000 €
    expect(indemniteLicenciement(salarie("a", { ancienneteMois: 24 }), P)).toBe(100_000);
    // 8 mois : 8/12 x 1/4 x 2 000 € = 333,33 €
    expect(indemniteLicenciement(salarie("a", { ancienneteMois: 8 }), P)).toBe(33_333);
  });

  it("passe à un tiers de mois par année au-delà de 10 ans", () => {
    // 12 ans : 10 x 1/4 + 2 x 1/3 = 3,1667 mois de salaire
    const attendu = Math.round(200_000 * (10 * 0.25 + 2 * 0.3333333333));
    expect(indemniteLicenciement(salarie("a", { ancienneteMois: 144 }), P)).toBe(attendu);
  });

  it("renvoie un entier de centimes", () => {
    expect(Number.isInteger(indemniteLicenciement(salarie("a", { ancienneteMois: 13 }), P))).toBe(true);
  });
});

describe("écriture du coût de départ", () => {
  it("débite 641 et crédite 512, équilibrée", () => {
    const e = ecritureLicenciement("ent_1", moisJeu(5), idSalarie("s1"), centimes(100_000));
    expect(e).not.toBeNull();
    expect(e!.lignes).toEqual([
      { compte: "641", sens: "debit", montant: 100_000 },
      { compte: "512", sens: "credit", montant: 100_000 },
    ]);
    expect(enEquilibre(enregistrer(planComptableV1(), e!))).toBe(true);
  });

  it("n'écrit rien quand l'indemnité est nulle", () => {
    expect(ecritureLicenciement("ent_1", moisJeu(5), idSalarie("s1"), centimes(0))).toBeNull();
  });
});

describe("évaluation d'un licenciement", () => {
  it("accepte et chiffre l'indemnité quand la trésorerie suffit", () => {
    const r = evaluerLicenciement(salarie("a", { ancienneteMois: 24 }), centimes(500_000), P);
    expect(r).toEqual({ ok: true, indemnite: 100_000 });
  });

  it("refuse en chiffrant ce qui manque quand la trésorerie ne couvre pas l'indemnité", () => {
    const r = evaluerLicenciement(salarie("a", { ancienneteMois: 24 }), centimes(30_000), P);
    expect(r).toMatchObject({ ok: false, code: "tresorerie_insuffisante", manque: 70_000 });
  });

  it("licencier un débutant ne coûte rien", () => {
    expect(evaluerLicenciement(salarie("a"), centimes(0), P)).toEqual({ ok: true, indemnite: 0 });
  });
});

describe("postes de l'atelier", () => {
  it("les postes libres sont les machines moins les artisans", () => {
    const s = [salarie("a"), salarie("b"), salarie("c", { poste: "encadrement" })];
    expect(postesLibres(s, 3)).toBe(1);
    expect(postesLibres(s, 2)).toBe(0);
    expect(postesLibres(s, 0)).toBe(0);
  });

  it("seuls les artisans les plus expérimentés occupent un poste", () => {
    const s = [
      salarie("debutant", { experienceMois: 0 }),
      salarie("ancien", { experienceMois: 30 }),
      salarie("moyen", { experienceMois: 10 }),
      salarie("chef", { poste: "encadrement", experienceMois: 99 }),
    ];
    const au = artisansAuPoste(s, 2).map((x) => x.id);
    expect(au).toEqual(["ancien", "moyen"]);
    expect(artisansAuPoste(s, 0)).toEqual([]);
  });
});
