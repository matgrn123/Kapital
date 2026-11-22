import { describe, it, expect } from "vitest";
import { etatPourVue3D, type DonneesVue3D } from "./vue3d";

const BASE: DonneesVue3D = {
  tresorerie_centimes: 100_000_00,
  commandes_matieres_en_cours: 0,
  atelier: { surface_m2: 50, nombre_machines: 2 },
  productions_en_cours: 0,
  stock_finis_total_pieces: 20,
  nb_employes: 3,
  marque: { notoriete: 50, desirabilite: 60 },
};

function zone(id: string, donnees: DonneesVue3D) {
  return etatPourVue3D(donnees).find((z) => z.id === id)!;
}

describe("etatPourVue3D — trésorerie", () => {
  it("ok quand au-dessus de 50 000 €", () => {
    expect(zone("tresorerie", { ...BASE, tresorerie_centimes: 60_000_00 }).statut).toBe("ok");
  });

  it("alerte entre 10 000 € et 50 000 €", () => {
    expect(zone("tresorerie", { ...BASE, tresorerie_centimes: 30_000_00 }).statut).toBe("alerte");
  });

  it("rupture en dessous de 10 000 €", () => {
    expect(zone("tresorerie", { ...BASE, tresorerie_centimes: 5_000_00 }).statut).toBe("rupture");
  });

  it("rupture exactement à 0", () => {
    expect(zone("tresorerie", { ...BASE, tresorerie_centimes: 0 }).statut).toBe("rupture");
  });
});

describe("etatPourVue3D — approvisionnement", () => {
  it("info quand des commandes sont en route", () => {
    expect(zone("approvisionnement", { ...BASE, commandes_matieres_en_cours: 2 }).statut).toBe("info");
  });

  it("ok quand aucune commande en cours", () => {
    expect(zone("approvisionnement", { ...BASE, commandes_matieres_en_cours: 0 }).statut).toBe("ok");
  });
});

describe("etatPourVue3D — atelier", () => {
  it("ok quand l'atelier existe", () => {
    expect(zone("atelier", BASE).statut).toBe("ok");
  });

  it("inactif quand pas d'atelier", () => {
    expect(zone("atelier", { ...BASE, atelier: null }).statut).toBe("inactif");
  });

  it("affiche le nombre de machines", () => {
    expect(zone("atelier", BASE).chiffre).toContain("2");
  });
});

describe("etatPourVue3D — production", () => {
  it("ok quand des ordres sont en cours", () => {
    expect(zone("production", { ...BASE, productions_en_cours: 3 }).statut).toBe("ok");
  });

  it("inactif quand aucune production", () => {
    expect(zone("production", { ...BASE, productions_en_cours: 0 }).statut).toBe("inactif");
  });
});

describe("etatPourVue3D — stock produits finis", () => {
  it("ok avec un stock correct", () => {
    expect(zone("stock_finis", { ...BASE, stock_finis_total_pieces: 50 }).statut).toBe("ok");
  });

  it("alerte avec un stock faible (< 10)", () => {
    expect(zone("stock_finis", { ...BASE, stock_finis_total_pieces: 5 }).statut).toBe("alerte");
  });

  it("rupture si stock à 0", () => {
    expect(zone("stock_finis", { ...BASE, stock_finis_total_pieces: 0 }).statut).toBe("rupture");
  });
});

describe("etatPourVue3D — équipe", () => {
  it("ok avec des salariés", () => {
    expect(zone("equipe", { ...BASE, nb_employes: 2 }).statut).toBe("ok");
  });

  it("inactif sans salarié", () => {
    expect(zone("equipe", { ...BASE, nb_employes: 0 }).statut).toBe("inactif");
  });
});

describe("etatPourVue3D — marque", () => {
  it("ok avec une bonne notoriété", () => {
    expect(zone("marque", { ...BASE, marque: { notoriete: 50, desirabilite: 60 } }).statut).toBe("ok");
  });

  it("alerte si notoriété < 20", () => {
    expect(zone("marque", { ...BASE, marque: { notoriete: 10, desirabilite: 40 } }).statut).toBe("alerte");
  });

  it("inactif si pas de marque", () => {
    expect(zone("marque", { ...BASE, marque: null }).statut).toBe("inactif");
  });
});

describe("etatPourVue3D — structure", () => {
  it("retourne exactement 7 zones", () => {
    expect(etatPourVue3D(BASE)).toHaveLength(7);
  });

  it("chaque zone a un id, libelle, statut, chiffre, detail", () => {
    for (const z of etatPourVue3D(BASE)) {
      expect(z).toHaveProperty("id");
      expect(z).toHaveProperty("libelle");
      expect(z).toHaveProperty("statut");
      expect(z).toHaveProperty("chiffre");
      expect(z).toHaveProperty("detail");
    }
  });
});
