import { describe, expect, it } from "vitest";
import { localAffiche, localVise, salariesDuLocal } from "./locaux";

const A = { id: "wA", mode_detention: "bail" };
const B = { id: "wB", mode_detention: "credit" };
const C = { id: "wC", mode_detention: "bail" };

describe("3D-7 : local visé par un congé", () => {
  it("le local demandé, s'il est à la société", () => {
    expect(localVise([A, C], "wC")).toEqual({ ok: true, id: "wC" });
    expect(localVise([A], "wZ")).toMatchObject({ ok: false, code: "aucun_local" });
  });

  it("sans précision : le seul local loué, refus s'il y en a plusieurs ou aucun", () => {
    expect(localVise([A, B])).toEqual({ ok: true, id: "wA" });
    expect(localVise([A, C])).toMatchObject({ ok: false, code: "local_a_preciser" });
    expect(localVise([B])).toMatchObject({ ok: false, code: "aucun_local" });
    expect(localVise([])).toMatchObject({ ok: false, code: "aucun_local" });
  });
});

describe("3D-7 : local affiché (?local=<id>)", () => {
  it("celui demandé, sinon le plus ancien, sinon aucun", () => {
    expect(localAffiche([A, B], "wB")).toBe(B);
    expect(localAffiche([A, B], "inconnu")).toBe(A);
    expect(localAffiche([A, B], null)).toBe(A);
    expect(localAffiche([], "wA")).toBeNull();
  });
});

describe("3D-7 : salariés dessinés dans chaque local", () => {
  const s = (id: string, poste = "artisan") => ({ id, poste });
  const equipe = [s("a"), s("b"), s("chef", "encadrement"), s("c"), s("d")];

  it("les artisans remplissent les postes local par local ; le surplus et l'encadrement restent au premier", () => {
    expect(salariesDuLocal(equipe, [2, 1], 0).map((x) => x.id)).toEqual(["a", "b", "d", "chef"]);
    expect(salariesDuLocal(equipe, [2, 1], 1).map((x) => x.id)).toEqual(["c"]);
  });

  it("un seul local : tout le monde, comme avant", () => {
    expect(salariesDuLocal(equipe, [2], 0)).toHaveLength(equipe.length);
  });
});
