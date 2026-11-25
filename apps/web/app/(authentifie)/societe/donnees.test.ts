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
  it("liste les étapes 0 à 3 avec leurs seuils lus dans les paramètres", () => {
    const e = etapesDuJeu(seuils);
    expect(e.map((x) => x.etape)).toEqual([0, 1, 2, 3]);
    expect(e[3]!.intitule).toBe("La boutique");
    expect(e[3]!.debloque).toContain("l'ouverture d'une boutique");
    expect(e[3]!.condition).toContain(`${seuils.notorieteMinimaleEtape3} points de notoriété`);
    expect(e[1]!.condition).toContain(String(seuils.piecesEtape1));
    expect(e[1]!.debloque).toContain("la publicité");
    expect(e[2]!.debloque).toContain("l'embauche");
  });
});

describe("conditionsBoutique", () => {
  const seuils = seuilsEtapesDepuis(chargerParametresV1());
  it("trois jauges de l'étape 3 : chiffre d'affaires, trésorerie, notoriété, lues du moteur", () => {
    const c = conditionsBoutique(
      { etape: 2, piecesVendues: 900, chiffreAffairesHt: 5_000_000, tresorerie: 4_000_000, notoriete: 12.7 },
      seuils,
    );
    expect(c.map((x) => x.cle)).toEqual(["chiffre_affaires_ht_cumule", "tresorerie_minimale", "notoriete"]);
    expect(c[0]).toMatchObject({ valeur: 5_000_000, max: seuils.chiffreAffairesHtEtape3, remplie: false });
    expect(c[1]).toMatchObject({ valeur: seuils.tresorerieMinimaleEtape3, remplie: true });
    expect(c[2]).toMatchObject({ remplie: false, texte: "12 / 30 points" });
  });
  it("à l'étape 3, tout est acquis même si la trésorerie a baissé", () => {
    const c = conditionsBoutique(
      { etape: 3, piecesVendues: 0, chiffreAffairesHt: 0, tresorerie: -5, notoriete: 0 },
      seuils,
    );
    expect(c.every((x) => x.remplie)).toBe(true);
    expect(c[1]!.valeur).toBe(0);
  });
});
