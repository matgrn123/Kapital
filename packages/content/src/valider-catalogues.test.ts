import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ValidationError } from "./validate.js";
import {
  LICENCE_DESSIN_SVG,
  validerBatiments,
  validerModules,
} from "./valider-catalogues.js";
import type { TypeBatiment, TypeModule } from "./catalogues.js";

const ici = dirname(fileURLToPath(import.meta.url));

// --- helpers ----------------------------------------------------------------

function batimentValide(): TypeBatiment {
  return {
    id: "test_atelier",
    nom: "Atelier test",
    categorie: "atelier",
    surface_m2: 150,
    nb_etages: 1,
    zones_amenageables: ["atelier", "stockage"],
    prix_achat_centimes: 43_000_000,
    loyer_mensuel_centimes: 250_000,
    charges_mensuelles_centimes: 105_000,
    etape_debloquee: 0,
    source_prix: "docs/referentiel-couts.md section 7",
    grille: { largeur: 10, hauteur: 5, entree_x: 0, entree_y: 3 },
    effet: { type: "production" },
    source_effet: "docs/plan-architecture-entreprise.md section 3",
    modele_path: null,
    modele_licence: LICENCE_DESSIN_SVG,
  };
}

function boutiqueValide(): TypeBatiment {
  return {
    ...batimentValide(),
    id: "test_boutique",
    nom: "Boutique test",
    categorie: "boutique",
    zones_amenageables: ["vente", "reserve"],
    etape_debloquee: 3,
    effet: { type: "point_de_vente", passants_par_jour: 2_500, bonus_desirabilite_points_par_mois: 0.5 },
  };
}

function moduleValide(): TypeModule {
  return {
    id: "poste_couture_test",
    nom: "Poste de couture test",
    largeur_grille: 2,
    hauteur_grille: 2,
    peut_pivoter: true,
    prix_centimes: 130_000,
    amortissement_mois: 60,
    effet: { type: "poste_artisan" },
    source_prix: "docs/referentiel-couts.md section 7",
    modele_path: null,
    modele_licence: LICENCE_DESSIN_SVG,
  };
}

// --- validerBatiments -------------------------------------------------------

