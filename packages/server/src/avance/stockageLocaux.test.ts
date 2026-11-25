import { chargerModulesV1 } from "@kapital/content";
import { centimes, postesEquipesAteliers } from "@kapital/engine";
import { describe, expect, it } from "vitest";
import {
  atelierDepuisLigne,
  materielDepuisLedger,
  materielParLocal,
  modulesDepuisLignes,
  type LigneWorkshop,
} from "./stockageSupabase.js";

// 3D-7 : chargerEtat lit tous les locaux de la société et répartit le matériel (2154 / 2815).

const CATALOGUE = chargerModulesV1();

function ligne(o: Partial<LigneWorkshop> & { id: string }): LigneWorkshop {
  return {
    surface_m2: 50,
    loyer_mensuel_centimes: 100_000,
    placed_modules: [
      { module_type_id: "poste_couture_base", x: 2, y: 1, pivote: false, statut: "actif" },
      { module_type_id: "poste_couture_base", x: 5, y: 1, pivote: false, statut: "actif" },
      { module_type_id: "poste_couture_base", x: 8, y: 1, pivote: false, statut: "prevu" },
    ],
    depot_garantie_centimes: 100_000,
    charges_mensuelles_centimes: 30_000,
    mois_signature: 2,
    mois_fin: null,
    mode_detention: "bail",
    prix_achat_centimes: 0,
    apport_centimes: 0,
    mois_achat: null,
    duree_amortissement_mois: null,
    ...o,
  };
}

describe("3D-7 : matériel réparti entre les locaux", () => {
  const lignes = [
    { ecriture_id: "amenagement_wA_123", compte: "2154", sens: "debit", montant_centimes: 60_000 },
    { ecriture_id: "amenagement_wB_456", compte: "2154", sens: "debit", montant_centimes: 40_000 },
    { ecriture_id: "amort_4_ent_wB", compte: "2815", sens: "credit", montant_centimes: 1_000 },
    // Écriture d'avant 3D-7 (sans id de local) : au plus ancien local.
    { ecriture_id: "amort_3_ent", compte: "2815", sens: "credit", montant_centimes: 2_000 },
  ];

  it("chaque écriture revient au local dont elle porte l'id, les anciennes au plus ancien", () => {
    const m = materielParLocal(lignes, ["wA", "wB"]);
    expect(m.get("wA")).toEqual({ valeurBrute: 60_000, amortissementsCumules: 2_000 });
    expect(m.get("wB")).toEqual({ valeurBrute: 40_000, amortissementsCumules: 1_000 });
  });

  it("un seul local : tout le matériel, comme avant 3D-7", () => {
    expect(materielParLocal(lignes, ["wA"]).get("wA")).toEqual(materielDepuisLedger(lignes));
  });

  it("aucun local : rien", () => {
    expect(materielParLocal(lignes, []).size).toBe(0);
  });
});

describe("3D-7 : locaux lus en base", () => {
  it("un local loué garde son id, son bail et ses seuls modules en service", () => {
    const w = ligne({ id: "wA" });
    const a = atelierDepuisLigne(w, modulesDepuisLignes(w.placed_modules, CATALOGUE), { valeurBrute: centimes(0), amortissementsCumules: centimes(0) });
    expect(a.id).toBe("wA");
    expect(a.loyerMensuel).toBe(100_000);
    expect(a.bail?.depotGarantie).toBe(100_000);
    expect(a.achat).toBeUndefined();
    expect(a.modules).toHaveLength(2);
  });

  it("un local acheté n'a pas de loyer ; la capacité additionne les postes des deux locaux", () => {
    const wA = ligne({ id: "wA" });
    const wB = ligne({ id: "wB", mode_detention: "credit", prix_achat_centimes: 9_000_000, apport_centimes: 3_000_000, mois_achat: 4, duree_amortissement_mois: 240 });
    const vide = { valeurBrute: centimes(0), amortissementsCumules: centimes(0) };
    const ateliers = [wA, wB].map((w) => atelierDepuisLigne(w, modulesDepuisLignes(w.placed_modules, CATALOGUE), vide));
    expect(ateliers[1]!.loyerMensuel).toBe(0);
    expect(ateliers[1]!.achat?.prixAchat).toBe(9_000_000);
    expect(postesEquipesAteliers(ateliers)).toBe(4);
  });
});
