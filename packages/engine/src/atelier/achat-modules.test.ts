import { chargerModulesV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { achatModulesAmenagement, ecritureAchatModules } from "./achat-modules.js";
import { enEquilibre, enregistrer, planComptableV1, soldeCompte } from "../comptabilite/index.js";
import { centimes, moisJeu } from "../types/primitifs.js";

const CAT = chargerModulesV1();
const POSTE = CAT.find((m) => m.id === "poste_couture_base")!;
const TABLE = CAT.find((m) => m.id === "table_coupe_simple")!;
const p = (id: string, x: number, y: number) => ({ id_type: id, x, y, pivote: false });

describe("achatModulesAmenagement", () => {
  it("ne fait payer que les modules ajoutés, au prix du catalogue", () => {
    const r = achatModulesAmenagement(
      [p(POSTE.id, 1, 1)],
      [p(POSTE.id, 4, 1), p(POSTE.id, 1, 1), p(TABLE.id, 6, 1)],
      CAT,
    );
    expect(r.ok && r.total).toBe(POSTE.prix_centimes + TABLE.prix_centimes);
  });
  it("déplacer, pivoter ou retirer ne coûte rien", () => {
    const r = achatModulesAmenagement([p(POSTE.id, 1, 1), p(TABLE.id, 3, 1)], [{ ...p(POSTE.id, 5, 2), pivote: true }], CAT);
    expect(r).toEqual({ ok: true, achetes: [], total: 0 });
  });
  it("refuse un module inconnu", () => {
    expect(achatModulesAmenagement([], [p("licorne", 1, 1)], CAT)).toMatchObject({ ok: false, code: "type_inconnu" });
  });
  it("écriture 2154 / 512 équilibrée", () => {
    const gl = enregistrer(planComptableV1(), ecritureAchatModules({ idEcriture: "m", mois: moisJeu(1), montant: centimes(130_000) }));
    expect(enEquilibre(gl)).toBe(true);
    expect(soldeCompte(gl, "2154")).toBe(130_000);
  });
});