describe("validerBatiments", () => {
  it("accepte une liste valide d'un bâtiment", () => {
    expect(() => validerBatiments([batimentValide()])).not.toThrow();
  });

  it("refuse une entrée qui n'est pas un tableau", () => {
    expect(() => validerBatiments({})).toThrow(ValidationError);
    expect(() => validerBatiments(null)).toThrow(ValidationError);
  });

  it("refuse un bâtiment sans modele_licence", () => {
    const b = batimentValide();
    delete (b as Partial<TypeBatiment>).modele_licence;
    expect(() => validerBatiments([b])).toThrow(ValidationError);
    expect(() => validerBatiments([b])).toThrow(/modele_licence/);
  });

  it("refuse un bâtiment avec modele_licence vide", () => {
    const b = { ...batimentValide(), modele_licence: "   " };
    expect(() => validerBatiments([b])).toThrow(/modele_licence/);
  });

  it("refuse un bâtiment sans champ modele_path (null est permis, l'absence non)", () => {
    const b = batimentValide();
    delete (b as Partial<TypeBatiment>).modele_path;
    expect(() => validerBatiments([b])).toThrow(ValidationError);
    expect(() => validerBatiments([b])).toThrow(/modele_path/);
  });

  it("dessiné en SVG (modele_path null) : la licence doit être celle du dessin original", () => {
    const b = { ...batimentValide(), modele_licence: "CC0 - Quaternius" };
    expect(() => validerBatiments([b])).toThrow(/modele_licence/);
  });

  it("modèle externe : chemin sous /models/ et licence CC0 obligatoires", () => {
    const ok = { ...batimentValide(), modele_path: "/models/X.gltf", modele_licence: "CC0 - Quaternius" };
    expect(() => validerBatiments([ok])).not.toThrow();
    const pasCc0 = { ...ok, modele_licence: "CC-BY 4.0 - Auteur" };
    expect(() => validerBatiments([pasCc0])).toThrow(/CC0/);
    const mauvaisChemin = { ...ok, modele_path: "models/X.gltf" };
    expect(() => validerBatiments([mauvaisChemin])).toThrow(/modele_path/);
  });

  it("refuse un bâtiment sans grille d'aménagement (dimensions 3D-1)", () => {
    const b = batimentValide();
    delete (b as Partial<TypeBatiment>).grille;
    expect(() => validerBatiments([b])).toThrow(/grille/);
  });

  it("refuse une grille de largeur nulle ou non entière", () => {
    const g = batimentValide().grille;
    expect(() => validerBatiments([{ ...batimentValide(), grille: { ...g, largeur: 0 } }])).toThrow(/grille/);
    expect(() => validerBatiments([{ ...batimentValide(), grille: { ...g, hauteur: 4.5 } }])).toThrow(/grille/);
  });

  it("refuse une entrée hors de la grille ou au milieu de la pièce", () => {
    const g = batimentValide().grille;
    expect(() => validerBatiments([{ ...batimentValide(), grille: { ...g, entree_y: 5 } }])).toThrow(/entree/);
    expect(() =>
      validerBatiments([{ ...batimentValide(), grille: { ...g, entree_x: 4, entree_y: 2 } }]),
    ).toThrow(/entree/);
  });

  it("refuse un bâtiment sans effet économique", () => {
    const b = batimentValide();
    delete (b as Partial<TypeBatiment>).effet;
    expect(() => validerBatiments([b])).toThrow(/effet/);
  });

  it("refuse un effet de bâtiment sans source", () => {
    expect(() => validerBatiments([{ ...batimentValide(), source_effet: " " }])).toThrow(/source_effet/);
  });

  it("accepte une boutique (catégorie AE-9) avec un effet point de vente", () => {
    expect(() => validerBatiments([boutiqueValide()])).not.toThrow();
  });

  it("refuse une boutique dont l'effet n'est pas un point de vente", () => {
    const b = { ...boutiqueValide(), effet: { type: "production" as const } };
    expect(() => validerBatiments([b])).toThrow(/point_de_vente/);
  });

  it("refuse un atelier dont l'effet n'est pas la production", () => {
    const b = { ...batimentValide(), effet: boutiqueValide().effet };
    expect(() => validerBatiments([b])).toThrow(/production/);
  });

  it("refuse un point de vente sans passants ou avec un bonus de désirabilité négatif", () => {
    const sansPassants = {
      ...boutiqueValide(),
      effet: { type: "point_de_vente" as const, passants_par_jour: 0, bonus_desirabilite_points_par_mois: 0.5 },
    };
    expect(() => validerBatiments([sansPassants])).toThrow(/passants_par_jour/);
    const bonusNegatif = {
      ...boutiqueValide(),
      effet: { type: "point_de_vente" as const, passants_par_jour: 100, bonus_desirabilite_points_par_mois: -1 },
    };
    expect(() => validerBatiments([bonusNegatif])).toThrow(/bonus_desirabilite/);
  });

  it("refuse un prix_achat non entier (critère d'acceptation 3D-1)", () => {
    const b = { ...batimentValide(), prix_achat_centimes: 1200.50 };
    expect(() => validerBatiments([b])).toThrow(/centimes.*entier|entier.*centimes/i);
  });

  it("refuse un loyer non entier", () => {
    const b = { ...batimentValide(), loyer_mensuel_centimes: 2500.99 };
    expect(() => validerBatiments([b])).toThrow(/centimes.*entier|entier.*centimes/i);
  });

  it("refuse une surface nulle ou négative", () => {
    expect(() => validerBatiments([{ ...batimentValide(), surface_m2: 0 }])).toThrow(/surface_m2/);
    expect(() => validerBatiments([{ ...batimentValide(), surface_m2: -10 }])).toThrow(/surface_m2/);
  });

  it("refuse un nb_etages inférieur à 1", () => {
    expect(() => validerBatiments([{ ...batimentValide(), nb_etages: 0 }])).toThrow(/nb_etages/);
  });

  it("refuse une catégorie inconnue", () => {
    const b = { ...batimentValide(), categorie: "garage" as TypeBatiment["categorie"] };
    expect(() => validerBatiments([b])).toThrow(/categorie/);
  });

  it("refuse un id vide", () => {
    expect(() => validerBatiments([{ ...batimentValide(), id: "" }])).toThrow(/id/);
  });

  it("refuse une source_prix vide", () => {
    expect(() => validerBatiments([{ ...batimentValide(), source_prix: "" }])).toThrow(/source_prix/);
  });

  it("mentionne le nom du bâtiment fautif dans le message", () => {
    const b = { ...batimentValide(), surface_m2: -1 };
    expect(() => validerBatiments([b])).toThrow(/test_atelier/);
  });
});

