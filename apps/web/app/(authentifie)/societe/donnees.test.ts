import { describe, expect, it } from "vitest";
import { chargerParametresV1 } from "@kapital/content";
import { seuilsEtapesDepuis } from "@kapital/engine";
import { capitalSocial, ecritureOuverture, etapesDuJeu, conditionsBoutique } from "./donnees";

const l = (ecriture_id: string, compte: string, sens: "debit" | "credit", montant_centimes: number) => ({
  ecriture_id,
  mois_jeu: 0,
  libelle: "Apport de capital initial",
  compte,
  sens,
  montant_centimes,
  cree_le: "2026-11-20T10:00:00Z",
});

const grandLivre = [
  l("apport_initial", "512", "debit", 2_000_000),
  l("apport_initial", "101", "credit", 2_000_000),
  l("vente_1", "512", "debit", 3_000),
  l("vente_1", "707", "credit", 3_000),
];

describe("capitalSocial", () => {
  it("lit le solde créditeur du compte 101", () => {
    expect(capitalSocial(grandLivre)).toBe(2_000_000);
  });
  it("vaut null sans écriture sur le 101", () => {
    expect(capitalSocial([])).toBeNull();
  });
});

describe("ecritureOuverture", () => {
  it("rend les lignes de l'apport, équilibrées", () => {
    const e = ecritureOuverture(grandLivre);
    expect(e?.lignes).toEqual([
      { compte: "512", debit: 2_000_000 },
      { compte: "101", credit: 2_000_000 },
    ]);
  });
  it("vaut null sans apport", () => {
    expect(ecritureOuverture(grandLivre.slice(2))).toBeNull();
  });
});

describe("etapesDuJeu", () => {
  const seuils = seuilsEtapesDepuis(chargerParametresV1());
  it("liste les étapes 0 à 2 avec leurs seuils lus dans les paramètres", () => {
    const e = etapesDuJeu(seuils);
    expect(e.map((x) => x.etape)).toEqual([0, 1, 2]);
    expect(e[1]!.condition).toContain(String(seuils.piecesEtape1));
    expect(e[1]!.debloque).toContain("la publicité");
    expect(e[2]!.debloque).toContain("l'embauche");
  });
});

describe("conditionsBoutique", () => {
  const seuils = seuilsEtapesDepuis(chargerParametresV1());
  it("à l'étape 0, deux jauges : pièces puis chiffre d'affaires, lues du moteur", () => {
    const c = conditionsBoutique({ etape: 0, piecesVendues: 10, chiffreAffairesHt: 5_000, tresorerie: 100 }, seuils);
    expect(c.map((x) => x.cle)).toEqual(["pieces_vendues", "chiffre_affaires_ht_cumule", "tresorerie_positive"]);
    expect(c[0]).toMatchObject({ valeur: 10, max: seuils.piecesEtape1, remplie: false });
    expect(c[2]).toMatchObject({ remplie: true });
  });
  it("à l'étape 2, tout est rempli", () => {
    const c = conditionsBoutique(
      { etape: 2, piecesVendues: 0, chiffreAffairesHt: 0, tresorerie: -5 },
      seuils,
    );
    expect(c.every((x) => x.remplie)).toBe(true);
  });
});
