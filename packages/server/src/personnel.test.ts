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
import { postesALaSignature } from "@kapital/engine";
import { chargerModulesV1 } from "@kapital/content";

const MODULES_CATALOGUE = chargerModulesV1();

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
      ateliers: [{ surfaceM2: 50, loyerMensuel: centimes(100_000), modules: postesALaSignature(1, MODULES_CATALOGUE) }],
      marque: { notoriete: 40, desirabilite: 40 },
      prets: [],
      catalogue: [],
      ...over,
    },
  };
}

describe("3D-3 : embauche sans poste libre", () => {
  const artisan = { type: "embauche", poste: "artisan", salaireBrutMensuel: centimes(200_000) } as const;

  it("est refusée pour un artisan, avec un message qui renvoie à l'écran Atelier", () => {
    // 1 poste posé, 1 artisan déjà en place : plus aucun poste libre.
    const r = validerDecision(ctx(), artisan);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("aucun_poste_libre");
      expect(r.message).toContain("Pose d'abord un poste de travail dans ton atelier");
    }
  });

  it("2 postes posés et 2 artisans : le 3e artisan est refusé", () => {
    const r = validerDecision(
      ctx({
        salaries: [salarie("a"), salarie("b")],
        ateliers: [{ surfaceM2: 50, loyerMensuel: centimes(100_000), modules: postesALaSignature(2, MODULES_CATALOGUE) }],
      }),
      artisan,
    );
    expect(r.ok).toBe(false);
  });

  it("aucun module posé : même le premier artisan est refusé", () => {
    const r = validerDecision(
      ctx({ salaries: [], ateliers: [{ surfaceM2: 50, loyerMensuel: centimes(100_000), modules: [] }] }),
      artisan,
    );
    expect(r.ok).toBe(false);
  });

  it("un poste libre : l'artisan est accepté", () => {
    const r = validerDecision(
      ctx({ ateliers: [{ surfaceM2: 50, loyerMensuel: centimes(100_000), modules: postesALaSignature(2, MODULES_CATALOGUE) }] }),
      artisan,
    );
    expect(r.ok).toBe(true);
  });

  it("3D-7 : les postes libres se comptent sur tous les locaux", () => {
    const local = (id: string) => ({ id, surfaceM2: 50, loyerMensuel: centimes(100_000), modules: postesALaSignature(1, MODULES_CATALOGUE) });
    // 2 locaux d'un poste, 1 artisan : un poste libre dans le 2e local.
    expect(validerDecision(ctx({ ateliers: [local("w1"), local("w2")] }), artisan).ok).toBe(true);
    // 2 locaux d'un poste, 2 artisans : plus rien de libre.
    expect(
      validerDecision(ctx({ salaries: [salarie("a"), salarie("b")], ateliers: [local("w1"), local("w2")] }), artisan).ok,
    ).toBe(false);
  });

  it("un encadrant n'occupe pas de poste : il reste embauchable", () => {
    const r = validerDecision(ctx(), { type: "embauche", poste: "encadrement", salaireBrutMensuel: centimes(300_000) });
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
      expect(r.message).toContain("1 000,00 €");
      expect(r.message).toContain("700,00 €");
    }
  });

  it("accepte quand la trésorerie couvre l'indemnité", () => {
    const c = ctx({ salaries: [salarie("vieux", { ancienneteMois: 24 })], tresorerie: centimes(100_000) });
    expect(validerDecision(c, { type: "licenciement", salarie: idSalarie("vieux") }).ok).toBe(true);
  });
});