describe("batiments-v1.json (le vrai fichier)", () => {
  it("passe la validation", () => {
    const brut = JSON.parse(
      readFileSync(resolve(ici, "..", "batiments-v1.json"), "utf-8"),
    );
    expect(() => validerBatiments(brut)).not.toThrow();
  });

  it("contient au moins un bâtiment débloqué à l'étape 0", () => {
    const brut = JSON.parse(
      readFileSync(resolve(ici, "..", "batiments-v1.json"), "utf-8"),
    );
    const liste = validerBatiments(brut);
    expect(liste.some((b) => b.etape_debloquee === 0)).toBe(true);
  });

  it("chaque bâtiment est dessiné en SVG (aucun modèle glTF chargé par le jeu)", () => {
    const brut = JSON.parse(
      readFileSync(resolve(ici, "..", "batiments-v1.json"), "utf-8"),
    );
    for (const b of validerBatiments(brut)) {
      expect(b.modele_path).toBeNull();
      expect(b.modele_licence).toBe(LICENCE_DESSIN_SVG);
    }
  });

  it("contient 2 ou 3 emplacements de boutique, débloqués à l'étape 3", () => {
    const brut = JSON.parse(
      readFileSync(resolve(ici, "..", "batiments-v1.json"), "utf-8"),
    );
    const boutiques = validerBatiments(brut).filter((b) => b.categorie === "boutique");
    expect(boutiques.length).toBeGreaterThanOrEqual(2);
    expect(boutiques.length).toBeLessThanOrEqual(3);
    for (const b of boutiques) {
      expect(b.etape_debloquee).toBe(3);
      expect(b.loyer_mensuel_centimes).toBeGreaterThan(0);
      expect(b.effet.type).toBe("point_de_vente");
    }
  });

  it("garde les ateliers sur la grille déjà utilisée en base (10 × 5, entrée en 0,3 : migration 0019)", () => {
    const brut = JSON.parse(
      readFileSync(resolve(ici, "..", "batiments-v1.json"), "utf-8"),
    );
    for (const b of validerBatiments(brut).filter((x) => x.categorie === "atelier")) {
      expect(b.grille).toEqual({ largeur: 10, hauteur: 5, entree_x: 0, entree_y: 3 });
    }
  });
});

// --- validerModules ---------------------------------------------------------

