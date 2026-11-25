import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { enEquilibre, enregistrer, planComptableV1, soldeCompte, type EcritureComptable } from "../comptabilite/index.js";
import type { Entreprise } from "../types/entreprise.js";
import { centimes, idEntreprise, moisJeu } from "../types/primitifs.js";
import { cloturerMois } from "./cloture.js";
import { cumulVide } from "./donneesMois.js";
import { postesALaSignature } from "../atelier/effetsPlan.js";
import { chargerModulesV1 } from "@kapital/content";

const MODULES_CATALOGUE = chargerModulesV1();

const PARAMS = chargerParametresV1();
const FIN = { tvaAPayerCeMois: centimes(0), moisDecouvertConsecutifs: 0 };

function entreprise(o: Partial<Entreprise> = {}): Entreprise {
  return {
    id: idEntreprise("ent_bail"),
    nom: "Bail SAS",
    gamme: "milieu",
    etape: 2,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(2_000_000),
    stocksMatiere: [],
    stocksFinis: [],
    salaries: [],
    ateliers: [{
      surfaceM2: 150,
      loyerMensuel: centimes(250_000),
      modules: postesALaSignature(0, MODULES_CATALOGUE),
      bail: { depotGarantie: centimes(250_000), chargesMensuelles: centimes(105_000), moisSignature: moisJeu(1), moisFin: null },
    }],
    marque: { notoriete: 50, desirabilite: 50 },
    prets: [],
    catalogue: [],
    ...o,
  };
}

function cloturer(e: Entreprise, mois: number) {
  return cloturerMois(e, cumulVide(moisJeu(mois), e.tresorerie), FIN, PARAMS, moisJeu(mois));
}

function grandLivreDe(ecritures: readonly EcritureComptable[]) {
  return ecritures.reduce(enregistrer, planComptableV1());
}

describe("clôture : loyer, charges et fin de bail", () => {
  it("passe le loyer en 613 et les charges en 614", () => {
    const r = cloturer(entreprise(), 5);
    const gl = grandLivreDe(r.ecritures);
    expect(soldeCompte(gl, "613")).toBe(250_000);
    expect(soldeCompte(gl, "614")).toBe(105_000);
    expect(soldeCompte(gl, "512")).toBe(-355_000);
    expect(enEquilibre(gl)).toBe(true);
    expect(r.entrepriseApres.tresorerie).toBe(2_000_000 - 355_000);
    expect(r.entrepriseApres.ateliers).toHaveLength(1);
  });

  it("un atelier sans bail détaillé (ancien) ne paie que son loyer", () => {
    const e = entreprise();
    const r = cloturer({ ...e, ateliers: [{ ...e.ateliers[0]!, bail: undefined }] }, 5);
    const gl = grandLivreDe(r.ecritures);
    expect(soldeCompte(gl, "613")).toBe(250_000);
    expect(soldeCompte(gl, "614")).toBe(0);
  });

  it("au mois de fin de bail : dernier loyer payé, dépôt restitué, atelier libéré", () => {
    const e = entreprise();
    const fin = { ...e, ateliers: [{ ...e.ateliers[0]!, bail: { ...e.ateliers[0]!.bail!, moisFin: moisJeu(16) } }] };
    const avant = cloturer(fin, 15);
    expect(avant.entrepriseApres.ateliers).toHaveLength(1);
    expect(avant.ecritures.some((x) => x.id.startsWith("bail_restitution_"))).toBe(false);

    const r = cloturer(fin, 16);
    expect(r.entrepriseApres.ateliers).toEqual([]);
    const rest = r.ecritures.find((x) => x.id.startsWith("bail_restitution_"));
    expect(rest?.lignes).toEqual([
      { compte: "512", sens: "debit", montant: 250_000 },
      { compte: "275", sens: "credit", montant: 250_000 },
    ]);
    // 355 000 de loyer et charges sortis, 250 000 de dépôt revenus
    expect(r.entrepriseApres.tresorerie).toBe(2_000_000 - 355_000 + 250_000);
  });

  it("cycle complet : dépôt versé à la signature puis restitué, actif = passif à chaque étape", () => {
    const e = entreprise();
    const bail = e.ateliers[0]!.bail!;
    let gl = planComptableV1();
    gl = enregistrer(gl, {
      id: "capital",
      mois: moisJeu(0),
      libelle: "Capital",
      lignes: [
        { compte: "512", sens: "debit", montant: centimes(2_000_000) },
        { compte: "101", sens: "credit", montant: centimes(2_000_000) },
      ],
    });
    gl = enregistrer(gl, {
      id: "depot",
      mois: moisJeu(1),
      libelle: "Dépôt",
      lignes: [
        { compte: "275", sens: "debit", montant: bail.depotGarantie },
        { compte: "512", sens: "credit", montant: bail.depotGarantie },
      ],
    });
    expect(enEquilibre(gl)).toBe(true);
    const fin = { ...e, ateliers: [{ ...e.ateliers[0]!, bail: { ...bail, moisFin: moisJeu(2) } }] };
    for (const x of [...cloturer(fin, 1).ecritures, ...cloturer(fin, 2).ecritures]) gl = enregistrer(gl, x);
    expect(enEquilibre(gl)).toBe(true);
    expect(soldeCompte(gl, "275")).toBe(0);
  });
});

