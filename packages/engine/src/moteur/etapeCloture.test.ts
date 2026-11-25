import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import type { Entreprise } from "../types/entreprise.js";
import { centimes, idEntreprise, idPret, moisJeu } from "../types/primitifs.js";
import { cloturerMois } from "./cloture.js";
import { cumulVide, type CumulMois } from "./donneesMois.js";

const PARAMS = chargerParametresV1();
const FIN = { tvaAPayerCeMois: centimes(0), moisDecouvertConsecutifs: 0 };

function entreprise(o: Partial<Entreprise> = {}): Entreprise {
  return {
    id: idEntreprise("ent_etape"),
    nom: "Étape SAS",
    gamme: "milieu",
    etape: 0,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(1_000_000),
    stocksMatiere: [],
    stocksFinis: [],
    salaries: [],
    atelier: null,
    marque: { notoriete: 50, desirabilite: 50 },
    prets: [],
    catalogue: [],
    ...o,
  };
}

/** Mois où `pieces` pièces ont été servies (tous canaux) pour `ca` centimes hors taxes. */
function cumulAvecVentes(pieces: number, ca: number): CumulMois {
  const base = cumulVide(moisJeu(1), centimes(1_000_000));
  return {
    ...base,
    serviParLigne: { "prod_a|vente_directe": pieces - Math.floor(pieces / 2), "prod_a|revendeur": Math.floor(pieces / 2) },
    chiffreAffairesHt: ca,
  };
}

describe("constat d'étape à la clôture du mois", () => {
  it("ne rajoute pas les ventes du mois aux compteurs : ils sont déjà à jour à chaque vente", () => {
    const r = cloturerMois(
      entreprise({ cumulsEtape: { piecesVendues: 40, chiffreAffairesHt: centimes(110_000) } }),
      cumulAvecVentes(30, 90_000),
      FIN,
      PARAMS,
      moisJeu(1),
    );
    expect(r.entrepriseApres.cumulsEtape).toEqual({ piecesVendues: 40, chiffreAffairesHt: centimes(110_000) });
  });

  it("une entreprise sans compteurs (avant AE-2) part de zéro", () => {
    const r = cloturerMois(entreprise(), cumulVide(moisJeu(1), centimes(1_000_000)), FIN, PARAMS, moisJeu(1));
    expect(r.entrepriseApres.cumulsEtape).toEqual({ piecesVendues: 0, chiffreAffairesHt: centimes(0) });
    expect(r.etapeApres).toBe(0);
  });

  it("passe à l'étape 1 à 50 pièces vendues au total", () => {
    const r = cloturerMois(
      entreprise({ cumulsEtape: { piecesVendues: 50, chiffreAffairesHt: centimes(140_000) } }),
      cumulAvecVentes(12, 40_000),
      FIN,
      PARAMS,
      moisJeu(1),
    );
    expect(r.etapeApres).toBe(1);
    expect(r.entrepriseApres.etape).toBe(1);
  });

  it("passe à l'étape 2 à 30 000 € de chiffre d'affaires cumulé avec trésorerie positive", () => {
    const r = cloturerMois(
      entreprise({ etape: 1, cumulsEtape: { piecesVendues: 650, chiffreAffairesHt: centimes(3_050_000) } }),
      cumulAvecVentes(50, 150_000),
      FIN,
      PARAMS,
      moisJeu(1),
    );
    expect(r.etapeApres).toBe(2);
  });

  it("reste à l'étape 1 si la trésorerie de clôture est négative", () => {
    const base = entreprise({
      etape: 1,
      tresorerie: centimes(-1_000_000),
      cumulsEtape: { piecesVendues: 600, chiffreAffairesHt: centimes(2_900_000) },
    });
    const cumul = { ...cumulAvecVentes(50, 150_000), tresorerieDebutMois: centimes(-1_000_000) };
    const r = cloturerMois(base, cumul, FIN, PARAMS, moisJeu(1));
    expect(r.entrepriseApres.tresorerie).toBeLessThan(0);
    expect(r.etapeApres).toBe(1);
  });

  it("ne redescend jamais d'étape", () => {
    const r = cloturerMois(
      entreprise({ etape: 2, tresorerie: centimes(-500_000) }),
      { ...cumulVide(moisJeu(1), centimes(-500_000)) },
      FIN,
      PARAMS,
      moisJeu(1),
    );
    expect(r.etapeApres).toBe(2);
    expect(r.entrepriseApres.etape).toBe(2);
  });
});

describe("échéances de prêt à la clôture (mois comptés depuis 0)", () => {
  const pret = (capitalRestant: number) => ({
    id: idPret("p1"),
    capitalInitial: centimes(1_200_000),
    capitalRestant: centimes(capitalRestant),
    tauxAnnuel: 0.04,
    dureeTotaleMois: 12,
    objet: "tresorerie" as const,
    moisDebut: moisJeu(3),
  });
  const clore = (capitalRestant: number, mois: number) =>
    cloturerMois(entreprise({ prets: [pret(capitalRestant)] }), cumulVide(moisJeu(mois), centimes(1_000_000)), FIN, PARAMS, moisJeu(mois));

  it("pas d'échéance à la fin du mois où le prêt est accordé, la première le mois suivant", () => {
    expect(clore(1_200_000, 3).ecritures.some((e) => e.id.startsWith("echeance_"))).toBe(false);
    expect(clore(1_200_000, 4).ecritures.some((e) => e.id === "echeance_4_p1")).toBe(true);
  });

  it("une échéance déjà payée n'est jamais repayée (reprise après changement de convention)", () => {
    const apres1 = clore(1_200_000, 4).entrepriseApres.prets[0]!.capitalRestant;
    const r = clore(apres1, 4);
    expect(r.ecritures.some((e) => e.id.startsWith("echeance_"))).toBe(false);
    expect(r.entrepriseApres.prets[0]!.capitalRestant).toBe(apres1);
  });
});
