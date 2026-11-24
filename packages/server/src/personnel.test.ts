import {
  centimes,
  idEntreprise,
  idSalarie,
  type Entreprise,
  type Salarie,
} from "@kapital/engine";
import { describe, expect, it } from "vitest";
import { validerDecision } from "./validerDecision.js";
import type { ContexteValidation } from "./types.js";

function salarie(id: string, over: Partial<Salarie> = {}): Salarie {
  return {
    id: idSalarie(id),
    poste: "artisan",
    salaireBrutMensuel: centimes(200_000),
    ancienneteMois: 0,
    experienceMois: 0,
    ...over,
  };
}

function ctx(over: Partial<Entreprise> = {}): ContexteValidation {
  return {
    entreprise: {
      id: idEntreprise("ent_test"),
      nom: "Test",
      gamme: "milieu",
      etape: 2,
      proprietaire: { type: "joueur", idProfil: "p" },
      statut: "active",
      tresorerie: centimes(2_000_000),
      stocksMatiere: [],
      stocksFinis: [],
      salaries: [salarie("a")],
      atelier: { surfaceM2: 50, loyerMensuel: centimes(100_000), nombreMachines: 1 },
      marque: { notoriete: 40, desirabilite: 40 },
      prets: [],
      catalogue: [],
      ...over,
    },
  };
}

describe("AE-7 : embauche sans poste libre", () => {
  it("est acceptée (le salarié sera payé) : le moteur l'écarte de la production", () => {
    // 1 machine, 1 artisan déjà en place : plus aucun poste libre.
    const r = validerDecision(ctx(), { type: "embauche", poste: "artisan", salaireBrutMensuel: centimes(200_000) });
    expect(r.ok).toBe(true);
  });
});

describe("AE-7 : licenciement et indemnité", () => {
  it("accepte un débutant sans indemnité, même sans trésorerie", () => {
    const r = validerDecision(ctx({ tresorerie: centimes(0) }), { type: "licenciement", salarie: idSalarie("a") });
    expect(r.ok).toBe(true);
  });

  it("refuse en chiffrant l'indemnité si la trésorerie ne la couvre pas", () => {
    const c = ctx({ salaries: [salarie("vieux", { ancienneteMois: 24 })], tresorerie: centimes(30_000) });
    const r = validerDecision(c, { type: "licenciement", salarie: idSalarie("vieux") });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("tresorerie_insuffisante");
      expect(r.message).toContain("1000,00 €");
      expect(r.message).toContain("700,00 €");
    }
  });

  it("accepte quand la trésorerie couvre l'indemnité", () => {
    const c = ctx({ salaries: [salarie("vieux", { ancienneteMois: 24 })], tresorerie: centimes(100_000) });
    expect(validerDecision(c, { type: "licenciement", salarie: idSalarie("vieux") }).ok).toBe(true);
  });
});
