import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { enEquilibre, enregistrer, planComptableV1, soldeCompte } from "../comptabilite/index.js";
import { centimes, moisJeu } from "../types/primitifs.js";
import { capitalDeDepart, creerSociete, ErreurSociete } from "./index.js";

const PARAMS = chargerParametresV1();

describe("création de la société", () => {
  it("le capital de départ vient des paramètres : 20 000 €", () => {
    expect(capitalDeDepart(PARAMS)).toBe(centimes(2_000_000));
  });

  it("après création : 20 000 € en banque = 20 000 € de capital, bilan équilibré", () => {
    const s = creerSociete({ params: PARAMS, nom: "Maison Test", gamme: "milieu", mois: moisJeu(0) });
    const gl = enregistrer(planComptableV1(), s.ecritureApport);
    expect(enEquilibre(gl)).toBe(true);
    expect(soldeCompte(gl, "512")).toBe(centimes(2_000_000));
    expect(soldeCompte(gl, "101")).toBe(centimes(2_000_000));
    expect(s.tresorerie).toBe(centimes(2_000_000));
  });

  it("naît à l'étape 0, sans atelier, société par actions simplifiée (SAS)", () => {
    const s = creerSociete({ params: PARAMS, nom: "Maison Test", gamme: "entree", mois: moisJeu(0) });
    expect(s.etape).toBe(0);
    expect(s.atelier).toBeNull();
    expect(s.formeJuridique).toBe("SAS");
    expect(s.gamme).toBe("entree");
  });

  it("nettoie le nom et refuse un nom vide ou trop long", () => {
    expect(creerSociete({ params: PARAMS, nom: "  Maison  Test ", gamme: "haut", mois: moisJeu(0) }).nom).toBe(
      "Maison Test",
    );
    for (const nom of ["", "   ", "x".repeat(61)]) {
      expect(() => creerSociete({ params: PARAMS, nom, gamme: "haut", mois: moisJeu(0) })).toThrow(ErreurSociete);
    }
  });

  it("refuse une gamme inconnue", () => {
    expect(() =>
      creerSociete({ params: PARAMS, nom: "Maison Test", gamme: "luxe" as never, mois: moisJeu(0) }),
    ).toThrow(ErreurSociete);
  });

  it("est rejouable à l'identique", () => {
    const e = { params: PARAMS, nom: "Maison Test", gamme: "milieu" as const, mois: moisJeu(0) };
    expect(creerSociete(e)).toEqual(creerSociete(e));
  });
});
