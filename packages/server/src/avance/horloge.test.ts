import { chargerParametresV1 } from "@kapital/content";
import { heureLocaleParis, indexDuMois } from "@kapital/engine";
import { describe, expect, it } from "vitest";
import { lireHorloge } from "./horloge.js";
import { StockageMemoire } from "./stockageMemoire.js";

const PARAMS = chargerParametresV1();
const MIN = 60_000;
const NOVEMBRE_2026 = indexDuMois(2026, 11);
// Jeudi 26 novembre 2026, 10 h 21 à Paris
const MAINTENANT = Date.parse("2026-11-26T09:21:00Z");

describe("lireHorloge", () => {
  it("l'heure du jeu est l'heure réelle : deux lecteurs au même instant voient la même date", async () => {
    const s = new StockageMemoire({ id: "m", moisCourant: NOVEMBRE_2026, debutReelMs: 0 });
    const [a, b] = await Promise.all([lireHorloge(s, PARAMS, MAINTENANT), lireHorloge(s, PARAMS, MAINTENANT)]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({
      actif: true,
      horloge: { moisEnCours: NOVEMBRE_2026, indexDansMois: 25 * 1440 + 621, pasTermines: MAINTENANT / MIN },
    });
    if (!a.actif) throw new Error("horloge attendue");
    expect(heureLocaleParis(a.horloge.heureJeuMs)).toMatchObject({ jour: 26, heure: 10, minute: 21 });
  });

  it("l'horloge avance avec le temps du serveur, rien d'autre", async () => {
    const s = new StockageMemoire({ id: "m", moisCourant: NOVEMBRE_2026, debutReelMs: 0 });
    const t1 = await lireHorloge(s, PARAMS, MAINTENANT);
    const t2 = await lireHorloge(s, PARAMS, MAINTENANT + MIN);
    expect(t1).toMatchObject({ horloge: { pasTermines: MAINTENANT / MIN } });
    expect(t2).toMatchObject({ horloge: { pasTermines: MAINTENANT / MIN + 1 } });
  });

  it("un monde sans origine d'horloge, ou encore sur l'ancien compteur de mois, n'a pas d'horloge", async () => {
    const sansOrigine = new StockageMemoire({ id: "m", moisCourant: NOVEMBRE_2026, debutReelMs: null });
    expect(await lireHorloge(sansOrigine, PARAMS, MAINTENANT)).toEqual({ actif: false, moisCourant: NOVEMBRE_2026 });
    const ancien = new StockageMemoire({ id: "m", moisCourant: 11, debutReelMs: MAINTENANT - 11 * 1440 * MIN });
    expect(await lireHorloge(ancien, PARAMS, MAINTENANT)).toEqual({ actif: false, moisCourant: 11 });
  });
});
