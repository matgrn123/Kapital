import { describe, it, expect } from "vitest";
import { cadrerBoite } from "./cadrage";

const boite = { min: [-40, 0, -25] as [number, number, number], max: [45, 28, 12] as [number, number, number] };

describe("cadrerBoite", () => {
  it("vise le centre de la boîte", () => {
    const c = cadrerBoite(boite, 40, 16 / 9);
    expect(c.cible).toEqual([2.5, 14, -6.5]);
  });

  it("place la caméra en surplomb, assez loin pour tout voir", () => {
    const c = cadrerBoite(boite, 40, 16 / 9);
    const dx = c.position[0] - c.cible[0];
    const dy = c.position[1] - c.cible[1];
    const dz = c.position[2] - c.cible[2];
    const d = Math.hypot(dx, dy, dz);
    const rayon = Math.hypot(85, 28, 37) / 2;
    // la sphère englobante tient dans le champ vertical et horizontal
    expect(rayon / d).toBeLessThanOrEqual(Math.sin((40 * Math.PI) / 360) + 1e-9);
    expect(dy).toBeGreaterThan(0);
    expect(c.distance).toBeCloseTo(d, 6);
  });

  it("recule davantage sur un écran étroit (portrait)", () => {
    const large = cadrerBoite(boite, 40, 16 / 9);
    const etroit = cadrerBoite(boite, 40, 0.6);
    expect(etroit.distance).toBeGreaterThan(large.distance);
  });
});
