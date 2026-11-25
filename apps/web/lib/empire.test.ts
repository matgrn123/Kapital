import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chargerBatimentsV1 } from "@kapital/content";
import {
  apparenceBatiment,
  batimentsDeLEmpire,
  COLONNES_COMPTES_PUBLICS,
  dimensionsVignette,
  estIdentifiantSociete,
  lireComptesPublics,
  moisDuProchainDepot,
  SELECT_COMPTES_PUBLICS,
  type LocalDuJoueur,
} from "./empire";

const catalogue = chargerBatimentsV1();

const atelierLoue: LocalDuJoueur = {
  batiment_id: "petit_atelier",
  surface_m2: 150,
  loyer_mensuel_centimes: 250_000,
  charges_mensuelles_centimes: 105_000,
  mode_detention: "bail",
};

describe("liste blanche des comptes publics", () => {
  it("reprend exactement les colonnes de la vue comptes_publics (migration 0035)", () => {
    const sql = readFileSync(new URL("../../../supabase/migrations/0035_comptes_publics.sql", import.meta.url), "utf8");
    for (const c of COLONNES_COMPTES_PUBLICS) expect(sql).toContain(c);
    expect(SELECT_COMPTES_PUBLICS).toBe(COLONNES_COMPTES_PUBLICS.join(", "));
  });

  it("ne demande aucune donnée privée", () => {
    for (const interdit of ["tresorerie", "loyer", "salari", "pret", "stock", "prix", "owner", "mode_detention"]) {
      expect(SELECT_COMPTES_PUBLICS).not.toContain(interdit);
    }
  });
});

describe("lireComptesPublics", () => {
  it("convertit les bigint renvoyés en texte et garde null tant qu'aucun exercice n'est clos", () => {
    const avant = lireComptesPublics({
      company_id: "c1",
      nom: "Maison Lumen",
      gamme: "milieu",
      etape: 1,
      valeur_centimes: "1234500",
      batiment_id: "petit_atelier",
      exercice: null,
      exercice_mois_debut: null,
      exercice_mois_fin: null,
      chiffre_affaires_ht_centimes: null,
      resultat_centimes: null,
      total_bilan_centimes: null,
    });
    expect(avant.valeurCentimes).toBe(1_234_500);
    expect(avant.exercice).toBeNull();

    const apres = lireComptesPublics({
      company_id: "c1",
      nom: "Maison Lumen",
      gamme: "milieu",
      etape: 2,
      valeur_centimes: 0,
      batiment_id: null,
      exercice: 0,
      exercice_mois_debut: 0,
      exercice_mois_fin: 11,
      chiffre_affaires_ht_centimes: "3000000",
      resultat_centimes: "-45000",
      total_bilan_centimes: "2100000",
    });
    expect(apres.exercice).toEqual({
      numero: 0,
      moisDebut: 0,
      moisFin: 11,
      chiffreAffairesHtCentimes: 3_000_000,
      resultatCentimes: -45_000,
      totalBilanCentimes: 2_100_000,
    });
    expect(apres.batimentId).toBeNull();
  });
});

describe("moisDuProchainDepot", () => {
  it("annonce la fin du premier exercice puis des suivants (mois comptés depuis 0)", () => {
    expect(moisDuProchainDepot(0)).toBe(12);
    expect(moisDuProchainDepot(11)).toBe(12);
    expect(moisDuProchainDepot(12)).toBe(24);
    expect(moisDuProchainDepot(30)).toBe(36);
  });
});

describe("estIdentifiantSociete", () => {
  it("n'accepte qu'un uuid", () => {
    expect(estIdentifiantSociete("2b1f9c3e-0a4d-4c55-9a43-6f1e2d3c4b5a")).toBe(true);
    expect(estIdentifiantSociete("abc")).toBe(false);
    expect(estIdentifiantSociete("2b1f9c3e-0a4d-4c55-9a43-6f1e2d3c4b5a' or 1=1")).toBe(false);
  });
});

describe("batimentsDeLEmpire", () => {
  it("rend une liste vide sans local", () => {
    expect(batimentsDeLEmpire({ ateliers: [] }, catalogue)).toEqual([]);
  });

  it("décrit l'atelier loué avec le catalogue : nom, catégorie, étages, loyer, liens", () => {
    const [b] = batimentsDeLEmpire({ ateliers: [atelierLoue] }, catalogue);
    expect(b).toMatchObject({
      cle: "atelier",
      nom: "Petit atelier",
      categorie: "atelier",
      surfaceM2: 150,
      nbEtages: 1,
      mode: "locataire",
      loyerMensuelCentimes: 250_000,
      chargesMensuellesCentimes: 105_000,
    });
    expect(b!.liens.map((l) => l.href)).toEqual(["/atelier-3d", "/locaux"]);
  });

  it("classe l'achat comptant et l'achat à crédit comme propriétaire", () => {
    for (const mode of ["achat", "credit"] as const) {
      const [b] = batimentsDeLEmpire({ ateliers: [{ ...atelierLoue, mode_detention: mode, loyer_mensuel_centimes: 0 }] }, catalogue);
      expect(b!.mode).toBe("proprietaire");
    }
  });

  it("garde un atelier ancien sans bâtiment du catalogue (avant AE-5)", () => {
    const [b] = batimentsDeLEmpire({ ateliers: [{ ...atelierLoue, batiment_id: null, surface_m2: 50 }] }, catalogue);
    expect(b).toMatchObject({ nom: "Atelier", categorie: "atelier", surfaceM2: 50, nbEtages: 1 });
  });
});

describe("3D-7 : plusieurs locaux dans l'empire", () => {
  it("un bâtiment par local, chacun avec son lien vers son intérieur", () => {
    const b = batimentsDeLEmpire(
      { ateliers: [{ ...atelierLoue, id: "wA" }, { ...atelierLoue, id: "wB", mode_detention: "credit", loyer_mensuel_centimes: 0 }] },
      catalogue,
    );
    expect(b.map((x) => x.cle)).toEqual(["atelier_wA", "atelier_wB"]);
    expect(b.map((x) => x.mode)).toEqual(["locataire", "proprietaire"]);
    expect(b[1]!.liens[0]!.href).toBe("/atelier-3d?local=wB");
  });
});

describe("apparence et vignette", () => {
  it("donne un style par catégorie, plus haut avec les étages", () => {
    expect(apparenceBatiment("atelier", 1, "LUMEN").style).toBe("maison");
    expect(apparenceBatiment("atelier", 3, "LUMEN").style).toBe("industriel");
    expect(apparenceBatiment("entrepot", 1, "X").style).toBe("industriel");
    expect(apparenceBatiment("bureau", 2, "X").style).toBe("vitre");
    expect(apparenceBatiment("prestige", 2, "X").style).toBe("classique");
    expect(apparenceBatiment("boutique", 1, "X").style).toBe("boutique");
    expect(apparenceBatiment("atelier", 3, "X").h).toBeGreaterThan(apparenceBatiment("atelier", 1, "X").h);
    expect(apparenceBatiment("atelier", 1, "MAISON").enseigne).toBe("MAISON");
  });

  it("agrandit l'emprise avec la surface, dans des bornes lisibles", () => {
    const petit = dimensionsVignette(50);
    const grand = dimensionsVignette(320);
    expect(grand.w).toBeGreaterThan(petit.w);
    expect(dimensionsVignette(10_000).w).toBeLessThanOrEqual(4);
    expect(petit.w).toBeGreaterThanOrEqual(2);
  });
});