describe("3D-3 : amortissement du matériel posé (681 / 2815)", () => {
  it("les 2 postes fournis avec le local ne sont ni à l'actif ni amortis", () => {
    const e = entreprise();
    const r = cloturer({ ...e, ateliers: [{ ...e.ateliers[0]!, modules: postesALaSignature(2, MODULES_CATALOGUE) }] }, 5);
    expect(r.ecritures.find((x) => x.id.startsWith("amort_"))).toBeUndefined();
  });

  it("achat d'un poste (2154 / 512) puis clôtures : amortissement = prix / durée, grand livre équilibré", () => {
    const e = entreprise();
    const poste = MODULES_CATALOGUE.find((t) => t.id === "poste_couture_base")!;
    let gl = enregistrer(planComptableV1(), {
      id: "achat_modules",
      mois: moisJeu(4),
      libelle: "Achat de modules d'aménagement",
      lignes: [
        { compte: "2154", sens: "debit", montant: centimes(poste.prix_centimes) },
        { compte: "512", sens: "credit", montant: centimes(poste.prix_centimes) },
      ],
    });
    let ent: Entreprise = { ...e, ateliers: [{ ...e.ateliers[0]!, modules: postesALaSignature(3, MODULES_CATALOGUE) }] };
    const dotation = Math.round(poste.prix_centimes / poste.amortissement_mois);
    for (const mois of [5, 6, 7]) {
      const r = cloturer(ent, mois);
      for (const x of r.ecritures) gl = enregistrer(gl, x);
      expect(enEquilibre(gl)).toBe(true);
      ent = r.entrepriseApres;
    }
    expect(soldeCompte(gl, "681")).toBe(3 * dotation);
    expect(soldeCompte(gl, "2815")).toBe(3 * dotation);
    expect(ent.ateliers[0]?.materiel).toEqual({
      valeurBrute: poste.prix_centimes,
      amortissementsCumules: 3 * dotation,
    });
  });

  it("le matériel entièrement amorti ne l'est plus", () => {
    const e = entreprise();
    const poste = MODULES_CATALOGUE.find((t) => t.id === "poste_couture_base")!;
    const r = cloturer(
      {
        ...e,
        ateliers: [{
          ...e.ateliers[0]!,
          modules: postesALaSignature(3, MODULES_CATALOGUE),
          materiel: { valeurBrute: centimes(poste.prix_centimes), amortissementsCumules: centimes(poste.prix_centimes) },
        }],
      },
      5,
    );
    expect(r.ecritures.find((x) => x.id.startsWith("amort_"))).toBeUndefined();
  });
});
