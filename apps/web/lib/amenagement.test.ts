import { describe, expect, it } from "vitest";
import { chargerModulesV1 } from "@kapital/content";
import { deciderAmenagement } from "./amenagement";

const CAT = chargerModulesV1();
const POSTE = CAT.find((m) => m.id === "poste_couture_base")!;
const GRILLE = { largeur_grille: 10, hauteur_grille: 5, entree_x: 0, entree_y: 3 };
const m = (x: number, y: number) => ({ module_type_id: POSTE.id, x, y, pivote: false });

describe("deciderAmenagement", () => {
  it("accepte un plan valide et fait payer le module ajouté", () => {
    const r = deciderAmenagement({ grille: GRILLE, ancien: [], nouveau: [m(2, 1)], catalogue: CAT, tresorerie: 10_000_000 });
    expect(r).toEqual({ ok: true, cout: POSTE.prix_centimes });
  });
  it("compte à partir de 1 : un module en x = 0 dépasse de l'atelier", () => {
    const r = deciderAmenagement({ grille: GRILLE, ancien: [], nouveau: [m(0, 1)], catalogue: CAT, tresorerie: 10_000_000 });
    expect(r).toMatchObject({ ok: false, code: "plan_invalide" });
    if (!r.ok) expect(r.message).toMatch(/dépasse/);
  });
  it("refuse deux modules qui se chevauchent", () => {
    const r = deciderAmenagement({ grille: GRILLE, ancien: [], nouveau: [m(2, 1), m(3, 2)], catalogue: CAT, tresorerie: 10_000_000 });
    expect(r).toMatchObject({ ok: false, code: "plan_invalide" });
  });
  it("refuse si la trésorerie ne couvre pas les modules ajoutés, manque chiffré", () => {
    const r = deciderAmenagement({ grille: GRILLE, ancien: [], nouveau: [m(2, 1)], catalogue: CAT, tresorerie: POSTE.prix_centimes - 100 });
    expect(r).toMatchObject({ ok: false, code: "tresorerie_insuffisante" });
    if (!r.ok) expect(r.message).toMatch(/il manque 1,00 €/);
  });
  it("déplacer un module déjà payé ne coûte rien", () => {
    const r = deciderAmenagement({ grille: GRILLE, ancien: [m(2, 1)], nouveau: [m(6, 3)], catalogue: CAT, tresorerie: 0 });
    expect(r).toEqual({ ok: true, cout: 0 });
  });
});
