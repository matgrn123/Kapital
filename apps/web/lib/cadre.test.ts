import { describe, it, expect } from "vitest";
import {
  dateDeJeu,
  dateDeJeuDepuisInstant,
  delaiReel,
  finDuMoisDeJeu,
  libelleMoisDeJeu,
  nomCollection,
  positionDeJeuDepuisInstant,
  ventesParJour,
} from "./cadre";

// Un mois de jeu = 1 440 pas (1 jour réel) ; on l'affiche en 30 jours de jeu de 48 min réelles.
// Le monde naît en janvier de l'an 1 (calendrier_mois_depart_monde = 1).
const MIN = 60_000;
const JOUR_JEU = 48 * MIN;
const MOIS_JEU = 1440 * MIN;
const DEBUT = Date.UTC(2026, 10, 1, 8, 0);

describe("dateDeJeu", () => {
  it("donne le jour, le mois calendaire et l'année de jeu", () => {
    expect(dateDeJeu(0, 0, 1440)).toBe("1er janvier, an 1");
    expect(dateDeJeu(10, 47, 1440)).toBe("1er novembre, an 1");
    expect(dateDeJeu(10, 48, 1440)).toBe("2 novembre, an 1");
    expect(dateDeJeu(2, 11 * 48, 1440)).toBe("12 mars, an 1");
    expect(dateDeJeu(3, 1439, 1440)).toBe("30 avril, an 1");
  });

  it("change d'année en janvier", () => {
    expect(dateDeJeu(11, 0, 1440)).toBe("1er décembre, an 1");
    expect(dateDeJeu(12, 0, 1440)).toBe("1er janvier, an 2");
    expect(dateDeJeu(25, 0, 1440)).toBe("1er février, an 3");
  });

  it("reste lisible si le nombre de pas est invalide", () => {
    expect(dateDeJeu(4, 12, 0)).toBe("mai, an 1");
  });

  it("reste lisible si le mois est invalide", () => {
    expect(dateDeJeu(-1, 0, 1440)).toBe("mois -1");
  });
});

describe("libelleMoisDeJeu", () => {
  it("donne le mois calendaire et l'année", () => {
    expect(libelleMoisDeJeu(0)).toBe("janvier, an 1");
    expect(libelleMoisDeJeu(13)).toBe("février, an 2");
  });
});

describe("delaiReel", () => {
  it("annonce un délai à venir", () => {
    expect(delaiReel(48 * MIN)).toBe("dans 48 min");
    expect(delaiReel(3 * 60 * MIN + 5 * MIN)).toBe("dans 3 h 05");
    expect(delaiReel(2 * 60 * MIN)).toBe("dans 2 h");
    expect(delaiReel(3 * 24 * 60 * MIN)).toBe("dans 3 jours");
  });

  it("annonce un délai passé", () => {
    expect(delaiReel(-12 * MIN)).toBe("il y a 12 min");
    expect(delaiReel(-25 * 60 * MIN)).toBe("il y a 1 jour");
  });

  it("dit « à l'instant » sous une minute", () => {
    expect(delaiReel(30_000)).toBe("à l'instant");
    expect(delaiReel(-59_000)).toBe("à l'instant");
  });
});

describe("positionDeJeuDepuisInstant", () => {
  it("place un instant réel dans le mois et le jour de jeu", () => {
    expect(positionDeJeuDepuisInstant(DEBUT + 2 * MOIS_JEU + 11 * JOUR_JEU, DEBUT)).toEqual({ mois: 2, jour: 12 });
  });

  it("place un instant antérieur à la naissance du monde au premier jour", () => {
    expect(positionDeJeuDepuisInstant(DEBUT - MOIS_JEU, DEBUT)).toEqual({ mois: 0, jour: 1 });
  });
});

describe("dateDeJeuDepuisInstant", () => {
  const livraison = DEBUT + 2 * MOIS_JEU + 11 * JOUR_JEU;

  it("donne la date de jeu et le délai réel entre parenthèses", () => {
    expect(dateDeJeuDepuisInstant(livraison, DEBUT, livraison - 48 * MIN)).toBe("12 mars, an 1 (dans 48 min)");
    expect(dateDeJeuDepuisInstant(new Date(livraison).toISOString(), new Date(DEBUT).toISOString(), livraison + 2 * 60 * MIN)).toBe(
      "12 mars, an 1 (il y a 2 h)",
    );
  });

  it("revient à la date réelle quand la naissance du monde est inconnue", () => {
    const texte = dateDeJeuDepuisInstant(livraison, null, livraison);
    expect(texte).not.toMatch(/an 1/);
    expect(texte.length).toBeGreaterThan(0);
  });

  it("ne plante pas sur une date illisible", () => {
    expect(dateDeJeuDepuisInstant("pas une date", DEBUT, DEBUT)).toBe("date inconnue");
  });
});

describe("finDuMoisDeJeu", () => {
  it("donne le dernier jour du mois de jeu et le délai jusqu'à la clôture", () => {
    // Mois 4 (mai) : il se clôt au début du mois 5.
    const maintenant = DEBUT + 5 * MOIS_JEU - 90 * MIN;
    expect(finDuMoisDeJeu(4, DEBUT, maintenant)).toBe("30 mai, an 1 (dans 1 h 30)");
  });

  it("sans naissance du monde connue, donne seulement le mois", () => {
    expect(finDuMoisDeJeu(4, null, DEBUT)).toBe("fin mai, an 1");
  });
});

describe("nomCollection", () => {
  it("nomme la collection et son année de lancement", () => {
    expect(nomCollection({ type: "PE", anneeDebut: 1 })).toBe("printemps-été, an 1");
    expect(nomCollection({ type: "AH", anneeDebut: 0 })).toBe("automne-hiver, an 0");
  });
});

describe("ventesParJour", () => {
  it("divise le chiffre d'affaires du mois par les jours écoulés, arrondi au centime", () => {
    // 10 jours écoulés (index 432 sur 1 440 = 30 %, soit 9 jours pleins + le jour en cours)
    expect(ventesParJour(1_000_00, 432, 1440)).toBe(10_000);
  });

  it("compte le premier jour comme un jour entier", () => {
    expect(ventesParJour(250_00, 0, 1440)).toBe(250_00);
  });

  it("ne descend pas sous zéro (retours plus élevés que les ventes)", () => {
    expect(ventesParJour(-50_00, 100, 1440)).toBe(0);
  });
});
