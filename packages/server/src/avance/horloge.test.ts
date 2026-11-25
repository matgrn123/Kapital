import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { lireHorloge } from "./horloge.js";
import { StockageMemoire } from "./stockageMemoire.js";

const PARAMS = chargerParametresV1();
const MIN = 60_000;
const JOUR = 24 * 60 * MIN;
const DEBUT = Date.UTC(2026, 10, 1, 8, 0, 0);

describe("lireHorloge", () => {
  it("deux lecteurs au même instant voient la même date de jeu", async () => {
    const s = new StockageMemoire({ id: "m", moisCourant: 0, debutReelMs: DEBUT });
    const maintenant = DEBUT + 3 * JOUR + 7 * MIN;
    const [a, b] = await Promise.all([
      lireHorloge(s, PARAMS, maintenant),
      lireHorloge(s, PARAMS, maintenant),
    ]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({
      actif: true,
      horloge: { moisEnCours: 3, indexDansMois: 7, pasTermines: 3 * 1440 + 7 },
    });
  });

  it("l'horloge avance avec le temps du serveur, rien d'autre", async () => {
    const s = new StockageMemoire({ id: "m", moisCourant: 0, debutReelMs: DEBUT });
    const t1 = await lireHorloge(s, PARAMS, DEBUT + 10 * MIN);
    const t2 = await lireHorloge(s, PARAMS, DEBUT + 11 * MIN);
    expect(t1).toMatchObject({ horloge: { pasTermines: 10 } });
    expect(t2).toMatchObject({ horloge: { pasTermines: 11 } });
  });

  it("un ancien monde non initialisé n'a pas encore d'horloge commune", async () => {
    const s = new StockageMemoire({ id: "m", moisCourant: 5, debutReelMs: null });
    expect(await lireHorloge(s, PARAMS, DEBUT)).toEqual({ actif: false, moisCourant: 5 });
  });
});
