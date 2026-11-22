import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ValidationError } from "./validate.js";
import {
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
    modele_path: "/models/Building_Small_1.gltf",
    modele_licence: "CC0 - Quaternius Downtown City MegaKit",
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
    modele_licence: null,
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

  it("refuse un bâtiment sans modele_path", () => {
    const b = batimentValide();
    delete (b as Partial<TypeBatiment>).modele_path;
    expect(() => validerBatiments([b])).toThrow(ValidationError);
    expect(() => validerBatiments([b])).toThrow(/modele_path/);
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

  it("chaque bâtiment a un modele_path commençant par /models/", () => {
    const brut = JSON.parse(
      readFileSync(resolve(ici, "..", "batiments-v1.json"), "utf-8"),
    );
    for (const b of validerBatiments(brut)) {
      expect(b.modele_path).toMatch(/^\/models\//);
    }
  });
});

// --- validerModules ---------------------------------------------------------

describe("validerModules", () => {
  it("accepte une liste valide d'un module", () => {
    expect(() => validerModules([moduleValide()])).not.toThrow();
  });

  it("refuse un module avec modele_path mais sans modele_licence", () => {
    const m: TypeModule = {
      ...moduleValide(),
      modele_path: "/models/Machine_Couture.gltf",
      modele_licence: null,
    };
    expect(() => validerModules([m])).toThrow(/modele_licence/);
  });

  it("refuse un module avec modele_licence mais sans modele_path", () => {
    const m: TypeModule = {
      ...moduleValide(),
      modele_path: null,
      modele_licence: "CC0 - Quaternius",
    };
    expect(() => validerModules([m])).toThrow(/modele_path/);
  });

  it("accepte un module sans modèle 3D (null / null)", () => {
    const m = { ...moduleValide(), modele_path: null, modele_licence: null };
    expect(() => validerModules([m])).not.toThrow();
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

  it("chaque module avec modele_path a aussi modele_licence", () => {
    const brut = JSON.parse(
      readFileSync(resolve(ici, "..", "modules-v1.json"), "utf-8"),
    );
    for (const m of validerModules(brut)) {
      if (m.modele_path !== null) {
        expect(m.modele_licence).not.toBeNull();
      }
    }
  });
});