describe("validerModules", () => {
  it("accepte une liste valide d'un module", () => {
    expect(() => validerModules([moduleValide()])).not.toThrow();
  });

  it("refuse un module avec modele_path mais sans modele_licence", () => {
    const m = {
      ...moduleValide(),
      modele_path: "/models/Machine_Couture.gltf",
      modele_licence: null,
    };
    expect(() => validerModules([m as unknown as TypeModule])).toThrow(/modele_licence/);
  });

  it("refuse un module dessiné en SVG dont la licence n'est pas celle du dessin original", () => {
    const m: TypeModule = {
      ...moduleValide(),
      modele_path: null,
      modele_licence: "CC0 - Quaternius",
    };
    expect(() => validerModules([m])).toThrow(/modele_licence/);
  });

  it("refuse un module sans licence (null n'est plus permis)", () => {
    const m = { ...moduleValide(), modele_licence: null };
    expect(() => validerModules([m as unknown as TypeModule])).toThrow(/modele_licence/);
  });

  it("refuse un modèle externe qui n'est pas CC0", () => {
    const m = { ...moduleValide(), modele_path: "/models/m.glb", modele_licence: "CC-BY 3.0 - Kenney" };
    expect(() => validerModules([m])).toThrow(/CC0/);
  });

  it("accepte un module dessiné en SVG (chemin null, licence du dessin original)", () => {
    expect(() => validerModules([moduleValide()])).not.toThrow();
  });

  it("refuse un bonus_motivation_max_pct > 5 (critère d'acceptation 3D-1)", () => {
    const m: TypeModule = {
      ...moduleValide(),
      effet: { type: "pause", bonus_motivation_max_pct: 6 },
    };
    expect(() => validerModules([m])).toThrow(/bonus_motivation_max_pct/);
  });

  it("accepte un bonus_motivation_max_pct exactement à 5", () => {
    const m: TypeModule = {
      ...moduleValide(),
      effet: { type: "pause", bonus_motivation_max_pct: 5 },
    };
    expect(() => validerModules([m])).not.toThrow();
  });

  it("refuse un prix non entier", () => {
    const m = { ...moduleValide(), prix_centimes: 130_000.50 };
    expect(() => validerModules([m])).toThrow(/centimes.*entier|entier.*centimes/i);
  });

  it("refuse un effet de type inconnu", () => {
    const m = { ...moduleValide(), effet: { type: "teleportation" } };
    expect(() => validerModules([m as unknown as TypeModule])).toThrow(/effet.*type|type.*effet/i);
  });

  it("refuse un module sans effet", () => {
    const m = moduleValide();
    delete (m as Partial<TypeModule>).effet;
    expect(() => validerModules([m])).toThrow(/effet/);
  });

  it("refuse une grille 0×0", () => {
    expect(() =>
      validerModules([{ ...moduleValide(), largeur_grille: 0 }]),
    ).toThrow(/largeur_grille/);
  });

  it("refuse un amortissement_mois de 0", () => {
    expect(() =>
      validerModules([{ ...moduleValide(), amortissement_mois: 0 }]),
    ).toThrow(/amortissement_mois/);
  });
});

describe("modules-v1.json (le vrai fichier)", () => {
  it("passe la validation", () => {
    const brut = JSON.parse(
      readFileSync(resolve(ici, "..", "modules-v1.json"), "utf-8"),
    );
    expect(() => validerModules(brut)).not.toThrow();
  });

  it("contient au moins un poste_artisan", () => {
    const brut = JSON.parse(
      readFileSync(resolve(ici, "..", "modules-v1.json"), "utf-8"),
    );
    const liste = validerModules(brut);
    expect(
      liste.some((m) => m.effet.type === "poste_artisan"),
    ).toBe(true);
  });

  it("contient une table de coupe", () => {
    const brut = JSON.parse(
      readFileSync(resolve(ici, "..", "modules-v1.json"), "utf-8"),
    );
    const liste = validerModules(brut);
    expect(
      liste.some((m) => m.effet.type === "table_coupe"),
    ).toBe(true);
  });

  it("chaque module a une licence : celle du dessin SVG original (3D-1)", () => {
    const brut = JSON.parse(
      readFileSync(resolve(ici, "..", "modules-v1.json"), "utf-8"),
    );
    for (const m of validerModules(brut)) {
      expect(m.modele_path).toBeNull();
      expect(m.modele_licence).toBe(LICENCE_DESSIN_SVG);
    }
  });

  it("chaque module a un effet économique, un prix et une source", () => {
    const brut = JSON.parse(
      readFileSync(resolve(ici, "..", "modules-v1.json"), "utf-8"),
    );
    for (const m of validerModules(brut)) {
      expect(m.effet.type).not.toBe("aucun");
      expect(m.prix_centimes).toBeGreaterThan(0);
      expect(m.source_prix.trim()).not.toBe("");
    }
  });
});
